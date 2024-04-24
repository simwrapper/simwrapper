<template lang="pug">
.h5-map-viewer
  .left-bar
    .top-half.flex1
      .zone-details
        p.h5-filename {{  filenameH5 }}
        .scrolly
          .h5-table(v-for="table in tableKeys" :key="table.key"
            :class="{'selected-table': table == activeTable}"
            @click="clickedTable(table)"
          )
            i.fa.fa-layer-group
            |&nbsp;&nbsp;{{ table.key }}&nbsp;&nbsp;{{ table.name}}

    .bottom-half.flex1
      .zone-details(v-if="activeZone !== null")
        b.zone-header {{ mapConfig.isRowWise ? 'Row' : 'Column' }} {{  activeZone }}
        .titles.matrix-data-value
          b.zone-number {{ mapConfig.isRowWise ? 'Column' : 'Row' }}
          b.zone-value  {{  activeTable.name || `Table ${activeTable.key}` }}
        .scrolly
          .matrix-data-value(v-for="value,i in prettyDataArray" :key="i")
            span.zone-number {{  i+1 }}
            span.zone-value {{  value }}

  .right-container.fill-it
    .map-holder(oncontextmenu="return false")

      zone-layer.zone-layer.fill-it(
        :viewId="layerId"
        :features="features"
        :clickedZone="clickedZone"
        :activeZoneFeature="features[tazToOffsetLookup[activeZone]]"
        :cbTooltip="showTooltip"
      )

      background-map-on-top(v-if="isMapReady")

      zoom-buttons

      .tooltip-area(v-if="tooltip" v-html="tooltip")


</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import { Dataset, File as H5WasmFile, Group as H5WasmGroup, ready as h5wasmReady } from 'h5wasm'
import { nanoid } from 'nanoid'
import { rgb } from 'd3-color'
import { scaleThreshold } from 'd3-scale'
import naturalSort from 'javascript-natural-sort'

import globalStore from '@/store'
import { gUnzip } from '@/js/util'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import {
  DEFAULT_PROJECTION,
  REACT_VIEW_HANDLES,
  FileSystemConfig,
  VisualizationPlugin,
} from '@/Globals'

import BackgroundMapOnTop from '@/components/BackgroundMapOnTop.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { Style, buildRGBfromHexCodes, getColorRampHexCodes } from '@/js/ColorsAndWidths'

import ZoneLayer from './ZoneLayer'
import { MapConfig, ZoneSystems } from './MatrixViewer.vue'
import dataScalers from './util'

const BASE_URL = import.meta.env.BASE_URL

naturalSort.insensitive = true

const PLUGINS_PATH = '/plugins' // path to plugins on EMScripten virtual file system

const MyComponent = defineComponent({
  name: 'H5MapViewer',
  components: { ZoneLayer, BackgroundMapOnTop, ZoomButtons },
  props: {
    fileApi: { type: Object as PropType<HTTPFileSystem> },
    buffer: { type: ArrayBuffer, required: true },
    diffBuffer: { type: ArrayBuffer, required: false },
    subfolder: String,
    config: String,
    thumbnail: Boolean,
    filenameH5: String,
    filenameShapes: String,
    filenameBase: String,
    isInvertedColor: Boolean,
    shapes: { type: Array, required: false },
    mapConfig: { type: Object as PropType<MapConfig>, required: true },
    zoneSystems: { type: Object as PropType<ZoneSystems>, required: true },
    userSuppliedZoneID: String,
  },

  data() {
    return {
      globalState: globalStore.state,
      activeTable: null as null | { key: string; name: string },
      activeZone: null as any,
      dataArray: [] as number[],
      features: [] as any,
      h5wasm: null as null | Promise<any>,
      h5zoneFile: null as null | H5WasmFile,
      h5diffFile: null as null | H5WasmFile,
      h5file: null as any,
      isMapReady: false,
      layerId: Math.floor(1e12 * Math.random()),
      prettyDataArray: [] as string[],
      statusText: 'Loading...',
      tableKeys: [] as { key: string; name: string }[],
      tazToOffsetLookup: {} as { [taz: string]: any },
      tooltip: '',
      useConfig: '',
      zoneID: 'TAZ',
      matrixSize: 0,
    }
  },

  beforeDestroy() {
    // MUST delete the React view handles to prevent gigantic memory leaks!
    delete REACT_VIEW_HANDLES[this.layerId]
    this.h5file = null
    this.h5wasm = null
  },

  async mounted() {
    // Load H5Wasm library and matrix file
    this.h5wasm = this.initH5Wasm()

    if (!this.h5zoneFile) {
      this.h5zoneFile = await this.initFile(this.buffer)
      this.getFileKeysAndProperties()
    }

    // Load GeoJSON features
    await this.setupBoundaries()

    // DIFF mode ?
    if (this.diffBuffer) this.activateDiffMode()
  },

  computed: {},

  watch: {
    'globalState.viewState'() {
      if (!this.isMapReady) return
      if (!REACT_VIEW_HANDLES[this.layerId]) return

      REACT_VIEW_HANDLES[this.layerId]()

      const { latitude, longitude, zoom, bearing, pitch } = this.globalState.viewState
      localStorage.setItem(
        'H5MapViewer_view',
        JSON.stringify({ latitude, longitude, zoom, bearing, pitch })
      )
    },

    diffBuffer() {
      this.activateDiffMode()
    },

    'globalState.isDarkMode'() {
      // this.embedChart()
    },
    'globalState.resizeEvents'() {
      // this.changeDimensions()
    },

    activeTable() {
      this.extractH5ArrayData()
    },
    // subfolder() {},
    filenameShapes() {
      this.loadBoundaries(this.filenameShapes || '')
      this.buildTAZLookup()
    },
    'mapConfig.isRowWise'() {
      this.extractH5ArrayData()
    },
    'mapConfig.colormap'() {
      this.setColorsForArray()
    },
    'mapConfig.isInvertedColor'() {
      this.setColorsForArray()
    },
    'mapConfig.scale'() {
      this.setColorsForArray()
    },
  },

  methods: {
    async activateDiffMode() {
      if (this.diffBuffer) {
        this.h5diffFile = await this.initFile(this.diffBuffer)
      } else {
        this.h5diffFile = null
      }

      this.h5zoneFile = await this.initFile(this.buffer)
      this.getFileKeysAndProperties()
    },

    async setupBoundaries() {
      if (this.shapes) {
        // Shapes may already be dropped in from drag/drop
        this.features = this.shapes
        this.zoneID = this.userSuppliedZoneID || 'TAZ'
      } else if (this.filenameShapes) {
        // We have a filename from the configbar, load that file
        await this.loadBoundaries(this.filenameShapes)
      } else {
        // We need to guess shapefile based on matrix size
        await this.loadBoundariesBasedOnMatrixSize()
      }

      this.buildTAZLookup()
      this.setMapCenter()

      const taz1 = this.tazToOffsetLookup['1']
      this.clickedZone({ index: taz1, properties: this.features[taz1].properties })

      this.isMapReady = true
    },

    showTooltip(props: { index: number; object: any }) {
      const { index, object } = props
      const id = object?.properties[this.zoneID]

      if (id === undefined) {
        this.tooltip = ''
        return
      }

      let html = [] as any[]

      //TODO fix this!
      const value = this.dataArray[id - 1]
      const tableName = this.activeTable?.name || this.activeTable?.key || 'Value'

      if (this.mapConfig.isRowWise) {
        html.push(`<p><b>Row ${this.activeZone} Col ${id}</b></p>`)
      } else {
        html.push(`<p><b>Row ${id} Col ${this.activeZone}</b></p>`)
      }

      html.push(`<p>${tableName} ${value}</p>`)

      this.tooltip = html.join('\n')
    },

    setMapCenter() {
      const previousView = localStorage.getItem('H5MapViewer_view')
      if (previousView) {
        this.$store.commit('setMapCamera', JSON.parse(previousView))
        return
      }

      // If we have no map center, create one
      const aFewFeatures = [
        this.features[0],
        this.features[Math.floor(length / 2)],
        this.features[this.features.length - 1],
      ]

      // get first coordinate of each feature, average them
      const points = aFewFeatures
        .map(f => {
          const geom = f.geometry.coordinates
          if (Number.isFinite(geom[0][0])) return geom[0]
          if (Number.isFinite(geom[0][0][0])) return geom[0][0]
          if (Number.isFinite(geom[0][0][0][0])) return geom[0][0][0]
        })
        .reduce((a, b) => [a[0] + b[0], a[1] + b[1]], [0, 0])
        .map((p: number) => p / aFewFeatures.length)
      this.$store.commit('setMapCamera', { longitude: points[0], latitude: points[1], zoom: 7 })
    },

    buildTAZLookup() {
      this.tazToOffsetLookup = {}
      for (let i = 0; i < this.features.length; i++) {
        const feature = this.features[i]
        if (this.zoneID in feature.properties) {
          this.tazToOffsetLookup[feature.properties[this.zoneID]] = i
        } else {
          console.warn(`FEATURE ${i} missing ${this.zoneID}`, feature)
        }
      }
    },

    getFileKeysAndProperties() {
      if (!this.h5zoneFile) return

      // first get the keys
      const keys = this.h5zoneFile.keys()
      // pretty sort the numbers the ways humans like them
      keys.sort((a: any, b: any) => naturalSort(a, b))
      this.tableKeys = keys.map(key => {
        return { key, name: '' }
      })

      // if there are "name" properties, add them
      for (const table of this.tableKeys) {
        const element = this.h5zoneFile.get(table.key) as Dataset
        const name = element?.attrs['name']?.value as string
        table.name = name || ''
      }

      // Get first matrix dimension, for guessing a useful/correct shapefile
      if (this.tableKeys.length) {
        this.activeTable = this.tableKeys[0]
        const element = this.h5zoneFile.get(this.tableKeys[0].key) as Dataset
        const shape = element.shape
        this.matrixSize = shape[0]
      }
    },

    async initFile(buffer: ArrayBuffer): Promise<H5WasmFile> {
      const h5Module = await this.h5wasm

      // Write HDF5 file to Emscripten virtual file system
      // https://emscripten.org/docs/api_reference/Filesystem-API.html#FS.writeFile
      const id = nanoid() // use unique ID instead of `this.filepath` to avoid slashes and other unsupported characters
      h5Module.FS.writeFile(id, new Uint8Array(buffer), { flags: 'w+' })

      return new H5WasmFile(id, 'r')
    },

    async initH5Wasm(): Promise<any> {
      const module = await h5wasmReady

      // Throw HDF5 errors instead of just logging them
      module.activate_throwing_error_handler()

      // Replace default plugins path
      module.remove_plugin_search_path(0)
      module.insert_plugin_search_path(PLUGINS_PATH, 0)

      // Create plugins folder on Emscripten virtual file system
      module.FS.mkdirTree(PLUGINS_PATH)

      return module
    },

    extractH5ArrayData() {
      // the file has the data, and we want it
      if (!this.h5zoneFile) return
      // User should have selected a zone already
      if (this.activeZone == null) return

      const key = `/${this.activeTable?.key}`
      let data = this.h5zoneFile.get(key) as Dataset

      //TODO FIX THIS
      let offset = this.activeZone - 1

      try {
        let values = [] as number[]
        if (data) {
          values = (
            this.mapConfig.isRowWise
              ? data.slice([[offset, offset + 1], []])
              : data.slice([[], [offset, offset + 1]])
          ) as number[]
        }

        // DIFF MODE
        if (this.h5diffFile) {
          let diffData = this.h5diffFile.get(key) as Dataset
          let baseValues = [] as number[]
          if (diffData) {
            baseValues = (
              this.mapConfig.isRowWise
                ? diffData.slice([[offset, offset + 1], []])
                : diffData.slice([[], [offset, offset + 1]])
            ) as number[]
          }
          // do the diff
          values = values.map((v, i) => v - baseValues[i])
        }

        this.dataArray = values
        this.setColorsForArray()
        this.setPrettyValuesForArray()
      } catch (e) {
        console.warn('Offset not found in HDF5 file:', offset)
      }
    },

    setPrettyValuesForArray() {
      const pretty = [] as any[]
      this.dataArray.forEach(v => {
        if (Number.isNaN(v)) pretty.push('NaN')
        else if (v == 0) pretty.push('0')
        else if (Math.abs(v) >= 0.0001) {
          const trimmed = Math.round(10000 * v) / 10000
          pretty.push('' + trimmed)
        } else {
          pretty.push(v.toExponential(3))
        }
      })
      this.prettyDataArray = pretty
    },

    clickedTable(table: { key: string; name: string }) {
      console.log('click!', table)
      this.activeTable = table
    },

    clickedZone(zone: { index: number; properties: any }) {
      console.log('ZONE', zone)

      // ignore double clicks and same-clicks
      if (zone.properties[this.zoneID] == this.activeZone) return

      this.activeZone = zone.properties[this.zoneID]
      this.extractH5ArrayData()
    },

    setColorsForArray() {
      const values = this.dataArray
      const min = Math.min(...values)
      const max = Math.max(...values)

      const NUM_COLORS = 15

      // use the scale selection (linear, log, etc) to calculation breakpoints 0.0-1.0, independent of data
      const breakpoints = dataScalers[this.mapConfig.scale](NUM_COLORS)

      const colors = getColorRampHexCodes(
        { ramp: this.mapConfig.colormap, style: Style.sequential },
        NUM_COLORS
      )
      if (this.mapConfig.isInvertedColor) colors.reverse()
      const colorsAsRGB = buildRGBfromHexCodes(colors)

      // console.log({ colorsAsRGB, breakpoints })

      // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
      // *range* is the list of colors;
      // *domain* is the list of breakpoints (usually 0.0-1.0 continuum or zero-centered)
      const setColorBasedOnValue: any = scaleThreshold().range(colorsAsRGB).domain(breakpoints)

      for (let i = 0; i < this.features.length; i++) {
        try {
          const TAZ = this.features[i].properties[this.zoneID]

          //TODO - this assumes zones are off-by-one, in order, in matrix data
          const matrixOffset = TAZ - 1

          const value = values[matrixOffset] / max
          const color = Number.isNaN(value) ? [40, 40, 40] : setColorBasedOnValue(value)
          this.features[i].properties.color = color || [40, 40, 40]
        } catch (e) {
          console.warn('BAD', i, this.features[i].properties)
          this.features[i].properties.color = [40, 40, 40]
        }
      }
      // Tell vue this is new
      this.features = [...this.features]
    },

    async loadBoundariesBasedOnMatrixSize() {
      const zoneSystem = this.zoneSystems.bySize[this.matrixSize]
      if (!zoneSystem) {
        console.error('NOOOO UNKNOWN MATRIX SIZE')
        return []
      }

      console.log('ZONE SYSTEM', zoneSystem)
      // which column has the TAZ ID
      this.zoneID = zoneSystem.lookup

      await this.loadBoundaries(zoneSystem.url)
    },

    async loadBoundaries(url: string) {
      const shapeConfig = url

      if (!shapeConfig) return

      let boundaries: any[] = []

      try {
        this.statusText = 'Loading map features...'
        await this.$nextTick()

        if (shapeConfig.startsWith('http')) {
          // geojson from url!
          boundaries = (await fetch(shapeConfig).then(async r => await r.json())).features
        } else if (shapeConfig.toLocaleLowerCase().endsWith('.shp')) {
          // shapefile!
          boundaries = await this.loadShapefileFeatures(shapeConfig)
        } else if (shapeConfig.startsWith('/')) {
          // hard-coded shapefile from /public folder, special treatment
          const localPath = BASE_URL + url.substring(1) // no double-slash at beginning
          console.log('LOADING LOCAL geojson:', localPath)
          const blob = await fetch(localPath).then(async r => await r.blob())
          const buffer = await blob.arrayBuffer()
          const rawtext = gUnzip(buffer)
          const text = new TextDecoder('utf-8').decode(rawtext)
          const json = JSON.parse(text)
          boundaries = json.features
        } else {
          // geojson from simwrapper filesystem!
          if (!this.fileApi) return []
          const path = `${this.subfolder}/${shapeConfig}`
          console.log('LOADING geojson:', path)
          boundaries = (await this.fileApi.getFileJson(path)).features
        }

        this.moveLogo()
        this.features = boundaries
      } catch (e) {
        const err = e as any
        const message = err.statusText || 'Could not load'
        const fullError = `${message}: "${shapeConfig}"`
        this.$emit('error', fullError)
        this.$emit('isLoaded')
        this.statusText = ''
      }

      if (!this.features) throw Error(`No "features" found in shapes file`)
    },

    async loadShapefileFeatures(filename: string) {
      if (!this.fileApi) return []

      this.statusText = 'Loading shapefile...'
      console.log('loading', filename)

      const url = `${this.subfolder}/${filename}`

      // first, get shp/dbf files
      let geojson: any = {}
      try {
        const shpPromise = this.fileApi.getFileBlob(url)
        const dbfFilename = url
          .replace('.shp', '.dbf')
          .replace('.SHP', '.DBF')
          .replace('.Shp', '.Dbf')
        const dbfPromise = this.fileApi.getFileBlob(dbfFilename)
        await Promise.all([shpPromise, dbfPromise])

        const shpBlob = await (await shpPromise)?.arrayBuffer()
        const dbfBlob = await (await dbfPromise)?.arrayBuffer()
        if (!shpBlob || !dbfBlob) return []

        this.statusText = 'Generating shapes...'

        geojson = await shapefile.read(shpBlob, dbfBlob)

        // filter out features that don't have geometry: they can't be mapped
        geojson.features = geojson.features.filter((f: any) => !!f.geometry)
      } catch (e) {
        console.error(e)
        this.$emit('error', '' + e)
        return []
      }

      // geojson.features = geojson.features.slice(0, 10000)

      // See if there is a .prj file with projection information
      let projection = DEFAULT_PROJECTION
      const prjFilename = url
        .replace('.shp', '.prj')
        .replace('.SHP', '.PRJ')
        .replace('.Shp', '.Prj')
      try {
        projection = await this.fileApi.getFileText(prjFilename)
      } catch (e) {
        // lol we can live without a projection right? ;-O
      }

      // Allow user to override .PRJ projection with YAML config
      // const guessCRS = this.vizDetails.projection || Coords.guessProjection(projection)
      // console.log({ guessCRS })

      // then, reproject if we have a .prj file
      // if (guessCRS) {
      //   this.statusText = 'Projecting coordinates...'
      //   await this.$nextTick()
      //   geojson = reproject.toWgs84(geojson, guessCRS, Coords.allEPSGs)
      //   this.statusText = ''
      // }

      function getFirstPoint(thing: any): any[] {
        if (Array.isArray(thing[0])) return getFirstPoint(thing[0])
        else return [thing[0], thing[1]]
      }

      // check if we have lon/lat
      const firstPoint = getFirstPoint(geojson.features[0].geometry.coordinates)

      if (Math.abs(firstPoint[0]) > 180 || Math.abs(firstPoint[1]) > 90) {
        // this ain't lon/lat
        const msg = `Coordinates not lon/lat. Try providing ${prjFilename.substring(
          1 + prjFilename.lastIndexOf('/')
        )}`
        this.$emit('error', msg)
        this.statusText = msg
        return []
      }

      // if we don't have a user-specified map center/zoom, focus on the shapefile itself

      const long = [] as any[]
      const lat = [] as any[]
      for (let i = 0; i < geojson.features.length; i += 128) {
        const firstPoint = getFirstPoint(geojson.features[i].geometry.coordinates)
        long.push(firstPoint[0])
        lat.push(firstPoint[1])
      }
      const longitude = long.reduce((x, y) => x + y) / long.length
      const latitude = lat.reduce((x, y) => x + y) / lat.length

      this.$store.commit('setMapCamera', {
        longitude,
        latitude,
        bearing: 0,
        pitch: 0,
        zoom: 9,
        center: [longitude, latitude],
        initial: true,
      })

      return geojson.features as any[]
    },

    moveLogo() {
      const deckmap = document.getElementById(`container-${this.layerId}`) as HTMLElement
      const logo = deckmap?.querySelector('.mapboxgl-ctrl-bottom-left') as HTMLElement
      if (logo) {
        const right = deckmap.clientWidth > 640 ? '280px' : '36px'
        logo.style.right = right
      }
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$bgBeige: #636a67;
$bgLightGreen: #d2e4c9;
$bgLightCyan: var(--bgMapWater); //  // #f5fbf0;

.h5-map-viewer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: row;
  // background-color: $bgBeige;
  padding: 0.75rem;
}

.main-area {
  flex: 1;
  background-color: $bgBeige;
  position: relative;
}

.fill-it {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.status-text {
  text-align: center;
  // font-weight: bold;
  padding: 3rem 0;
  margin-top: 5rem;
}

.map-layout {
  display: flex;
  flex-direction: row;
}

.zones {
  position: relative;
  display: flex;
  flex-direction: column;
}

.map-holder {
  flex: 1;
  position: relative;
}

.left-bar {
  color: var(--text);
  display: flex;
  flex-direction: column;
  width: 180px;
}

.zone-details {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}

.h5-filename {
  padding: 8px;
  font-weight: bold;
  background-color: white;
  color: #444;
}

.h5-table {
  padding: 4px 8px;
  font-size: 0.9rem;
  cursor: pointer;
}

.h5-table:hover {
  background-color: #76aa5a60;
  transition: background-color 0.1s ease-out;
}

.selected-table {
  background-color: #8b71da;
  color: white;
  font-weight: bold;
}
.selected-table:hover {
  background-color: #8b71da;
  color: white;
}

.matrix-data-value {
  display: flex;
  padding: 0 0.5rem;
}

.zone-header {
  display: flex;
  flex-direction: column;
  background-color: white;
  color: #444;
  padding: 0.5rem;
}
.zone-number {
  flex: 1;
  padding-right: 0.5rem;
}

.zone-value {
  text-align: right;
  flex: 1;
}

.top-half {
  background-color: $bgLightCyan;
  margin-bottom: 0.25rem;
  position: relative;
}

.bottom-half {
  background-color: $bgLightCyan;
  display: flex;
  flex-direction: column;
  position: relative;
}

.swidget {
  padding: 0 8px;
}

.button {
  border-radius: 0px;
  width: 5.5rem;
  // background-color: #00000000;
  // color: black;
}

.right-container {
  display: flex;
  flex-direction: column;
  position: relative;
  width: 100%;
  margin-left: 0.25rem;
}

.tooltip-area {
  position: absolute;
  z-index: 30000;
  left: 0.5rem;
  bottom: 0.5rem;
  padding: 0.5rem;
  background-color: var(--bgBold);
  min-width: 10rem;
  display: flex;
  flex-direction: column;
  font-size: 0.9rem;
}

.scrolly {
  flex: 1;
  overflow-y: scroll;
}
</style>
