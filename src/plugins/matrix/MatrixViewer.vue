<template lang="pug">
.matrix-viewer(v-if="!thumbnail")
  config-panel(v-if="activeTable"
    :isMap="isMap"
    :mapConfig="mapConfig"
    :comparators="comparators"
    :compareLabel="compareLabel"
    :catalog="h5Main?.catalog || []"
    :activeTable="activeTable"
    @changeMatrix="changeMatrix"
    @setMap="setMap"
    @shapes="filenameShapes=$event"
    @changeColor="changeColor"
    @changeScale="changeScale"
    @compare="compareToBase"
    @toggleComparePicker="toggleComparePicker"
  )

  .getting-matrices(v-if="isGettingMatrices")
      .fxl Loading...

  .main-area(
    :class="{'is-dragging': isDragging, 'is-getting-matrices': isGettingMatrices}"
    @drop="onDrop"
    @dragstart="dragStart"
    @dragover="stillDragging"
    @dragleave="debounceDragEnd"
    @dragover.prevent
    @dragenter.prevent
  )

    .status-text(v-if="statusText")
      h4 {{ statusText }}

    H5Map-viewer.fill-it(v-if="isMap && h5Main?.size"
      :fileApi="fileApi"
      :fileSystem="fileSystem"
      :subfolder="subfolder"
      :blob="h5fileBlob"
      :baseBlob="h5baseBlob"
      :filenameH5="filename"
      :filenameBase="filenameBase"
      :filenameShapes="filenameShapes"
      :matrices="matrices"
      :matrixSize="h5Main?.size || 0"
      :shapes="shapes"
      :userSuppliedZoneID="zoneID"
      :mapConfig="mapConfig"
      :zoneSystems="zoneSystems"
      :tazToOffsetLookup="h5zoneLookup"
      @nozones="isMap=false"
      @changeRowWise="changeRowWise"
      )

    h5-table-viewer.fill-it.h5-table-viewer(v-if="h5fileBlob && !isMap"
      :filename="filename"
      :blob="h5fileBlob"
    )

    compare-file-picker(v-if="showComparePicker"
      :fileApi="fileApi"
      :subfolder="subfolder"
      @choose="chooseCompareFile"
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import YAML from 'yaml'
import { debounce } from 'debounce'
import { Dataset, File as H5WasmFile, Group as H5WasmGroup, ready as h5wasmReady } from 'h5wasm'

import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { gUnzip } from '@/js/util'

import H5TableViewer from './H5TableViewer'
import H5MapViewer from './H5MapViewer.vue'
import ConfigPanel from './ConfigPanel.vue'

import { ColorMap } from '@/components/ColorMapSelector/models'
import { ScaleType } from '@/components/ScaleSelector/ScaleOption'
import { COLORMAP_GROUPS } from '@/components/ColorMapSelector/groups'
import CompareFilePicker from './CompareFilePicker.vue'
import H5Provider, { Matrix } from './H5Provider'

export interface ComparisonMatrix {
  root: string
  subfolder: string
  filename: string
}

export interface MapConfig {
  scale: ScaleType
  colormap: ColorMap
  isInvertedColor: Boolean
  isRowWise: Boolean
}

export interface ZoneSystem {
  url: string
  lookup: string
  sizes: number[]
}

export interface ZoneSystems {
  bySize: { [size: number]: ZoneSystem }
  byID: { [id: string]: ZoneSystem }
}

const BASE_URL = import.meta.env.BASE_URL

const MyComponent = defineComponent({
  name: 'MatrixViewer',
  components: { H5TableViewer, H5MapViewer, ConfigPanel, CompareFilePicker },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    configFromDashboard: { type: Object as any },
    thumbnail: Boolean,
    cardId: String,
  },

  data() {
    return {
      title: '',
      description: '',
      config: null as any,
      comparators: [] as ComparisonMatrix[],
      compareLabel: 'Compare...',
      isDragging: false,
      isMap: true,
      isGettingMatrices: false,
      showComparePicker: false,
      h5fileBlob: null as null | File | Blob,
      h5baseBlob: null as null | File | Blob,
      h5zoneLookup: {} as any,
      globalState: globalStore.state,
      filename: '',
      filenameShapes: '',
      filenameBase: '',
      h5Main: null as null | H5Provider,
      h5Compare: null as null | H5Provider,
      matrices: {} as { [key: string]: Matrix },
      shapes: null as null | any[],
      useConfig: '',
      vizDetails: {
        title: '',
        description: '',
        dataset: '',
        basedata: '',
        shapes: null as null | { file: string; id: string },
        colors: null as null | { ramp: string; invert: boolean; scale: string },
      },
      statusText: 'Loading...',
      layerId: Math.floor(1e12 * Math.random()),
      activeTable: '',
      debounceDragEnd: {} as any,
      mapConfig: {
        scale: ScaleType.Log,
        colormap: 'Viridis',
        isInvertedColor: false,
        isRowWise: true,
      } as MapConfig,
      zoneSystems: { byID: {}, bySize: {} } as ZoneSystems,
      zoneID: 'TAZ',
    }
  },

  async mounted() {
    this.debounceDragEnd = debounce(this.dragEnd, 500)
    this.useConfig = this.config || this.yamlConfig || '' // use whichever one was sent to us

    await this.getVizDetails()

    // don't actually load any files if we're just in the file browser
    if (this.thumbnail) {
      this.$emit('isLoaded')
      return
    }

    await this.setupAvailableZoneSystems()
    this.fetchLastSettings()
    this.honorQueryParameters()

    // not really done loading yet but the spinny is ugly
    this.$emit('isLoaded')

    this.comparators = this.setupComparisons()
    this.shapes = await this.loadShapes()

    try {
      await this.initH5Files()
      if (!this.h5Main) return

      this.h5zoneLookup = await this.buildTAZLookup()
      let initialTable =
        `${this.$route.query.table}` ||
        localStorage.getItem('matrix-initial-table') ||
        this.h5Main?.catalog[0]

      // if saved table is not in THIS matrix, revert to first table
      if (initialTable && !this.h5Main.catalog.includes(initialTable)) {
        initialTable = this.h5Main?.catalog[0]
      }

      if (initialTable) await this.changeMatrix(initialTable)
    } catch (e) {
      this.$emit('error', `Error loading file: ${this.subfolder}/${this.filename}`)
      console.error('' + e)
    }

    if (this.h5baseBlob) this.compareLabel = `Compare ${this.filename} to ${this.filenameBase}`
  },

  computed: {
    fileApi(): HTTPFileSystem | null {
      if (!this.fileSystem) return null
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    fileSystem(): FileSystemConfig | null {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no project - browse mode')
        return null
      }
      return svnProject[0]
    },
  },
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
  },

  methods: {
    async setMap(isMap: boolean) {
      this.isMap = isMap

      if (isMap) {
        this.h5fileBlob = null
      } else {
        this.h5fileBlob = await this.buildH5Blob()
      }
    },

    async buildH5Blob() {
      // we are going to fabricate an HDF5 file with the current matrix content!
      const { FS } = await h5wasmReady
      let f = new H5WasmFile('matrix', 'w')
      const size = Math.floor(Math.sqrt(this.matrices.main.data.length))

      f.create_dataset({ name: `A: Values`, data: this.matrices.main.data, shape: [size, size] })

      if (this.matrices.diff) {
        f.create_dataset({ name: `B: Compare`, data: this.matrices.base.data, shape: [size, size] })
        f.create_dataset({
          name: `C: Diff A-B`,
          data: this.matrices.diff.data,
          shape: [size, size],
        })
      }

      f.flush()
      f.close()

      const tableLabel = this.activeTable.replaceAll('&nbsp;', ' ')
      const fileData = FS.readFile('matrix')
      const blob = new File([fileData], tableLabel, { type: 'application/octet-stream' })
      return blob
    },

    async addBase() {},

    async changeMatrix(table: any) {
      console.log('table:', table)
      if (!table || table == 'undefined') {
        this.activeTable = ''
        // TODO
        this.$router.replace({ query: {} })
        return
      }

      this.activeTable = table
      this.$router.replace({ query: { ...this.$route.query, table } })
      await this.getMatrices()
      localStorage.setItem('matrix-initial-table', table)

      if (!this.isMap) this.h5fileBlob = await this.buildH5Blob()
    },

    async getMatrices() {
      this.isGettingMatrices = true
      await this.$nextTick()

      let which = this.activeTable + ' from main file'
      try {
        const mainMatrix = await this.h5Main?.getDataArray(this.activeTable)
        if (!mainMatrix) return

        const matrices = {
          main: mainMatrix,
        } as { [id: string]: Matrix }

        if (this.h5Compare) {
          which = this.activeTable + ' from comparison file'
          const baseMatrix = await this.h5Compare?.getDataArray(this.activeTable)
          if (baseMatrix) {
            matrices.base = baseMatrix

            const diff = new Float32Array(mainMatrix.data.length)
            mainMatrix.data.forEach((v, i) => {
              diff[i] = v - baseMatrix.data[i]
            })
            matrices.diff = {
              data: diff,
              path: mainMatrix.path,
              table: this.activeTable,
            }
          }
        }
        this.matrices = matrices
      } catch (e) {
        this.$emit('error', `Error extracting ${which}`)
        console.error('' + e)
      } finally {
        this.isGettingMatrices = false
        this.statusText = ''
      }
    },

    async initH5Files() {
      if (!this.yamlConfig) {
        this.statusText = `Drop an HDF5 matrix file and GeoJSON boundary file here to view it`
        return
      }
      if (!this.fileSystem) return

      this.statusText = `Loading: ${this.filename}...`
      await this.$nextTick()

      // if we have a yaml config, use it
      this.filename = '' + this.yamlConfig
      if (this.config) this.filename = this.config.dataset

      this.h5Main = new H5Provider({
        fileSystem: this.fileSystem,
        subfolder: this.subfolder,
        filename: this.filename,
      })

      // this opens file, sets up the shape and matrix catalog
      await this.h5Main.init()

      this.statusText = ''
    },

    async chooseCompareFile(comparison: any) {
      this.showComparePicker = false
      if (!comparison) return
      await this.compareToBase(comparison)
      if (!this.isMap) this.h5fileBlob = await this.buildH5Blob()
    },

    toggleComparePicker() {
      this.showComparePicker = !this.showComparePicker
    },

    fetchLastSettings() {
      if (this.vizDetails.colors) {
        // Use config if we have one

        // @ts-ignore
        const scale = ScaleType[this.vizDetails.colors.scale]

        this.mapConfig = {
          colormap: this.vizDetails.colors.ramp as any,
          isInvertedColor: this.vizDetails.colors.invert,
          scale,
          isRowWise: true,
        }
      } else {
        // use last settings if there are some
        const config = localStorage.getItem('matrixviewer-map-config')
        if (config) {
          const json = JSON.parse(config)
          this.mapConfig = json
        }
      }
    },

    honorQueryParameters() {
      const query = this.$route.query as any
      if (query.inverted == 'true') this.mapConfig.isInvertedColor = true
      if (query.colors) this.mapConfig.colormap = query.colors
      if (query.scale) this.mapConfig.scale = query.scale
      if (query.dir) this.mapConfig.isRowWise = query.dir == 'row'
    },

    updateQuery() {
      const { invert, scale, colors, ...query } = this.$route.query as any
      query.dir = this.mapConfig.isRowWise ? 'row' : 'col'
      if (this.mapConfig.colormap !== 'Viridis') query.colors = this.mapConfig.colormap
      if (this.mapConfig.isInvertedColor) query.invert = 'true'
      if (this.mapConfig.scale !== 'linear') query.scale = this.mapConfig.scale
      this.$router.replace({ query }).catch(() => {})
    },

    saveMapSettings() {
      const json = JSON.stringify(this.mapConfig)
      localStorage.setItem('matrixviewer-map-config', json)
      this.updateQuery()
    },

    async loadShapes() {
      if (!this.vizDetails.shapes || !this.fileApi) return null

      // User passed in a geojson and column ID; use them.
      this.statusText = `Loading: ${this.vizDetails.shapes.file}...`
      const path = `${this.subfolder}/${this.vizDetails.shapes.file}`
      await this.$nextTick()
      try {
        const geojson = await this.fileApi.getFileJson(path)
        this.filenameShapes = this.vizDetails.shapes.file || 'File'
        this.zoneID = this.vizDetails.shapes.id || 'TAZ'
        this.statusText = ''
        return geojson.features
      } catch (e) {
        this.$emit('error', 'Error loading ' + path)
        console.error('' + e)
      }
      return null
    },

    async loadYamlConfig() {
      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + config

      if (!this.fileApi) {
        this.$emit('error', 'Could not load YAML: ' + filename)
        return
      }

      // 1. First try loading the file directly
      try {
        const text = await this.fileApi.getFileText(filename)
        return YAML.parse(text)
      } catch (err) {
        const message = '' + err
        if (message.startsWith('YAMLSemantic')) {
          this.$emit('error', `${filename}: ${message}`)
        }
        console.log(`${filename} not found, trying config folders`)
      }

      // 2. Try loading from a config folder instead
      const { vizes } = await this.fileApi.findAllYamlConfigs(this.subfolder)
      if (vizes[config]) {
        try {
          const text = await this.fileApi.getFileText(vizes[config])
          return YAML.parse(text)
        } catch (err) {
          console.error(`Also failed to load ${vizes[config]}`)
        }
      }
      this.$emit('error', 'Could not load YAML: ' + filename)
    },

    async getVizDetails() {
      if (this.configFromDashboard) {
        // are we in a dashboard?
        this.config = JSON.parse(JSON.stringify(this.configFromDashboard))
        this.vizDetails = Object.assign({}, this.configFromDashboard)
        this.$emit('title', this.config.title || `File: ${this.yamlConfig}`)
      } else {
        // was a YAML file was passed in?
        const filename = (this.yamlConfig ?? '').toLocaleLowerCase()
        if (filename?.endsWith('yaml') || filename?.endsWith('yml')) {
          const ycfg = await this.loadYamlConfig()
          this.config = ycfg
          this.vizDetails = Object.assign({}, ycfg)
        }
        this.$emit('title', this.config?.title || `File: ${filename}`)
      }
    },

    changeRowWise(event: any) {
      this.mapConfig.isRowWise = event
      this.saveMapSettings()
    },

    changeScale(event: any) {
      this.mapConfig.scale = event
      this.saveMapSettings()
    },

    changeColor(event: any) {
      if (!event) {
        // inversion
        this.mapConfig.isInvertedColor = !this.mapConfig.isInvertedColor
      } else {
        // all other config
        this.mapConfig.colormap = event
      }
      this.saveMapSettings()
    },

    setupComparisons() {
      const comparisons = localStorage.getItem('h5mapComparators')
      if (!comparisons) return []

      return JSON.parse(comparisons)
    },

    async compareToBase(comparisonMatrix: ComparisonMatrix) {
      if (!this.fileSystem) return

      this.h5Compare = new H5Provider({
        fileSystem: this.fileSystem,
        subfolder: comparisonMatrix.subfolder,
        filename: comparisonMatrix.filename,
      })

      await this.h5Compare.init()

      // drag/drop mode, no "root" filesystem. Just set this as base.
      if (comparisonMatrix.root === '') {
        // this.h5baseBlob = this.h5fileBlob
        // this.setCompareLabel(base.filename)
        return
      }

      this.compareLabel = `Compare to ${comparisonMatrix.subfolder}/${comparisonMatrix.filename}`

      this.setDivergingColors()
      await this.getMatrices()
    },

    setDivergingColors() {
      const badcolors = [...COLORMAP_GROUPS['Multi hue'], ...COLORMAP_GROUPS['Single hue']]

      if (badcolors.includes(this.mapConfig.colormap)) {
        this.changeColor('RdBu')
      }
    },

    setCompareLabel(filename: string) {
      console.log('BASE:', this.filenameBase)
      console.log('THIS:', filename)

      if (!this.filenameBase) {
        this.compareLabel = 'Compare...'
      } else if (filename == this.filenameBase) {
        this.compareLabel = 'Base: ' + this.filename
      } else {
        this.compareLabel = `Compare: ${this.filename} to ${this.filenameBase}`
      }
    },

    async onDrop(event: any) {
      event.preventDefault()
      this.isDragging = false

      try {
        const files = event.dataTransfer?.files as FileList
        const file0 = files.item(0)
        if (!file0) return

        if (/(geojson|geojson\.gz)$/.test(file0.name.toLocaleLowerCase())) {
          console.log('GeoJSON!')
          this.handleDroppedBoundaries(file0)
        } else {
          console.log('Not GeoJSON!')
          this.handleDroppedMatrix(file0)
        }
      } catch (e) {
        console.error('' + e)
      }
    },

    dragStart(event: any) {
      this.isDragging = true
      this.statusText = 'Drop to load file'
    },

    stillDragging(event: any) {
      this.isDragging = true
      this.statusText = 'Drop to load file'
    },

    dragEnd(event: any) {
      this.isDragging = false
      this.statusText = ''
    },

    async handleDroppedMatrix(file: File) {
      console.log('HANDLE DROPPED MATRIX')
      this.isDragging = false

      this.statusText = 'Loading...'

      // clear old buffer from UI
      this.h5fileBlob = null
      await this.$nextTick()

      this.h5Main = new H5Provider({
        file,
        subfolder: '',
        filename: this.filename,
      })

      // this opens file, sets up the dimensions and matrix catalog
      await this.h5Main.init()

      this.h5fileBlob = file
      this.filename = file.name || 'File'
      this.$emit('title', this.filename)
      this.setCompareLabel(file.name)
      this.statusText = ''

      this.h5zoneLookup = await this.buildTAZLookup()

      const initialTable = localStorage.getItem('matrix-initial-table') || this.h5Main?.catalog[0]
      if (initialTable) await this.changeMatrix(initialTable)
    },

    async handleDroppedBoundaries(file: File) {
      this.isDragging = false
      this.statusText = 'Loading geography...'
      await this.$nextTick()

      try {
        const buffer = await file.arrayBuffer()
        const rawtext = gUnzip(buffer)
        const text = new TextDecoder('utf-8').decode(rawtext)
        const geojson = JSON.parse(text)

        const id = await new Promise<string>(resolve => {
          const m = prompt('ID / TAZ Column', 'TAZ') || 'TAZ'
          resolve(m)
        })

        this.filenameShapes = file.name || 'File'
        this.shapes = geojson.features
        this.zoneID = id
        this.statusText = this.h5fileBlob ? '' : `Shapes loaded. Drop an HDF5 file here to view it`
        this.isMap = true
      } catch (e) {
        console.error('' + e)
      }
    },

    async setupAvailableZoneSystems() {
      try {
        const url = BASE_URL + 'zones/zones.yaml'

        const config = await (await fetch(url)).text()
        const zoneSystemConfigs = YAML.parse(config)

        for (const key of Object.keys(zoneSystemConfigs)) {
          const zs = zoneSystemConfigs[key]

          // parse sizes and turn into an array
          let sizes = zs.sizes as any
          if (Number.isInteger(sizes)) sizes = `${sizes}`
          sizes = sizes.split(',').map((n: any) => parseInt(n)) as number[]

          const system = { url: zs.url, lookup: zs.lookup, sizes }
          this.zoneSystems.byID[key] = system
          sizes.forEach((size: any) => (this.zoneSystems.bySize[size] = system))
        }
      } catch (e) {
        console.error('ZONESYSTEM: ' + e)
      }
    },

    async buildTAZLookup() {
      const lookup = {} as any
      if (!this.h5Main) return lookup

      // If "zone_number" array exists, build lookup from that
      // console.log(this.h5Main.catalog)
      if (this.h5Main?.catalog?.indexOf('zone_number') > -1) {
        const zoneNumbers = await this.h5Main.getDataArray('zone_number')
        // console.log({ zoneNumbers })
        zoneNumbers.data.forEach((zone, offset) => {
          lookup[zone] = offset
        })
      } else {
        // Otherwise assume numbers just increase
        // console.log(this.h5Main?.size)
        for (let i = 1; i <= this.h5Main.size; i++) {
          lookup[i] = i - 1
        }
      }
      return lookup
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.matrix-viewer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bgCardFrame);
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
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  text-align: center;
  font-weight: bold;
  height: 100%;
  color: white;
  display: flex;
  flex-direction: column;
  z-index: 50;
  pointer-events: none;
}

.status-text h4 {
  margin: auto auto;
  padding: 1.5rem;
  background-color: #444455ee;
}

.is-dragging {
  border: 0.5rem dashed #06e07e;
  background-color: black;
}

.h5-table-viewer {
  display: flex;
  flex-direction: column;
  flex: 1;
  // padding: 0.75rem;
}

.getting-matrices {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 600;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  filter: $filterShadow;
}

.fxl {
  padding: 1rem 5rem;
  background-color: white;
  color: #333;
  text-align: center;
  vertical-align: middle;
  font-weight: bold;
  border: 5px solid #06e07e;
}

.is-getting-matrices {
  opacity: 0.5;
}
</style>
