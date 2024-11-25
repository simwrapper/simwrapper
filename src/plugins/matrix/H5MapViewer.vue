<template lang="pug">
.h5-map-viewer(
  @mouseup="dividerDragEnd"
  @mousemove.stop="dividerDragging"
)
  .left-bar(:style="{width: `${leftSectionWidth-11}px`}")
    .top-half.flex1
      .zone-details
        p.h5-filename {{  filenameH5 }}
        .scrolly
          .h5-table(v-for="table in tableKeys" :key="table.key"
            :class="{'selected-table': table == activeTable}"
            @click="clickedTable(table)"
          )
            i.fa.fa-layer-group
            span &nbsp;&nbsp;
            span(v-html="table.name")

    .bottom-half.flex1
      .zone-details(v-if="activeZone !== null")
        b.zone-header {{ mapConfig.isRowWise ? 'Row' : 'Column' }} {{  activeZone }}
        .titles.matrix-data-value
          b.zone-number {{ mapConfig.isRowWise ? 'Column' : 'Row' }}
          b.zone-value(v-html="activeTable.name || `Table ${activeTable.key}`")
        .scrolly
          .matrix-data-value(v-for="value,i in prettyDataArray" :key="i")
            span.zone-number {{  i+1 }}
            span.zone-value {{  value }}

  .right-container
    .map-holder(oncontextmenu="return false")

      zone-layer.zone-layer.fill-it(
        :viewId="layerId"
        :features="features"
        :clickedZone="clickedZone"
        :activeZoneFeature="features[tazToOffsetLookup[activeZone]]"
        :cbTooltip="showTooltip"
        :isLoading="isLoading"
      )

      background-map-on-top(v-if="isMapReady")

      zoom-buttons

      .tooltip-area(v-if="tooltip" v-html="tooltip")
      p.tooltip-area(v-if="isLoading" style="padding: 1.25rem"): bi LOADING...

  .left-grabby(
    @mousedown="dividerDragStart"
    :style="{left: `${this.leftSectionWidth}px`}"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import * as shapefile from 'shapefile'
import { Dataset, File as H5WasmFile, Group as H5WasmGroup, ready as h5wasmReady } from 'h5wasm'
import { scaleThreshold } from 'd3-scale'
import naturalSort from 'javascript-natural-sort'

import globalStore from '@/store'
import { gUnzip } from '@/js/util'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { DEFAULT_PROJECTION, REACT_VIEW_HANDLES } from '@/Globals'

import BackgroundMapOnTop from '@/components/BackgroundMapOnTop.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { Style, buildRGBfromHexCodes, getColorRampHexCodes } from '@/js/ColorsAndWidths'

import { H5WasmLocalFileApi } from './local/h5wasm-local-file-api'
import { getPlugin } from './plugin-utils'

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
    config: String,
    subfolder: String,
    blob: { required: true },
    baseBlob: { required: false },
    filenameH5: String,
    filenameBase: String,
    filenameShapes: String,
    thumbnail: Boolean,
    isInvertedColor: Boolean,
    shapes: { type: Array, required: false },
    mapConfig: { type: Object as PropType<MapConfig>, required: true },
    zoneSystems: { type: Object as PropType<ZoneSystems>, required: true },
    userSuppliedZoneID: String,
  },

  data() {
    return {
      globalState: globalStore.state,
      dragDividerWidth: 0,
      dragStartWidth: 196,
      activeTable: null as null | { key: string; name: string },
      activeZone: null as any,
      currentData: [] as Float32Array | any[],
      currentBaseData: [] as Float32Array | any[],
      currentKey: '',
      dataArray: [] as number[],
      features: [] as any,
      h5fileApi: null as null | H5WasmLocalFileApi,
      h5baseApi: null as null | H5WasmLocalFileApi,
      isMapReady: false,
      isLoading: false,
      layerId: Math.floor(1e12 * Math.random()),
      leftSectionWidth: 196,
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
  },

  async mounted() {
    const prevLeftBarWidth = localStorage.getItem('matrixLeftPanelWidth')
    this.leftSectionWidth = prevLeftBarWidth ? parseInt(prevLeftBarWidth) : 192

    // blob is always a File here
    this.h5fileApi = new H5WasmLocalFileApi(this.blob as File, undefined, getPlugin)
    await this.getFileKeysAndProperties()

    // Load GeoJSON features
    await this.setupBoundaries()

    // DIFF mode ?
    if (this.baseBlob) this.activateDiffMode()
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

    baseBlob() {
      this.activateDiffMode()
    },

    'globalState.isDarkMode'() {
      // this.embedChart()
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
    dividerDragStart(e: MouseEvent) {
      this.dragDividerWidth = e.clientX
      this.dragStartWidth = this.leftSectionWidth
    },

    dividerDragEnd(e: MouseEvent) {
      this.dragDividerWidth = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.dragDividerWidth) return

      const deltaX = e.clientX - this.dragDividerWidth
      this.leftSectionWidth = Math.max(5, this.dragStartWidth + deltaX)
      localStorage.setItem('matrixLeftPanelWidth', `${this.leftSectionWidth}`)
    },

    async activateDiffMode() {
      if (this.baseBlob) {
        // blob is always a File here
        this.h5baseApi = new H5WasmLocalFileApi(this.baseBlob as File, undefined, getPlugin)
      } else {
        await this.h5baseApi?.cleanUp() //  = null
        this.h5baseApi = null
      }

      // TODO do we need this:
      // this.h5zoneFile = await this.initFile(this.buffer)
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
      if (taz1 !== undefined) {
        this.clickedZone({ index: taz1, properties: this.features[taz1].properties })
      }

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
      let tableName = this.activeTable?.name || this.activeTable?.key || 'Value'
      if (tableName.indexOf('•') > -1) tableName = tableName.substring(1 + tableName.indexOf('•'))
      tableName = tableName.replaceAll('&nbsp;', '')

      if (value === undefined) {
        this.tooltip = ''
        return
      }

      // console.log({ value, tableName })

      if (this.mapConfig.isRowWise) {
        html.push(`<p><b>Row ${this.activeZone} Col ${id}</b></p>`)
      } else {
        html.push(`<p><b>Row ${id} Col ${this.activeZone}</b></p>`)
      }

      // always returns an array
      const prettyValues = this.setPrettyValuesForArray([value])

      html.push(`<p>${tableName} ${prettyValues[0]}</p>`)

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

    async getFileKeysAndProperties() {
      if (!this.h5fileApi) return

      // first get the keys
      let keys = await this.h5fileApi.getSearchablePaths('/')
      console.log({ keys })

      // OMX has a '/data' prefix on each matrix
      if (keys.indexOf('/data') > -1) {
        keys = keys.filter(key => key.startsWith('/data/'))
        console.log({ keys2: keys })
      }

      // pretty sort the numbers the ways humans like them
      keys.sort((a: any, b: any) => naturalSort(a, b))
      this.tableKeys = keys.map(key => {
        return { key, name: key.startsWith('/data') ? key.substring(6) : '' }
      })

      // if there are "name" properties, add them
      for (const table of this.tableKeys) {
        const element = await this.h5fileApi.getEntity(table.key)
        const attrValues = await this.h5fileApi.getAttrValues(element)
        if (attrValues.name)
          table.name = `${table.key.substring(1)}&nbsp;•&nbsp;${attrValues?.name || ''}`
      }

      // Get first matrix dimension, for guessing a useful/correct shapefile
      if (this.tableKeys.length) {
        this.activeTable = this.tableKeys[0]

        const element: any = await this.h5fileApi.getEntity(this.tableKeys[0].key)
        console.log({ element })
        // .get(this.tableKeys[0].key) as Dataset
        const shape = element.shape
        if (shape) this.matrixSize = shape[0]
        else this.matrixSize = 4947
      }
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

    async fetchMatrix(h5api: H5WasmLocalFileApi) {
      if (!h5api || this.activeZone == null) return []
      const key = this.activeTable?.key || ''
      let dataset = await h5api.getEntity(key)
      let data = (await h5api.getValue({ dataset } as any)) as Float32Array
      return data
    },

    async extractH5ArrayData() {
      // the file has the data, and we want it
      if (!this.h5fileApi || this.activeZone == null) return

      this.isLoading = true
      await this.$nextTick()

      // async get the matrix itself first
      if (this.currentKey !== this.activeTable?.key) {
        this.currentData = await this.fetchMatrix(this.h5fileApi as any)
        this.currentKey = this.activeTable?.key || ''
        // also get base matrix if we're in diffmode
        if (this.h5baseApi) this.currentBaseData = await this.fetchMatrix(this.h5baseApi as any)
      }

      //TODO FIX THIS
      let offset = this.activeZone - 1

      // try {
      let values = [] as any

      if (this.currentData) {
        if (this.mapConfig.isRowWise) {
          values = this.currentData.slice(this.matrixSize * offset, this.matrixSize * (1 + offset))
        } else {
          for (let i = 0; i < this.matrixSize; i++) {
            values.push(this.currentData[i * this.matrixSize + offset])
          }
        }
      }

      console.log(5555, 'VALUES', values.length)

      // DIFF MODE

      if (this.h5baseApi && this.currentBaseData) {
        console.log('DO THE DIFF!')
        let baseValues = [] as any

        if (this.mapConfig.isRowWise) {
          baseValues = this.currentBaseData.slice(
            this.matrixSize * offset,
            this.matrixSize * (1 + offset)
          )
        } else {
          for (let i = 0; i < this.matrixSize; i++) {
            baseValues.push(this.currentBaseData[i * this.matrixSize + offset])
          }
        }

        console.log('6666', 'BASEVALUES', baseValues)
        // do the diff
        values = values.map((v: any, i: any) => v - baseValues[i])
      }

      this.dataArray = values
      this.setColorsForArray()
      this.prettyDataArray = this.setPrettyValuesForArray(this.dataArray)

      // } catch (e) {
      //   console.warn('Offset not found in HDF5 file:', offset)
      // }
      this.isLoading = false
    },

    setPrettyValuesForArray(array: any[]) {
      const pretty = [] as any[]
      array.forEach(v => {
        if (Number.isNaN(v)) pretty.push('NaN')
        else if (v == 0) pretty.push('0')
        else if (Math.abs(v) >= 0.0001) {
          const trimmed = Math.round(10000 * v) / 10000
          pretty.push('' + trimmed)
        } else {
          pretty.push(v.toExponential(3))
        }
      })
      return pretty
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
      let min = Infinity
      let max = -Infinity
      // too many for spread
      for (let i = 0; i < values.length; i++) {
        min = Math.min(min, values[i])
        max = Math.max(max, values[i])
      }

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
      console.log('HAHAHHAA', this.matrixSize)
      const zoneSystem = this.zoneSystems.bySize[this.matrixSize]
      if (!zoneSystem) {
        console.error('NOOOO UNKNOWN MATRIX SIZE')
        this.$emit('nozones')
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
  padding: 11px;
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
  user-select: none;
}

.left-grabby {
  z-index: 500;
  width: 0.5rem;
  background-color: #1eb7ea;
  position: absolute;
  top: 10px;
  bottom: 10px;
  left: 180px;
  opacity: 0;
  transition: opacity 0.2s;
}

.left-grabby:hover {
  opacity: 1;
  cursor: ew-resize;
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
  width: max-content;
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
  margin-left: 0.25rem;
  flex: 1;
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
