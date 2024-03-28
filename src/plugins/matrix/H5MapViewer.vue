<template lang="pug">
.h5-map-viewer
  .table-selector
    p.h5-filename {{  filename }}
    .h5-table(v-for="table in matrices" :key="table"
      :class="{'selected-table': table == activeTable}"
      @click="activeTable=table"
    )
      i.fa.fa-layer-group
      | &nbsp;&nbsp;{{ table }}

  .map-holder
    zone-layer.fill-it(
      :filename="filename"
      :features="features"
      :clickedZone="clickedZone"
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import { Dataset, File as H5WasmFile, Group as H5WasmGroup, ready as h5wasmReady } from 'h5wasm'
import { nanoid } from 'nanoid'
import { rgb } from 'd3-color'
import { scaleThreshold } from 'd3-scale'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { DEFAULT_PROJECTION, FileSystemConfig, VisualizationPlugin } from '@/Globals'

import ZoneLayer from './ZoneLayer'
import { Style, buildRGBfromHexCodes, colorRamp } from '@/js/ColorsAndWidths'

const PLUGINS_PATH = '/plugins' // path to plugins on EMScripten virtual file system

const MyComponent = defineComponent({
  name: 'H5MapViewer',
  components: { ZoneLayer },

  props: {
    fileApi: { type: HTTPFileSystem, required: true },
    subfolder: String,
    yamlConfig: String,
    config: String,
    thumbnail: Boolean,
    cardId: String,
    filenameShapes: String,
  },

  data() {
    return {
      globalState: globalStore.state,
      isMap: true,
      isRowWise: true,
      h5buffer: null as any,
      h5wasm: null as null | Promise<any>,
      h5zoneFile: null as null | H5WasmFile,
      filename: '',
      h5file: null as any,
      useConfig: '',
      vizDetails: { title: '', description: '' } as any,
      statusText: 'Loading...',
      title: '',
      description: '',
      features: [] as any,
      layerId: Math.floor(1e12 * Math.random()),
      matrices: ['1', '2'] as string[],
      activeTable: '1',
    }
  },

  async mounted() {
    this.useConfig = this.config || this.yamlConfig || '' // use whichever one was sent to us

    this.h5wasm = this.initH5Wasm()

    this.getVizDetails()
    this.filename = '' + this.yamlConfig
    this.h5buffer = await this.loadH5Buffer()
    console.log({ buffer: this.h5buffer })
    if (this.filenameShapes) this.loadBoundaries()
  },

  computed: {},

  watch: {
    'globalState.isDarkMode'() {
      // this.embedChart()
    },
    'globalState.resizeEvents'() {
      // this.changeDimensions()
    },

    yamlConfig() {
      this.useConfig = this.yamlConfig || ''
      this.getVizDetails()
    },

    subfolder() {
      this.getVizDetails()
    },
    filenameShapes() {
      this.loadBoundaries()
    },
  },

  methods: {
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

    async clickedZone(zone: { index: number; properties: any }) {
      console.log({ zone })

      if (!this.h5zoneFile) {
        console.log('build HDF5 file object first time')
        this.h5zoneFile = await this.initFile(this.h5buffer)
      }

      // so what do we do now.
      const key = `/${this.activeTable}`
      let data = this.h5zoneFile.get(key) as Dataset
      let values = []
      if (data) {
        // TODO this assumes zones are 1+offset!! what's the lookup?
        values = (
          this.isRowWise
            ? data.slice([[zone.index, zone.index + 1], []])
            : data.slice([[], [zone.index, zone.index + 1]])
        ) as number[]
        this.setColorsForArray(values)
      } else {
        console.error('NOPE', key)
      }
    },

    setColorsForArray(values: number[]) {
      const min = Math.min(...values)
      const max = Math.max(...values)

      const colors = colorRamp({ ramp: 'Viridis', style: Style.sequential }, 21)
      // colors.reverse()
      console.log(colors)
      const colorsAsRGB = buildRGBfromHexCodes(colors)
      console.log({ colorsAsRGB })
      const numColors = colorsAsRGB.length
      const exponent = 3.0
      const breakpoints = new Array(numColors - 1)
        .fill(0)
        .map((v, i) => Math.pow((1 / numColors) * (i + 1), exponent))

      console.log({ breakpoints })
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

    async loadH5Buffer() {
      this.filename = '' + this.yamlConfig
      this.statusText = `Loading: ${this.filename}...`

      const path = `${this.subfolder}/${this.yamlConfig}`
      const blob = await this.fileApi.getFileBlob(path)
      const buffer = await blob.arrayBuffer()
      this.statusText = ''
      return buffer
    },

    async loadBoundaries() {
      const shapeConfig = this.filenameShapes || 'sftaz.geojson'
      if (!shapeConfig) return

      let boundaries: any[]

      try {
        this.statusText = 'Loading map features...'

        if (shapeConfig.startsWith('http')) {
          // geojson from url!
          boundaries = (await fetch(shapeConfig).then(async r => await r.json())).features
        } else if (shapeConfig.toLocaleLowerCase().endsWith('.shp')) {
          // shapefile!
          boundaries = await this.loadShapefileFeatures(shapeConfig)
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

    getVizDetails() {
      if (this.thumbnail) {
        this.$emit('title', '' + this.yamlConfig)
        return
      }
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.h5-map-viewer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: row;
  background-color: #636a67;
  padding: 0 0 0 1rem;
}

.main-area {
  flex: 1;
  background-color: #636a67; // d5ebe0
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
  margin: 1rem 1rem 1rem 0;
}

.table-selector {
  color: #222;
  background-color: #d2e4c9;
  margin: 1rem 0;
  display: flex;
  flex-direction: column;
  width: 208px;
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
}

.selected-table {
  background-color: #76aa5a;
  font-weight: bold;
}
.selected-table:hover {
  background-color: #76aa5a;
}
</style>
