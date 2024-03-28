<template lang="pug">
.h5-map-viewer
  .table-selector
    .top-half.flex1
      p.h5-filename {{  filenameH5 }}
      .h5-table(v-for="table in tableKeys" :key="table.key"
        :class="{'selected-table': table == activeTable}"
        @click="clickedTable(table)"
      )
        i.fa.fa-layer-group
        | &nbsp;&nbsp;{{ table.key }}&nbsp;&nbsp;{{ table.name}}

    .bottom-half.flex1
      .zone-details(v-if="activeZone > -1")
        b.zone-header {{ isRowWise ? 'Row' : 'Column' }} {{  activeZone + 1 }}

        .titles.matrix-data-value
          b.zone-number {{ isRowWise ? 'Column' : 'Row' }}
          b.zone-value  {{  activeTable.name || `Table ${activeTable.key}` }}
        .matrix-data-value(v-for="value,i in dataArray" :key="i")
          span.zone-number {{  i+1 }}
          span.zone-value {{  value }}

  .map-holder(oncontextmenu="return false")
    zone-layer.fill-it(
      :viewId="layerId"
      :features="features"
      :clickedZone="clickedZone"
      :activeZoneFeature="features[activeZone]"
    )

    background-map-on-top

    zoom-buttons

</template>

<script lang="ts">
import { defineComponent } from 'vue'

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
import ZoneLayer from './ZoneLayer'
import { Style, buildRGBfromHexCodes, colorRamp } from '@/js/ColorsAndWidths'

naturalSort.insensitive = true

const PLUGINS_PATH = '/plugins' // path to plugins on EMScripten virtual file system

const MyComponent = defineComponent({
  name: 'H5MapViewer',
  components: { ZoneLayer, BackgroundMapOnTop, ZoomButtons },

  props: {
    fileApi: { type: HTTPFileSystem, required: true },
    buffer: { type: ArrayBuffer, required: true },
    isRowWise: Boolean,
    subfolder: String,
    filenameH5: String,
    filenameShapes: String,
    config: String,
    thumbnail: Boolean,
  },

  data() {
    return {
      globalState: globalStore.state,
      isMap: true,
      h5wasm: null as null | Promise<any>,
      h5zoneFile: null as null | H5WasmFile,
      h5file: null as any,
      useConfig: '',
      statusText: 'Loading...',
      features: [] as any,
      layerId: Math.floor(1e12 * Math.random()),
      tableKeys: [] as { key: string; name: string }[],
      activeTable: null as null | { key: string; name: string },
      activeZone: -1,
      dataArray: [] as number[],
    }
  },

  beforeDestroy() {
    // MUST delete the React view handles to prevent gigantic memory leaks!
    delete REACT_VIEW_HANDLES[this.layerId]
    this.h5file = null
    this.h5wasm = null
  },

  async mounted() {
    this.h5wasm = this.initH5Wasm()

    console.log({ buffer: this.buffer })

    // load the file into h5wasm
    if (!this.h5zoneFile) {
      this.h5zoneFile = await this.initFile(this.buffer)
      this.getFileKeysAndProperties()
    }

    if (this.filenameShapes) this.loadBoundaries()
  },

  computed: {},

  watch: {
    'globalState.viewState'() {
      if (!REACT_VIEW_HANDLES[this.layerId]) return
      REACT_VIEW_HANDLES[this.layerId]()
    },

    'globalState.isDarkMode'() {
      // this.embedChart()
    },
    'globalState.resizeEvents'() {
      // this.changeDimensions()
    },

    activeTable() {
      this.fetchH5ArrayData()
    },
    // subfolder() {},
    filenameShapes() {
      this.loadBoundaries()
    },
    isRowWise() {
      this.fetchH5ArrayData()
    },
  },

  methods: {
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

      if (this.tableKeys.length) this.activeTable = this.tableKeys[0]
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

    fetchH5ArrayData() {
      // the file has the data, and we want it
      if (!this.h5zoneFile) return
      // User should have selected a zone already
      if (this.activeZone < 0) return

      const key = `/${this.activeTable?.key}`
      let data = this.h5zoneFile.get(key) as Dataset
      let values = [] as number[]
      if (data) {
        // TODO this assumes zones are 1+offset!! what's the lookup?
        values = (
          this.isRowWise
            ? data.slice([[this.activeZone, this.activeZone + 1], []])
            : data.slice([[], [this.activeZone, this.activeZone + 1]])
        ) as number[]
      }
      this.dataArray = values
      this.setColorsForArray(this.dataArray)
    },

    clickedTable(table: { key: string; name: string }) {
      console.log('click!', table)
      this.activeTable = table
    },

    clickedZone(zone: { index: number; properties: any }) {
      console.log({ zone })

      // ignore double clicks and same-clicks
      if (zone.index === this.activeZone) return

      this.activeZone = zone.index
      this.fetchH5ArrayData()
    },

    setColorsForArray(values: number[]) {
      const min = Math.min(...values)
      const max = Math.max(...values)

      const colors = colorRamp({ ramp: 'Rainbow', style: Style.sequential }, 21)

      // colors.reverse()
      // console.log(colors)
      const colorsAsRGB = buildRGBfromHexCodes(colors)
      // console.log({ colorsAsRGB })
      const numColors = colorsAsRGB.length
      const exponent = 3.0
      const breakpoints = new Array(numColors - 1)
        .fill(0)
        .map((v, i) => Math.pow((1 / numColors) * (i + 1), exponent))

      // console.log({ breakpoints })

      // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
      // *range* is the list of colors;
      // *domain* is the list of breakpoints (usually 0.0-1.0 continuum or zero-centered)
      const setColorBasedOnValue: any = scaleThreshold().range(colorsAsRGB).domain(breakpoints)

      for (let i = 0; i < this.features.length; i++) {
        const value = values[i] / max
        const color = Number.isNaN(value) ? [40, 40, 40] : setColorBasedOnValue(value)
        this.features[i].properties.color = color || [40, 40, 40]
      }
      // Tell vue this is new
      this.features = [...this.features]
    },

    async loadBoundaries() {
      // const shapeConfig = this.filenameShapes

      // TODO: default is SFCTA "Dist15" zones
      const shapeConfig = '/dist15.geojson.gz'

      if (!shapeConfig) return

      let boundaries: any[] = []

      try {
        this.statusText = 'Loading map features...'

        if (shapeConfig.startsWith('http')) {
          // geojson from url!
          boundaries = (await fetch(shapeConfig).then(async r => await r.json())).features
        } else if (shapeConfig.toLocaleLowerCase().endsWith('.shp')) {
          // shapefile!
          boundaries = await this.loadShapefileFeatures(shapeConfig)
        } else if (shapeConfig == '/dist15.geojson.gz') {
          // special SFCTA test
          console.log('LOADING FAKE geojson:', shapeConfig)
          const blob = await fetch(shapeConfig).then(async r => await r.blob())
          const buffer = await blob.arrayBuffer()
          const rawtext = gUnzip(buffer)
          const text = new TextDecoder('utf-8').decode(rawtext)
          const json = JSON.parse(text)
          // finally!
          boundaries = json.features
        } else {
          // geojson!
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
      this.clickedZone({ index: 0, properties: boundaries[0].properties })
    },

    async loadShapefileFeatures(filename: string) {
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

.h5-map-viewer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: row;
  background-color: $bgBeige;
  padding: 0 0 0 1rem;
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

.flex-row {
  margin-top: 1rem;
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
  margin: 0rem 0 0 1rem;
}

.zones {
  position: relative;
  display: flex;
  flex-direction: column;
}

.map-holder {
  flex: 1;
  position: relative;
  margin: 1rem 0rem;
}

.table-selector {
  color: #222;
  background-color: #d2e4c9;
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  width: 180px;
}

.zone-details {
  font-size: 0.9rem;
}

.h5-filename {
  padding: 8px;
  font-weight: bold;
  background-color: #eee;
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
  background-color: #76aa5a;
  font-weight: bold;
}
.selected-table:hover {
  background-color: #76aa5a;
}

.matrix-data-value {
  display: flex;
  padding: 0 0.5rem;
}

.zone-header {
  display: flex;
  flex-direction: column;
  background-color: white;
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
  overflow-y: auto;
}
.bottom-half {
  margin-top: 1rem;
  border-top: 1rem solid $bgBeige;
  overflow-y: auto;
}
</style>
