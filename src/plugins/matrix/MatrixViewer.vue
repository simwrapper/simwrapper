<template lang="pug">
.matrix-viewer
  config-panel(v-show="activeTable && !showCompareOrReplaceDialog && !showSelectRowLookupDialog"
    :isMap="isMap"
    :hasShapes="hasShapes"
    :mapConfig="mapConfig"
    :comparators="comparators"
    :compareLabel="compareLabel"
    :catalog="catalog"
    :activeTable="activeTable"
    @changeMatrix="changeMatrix"
    @setMap="setMap"
    @shapes="filenameShapes=$event"
    @changeColor="changeColor"
    @changeScale="changeScale"
    @compare="compareToBase"
    @toggleComparePicker="toggleComparePicker"
    @hasShapes="hasShapes=$event"
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
      h4(v-html="statusText")

    //- show the map in mapmode, if user dropped features in OR we have a matrix
    H5Map-viewer.fill-it(v-if="isMap && (hasDroppedBoundaries || matrixSize)"
      :activeTable="activeTable"
      :fileApi="fileApi"
      :fileSystem="fileSystem"
      :filenameShapes="filenameShapes"
      :mapConfig="mapConfig"
      :matrices="matrices"
      :matrixSize="matrixSize"
      :row2zone="row2zone"
      :shapes="shapes"
      :subfolder="subfolder"
      :tazToOffsetLookup="h5zoneLookup"
      :userSuppliedZoneID="zoneID"
      :zoneSystems="zoneSystems"
      @nozones="isMap=false"
      @changeRowWise="changeRowWise"
      @hasShapes="hasShapes=$event"
      @rowlookup="row2zone=$event"
    )

    H5TableViewer.fill-it.h5-table-viewer(v-if="!showSelectRowLookupDialog &&h5fileBlob && (!isMap) && (!isGettingMatrices)"
      :filename="filename"
      :blob="h5fileBlob"
    )

    compare-file-picker(v-if="showComparePicker"
      :fileApi="fileApi"
      :subfolder="subfolder"
      @choose="chooseCompareFile"
    )

    modal-markdown-dialog.modal-ask-compare(v-if="showCompareOrReplaceDialog"
      title="Replace or Compare?"
      md="A matrix is already loaded.<br/>Do you want to replace it, or compare (diff) the dropped matrix to the current matrix?"
      :buttons="['Cancel', 'Replace', 'Compare']"
      @click="handleClickedAskCompare"
    )
    modal-markdown-dialog.modal-ask-compare(v-if="showSelectRowLookupDialog"
      title="Select the zone number lookup"
      md="This OMX file contains multiple 'lookup' arrays.<br>One is usually the <b>zone number mapping</b>. Which one is it?"
      :buttons="['Cancel', cleanLookupNames].flat()"
      @click="handleClickedSelectRowLookup"
    )
</template>

<script lang="ts">
import { defineComponent } from 'vue'

import YAML from 'yaml'
import * as Comlink from 'comlink'
import { debounce } from 'debounce'

import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { gUnzip } from '@/js/util'
import Geotools from '@/js/geo-utils'

import ConfigPanel from './ConfigPanel.vue'
import H5TableViewer from './H5TableReactWrapper.vue'
import H5MapViewer from './H5MapViewer.vue'
import CompareFilePicker from './CompareFilePicker.vue'

import { ColorMap } from '@/components/ColorMapSelector/models'
import { ScaleType } from '@/components/ScaleSelector/ScaleOption'
import { COLORMAP_GROUPS } from '@/components/ColorMapSelector/groups'
import H5ProviderWorker from './H5ProviderWorker.worker?worker'
import ModalMarkdownDialog from '@/components/ModalMarkdownDialog.vue'

export interface Matrix {
  path: string
  table: string
  data: Float32Array | Float64Array | number[]
}

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
  file?: string
  sizes: number[]
  flask?: boolean
  key?: string
  rowlookup?: string
}

export interface ZoneSystems {
  bySize: { [size: number]: ZoneSystem }
  byID: { [id: string]: ZoneSystem }
}

interface TAZLookup {
  [lookup: string]: { zone2offset: number[]; offset2zone: number[] }
}

const BASE_URL = import.meta.env.BASE_URL

const MyComponent = defineComponent({
  name: 'MatrixViewer',
  components: { H5MapViewer, H5TableViewer, ConfigPanel, CompareFilePicker, ModalMarkdownDialog },
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
      catalog: [] as string[],
      config: null as any,
      comparators: [] as ComparisonMatrix[],
      compareLabel: 'Compare...',
      hasShapes: false,
      hasDroppedBoundaries: false,
      isDragging: false,
      isMap: true,
      isGettingMatrices: false,
      showComparePicker: false,
      showCompareOrReplaceDialog: false as boolean | File,
      showSelectRowLookupDialog: false,
      h5fileBlob: null as null | File | Blob,
      h5baseBlob: null as null | File | Blob,
      h5zoneLookup: {} as TAZLookup,
      globalState: globalStore.state,
      filename: '',
      filenameShapes: '',
      filenameBase: '',

      h5Main: null as any,
      h5MainWorker: null as null | Worker,
      h5Compare: null as any,
      h5CompareWorker: null as null | Worker,

      matrices: {} as { [key: string]: Matrix },
      matrixSize: 0,
      shapes: [] as any[],
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
      row2zone: '',
    }
  },

  beforeDestroy() {
    this.h5Main = null
    this.h5MainWorker?.terminate()
    this.h5Compare = null
    this.h5CompareWorker?.terminate()

    this.config = null
    this.comparators = []
    this.h5fileBlob = null
    this.h5baseBlob = null
    this.h5zoneLookup = {}
    this.matrices = {}
    this.shapes = []
    this.zoneSystems = { byID: {}, bySize: {} }
  },

  async mounted() {
    this.debounceDragEnd = debounce(this.dragEnd, 500)
    this.useConfig = this.config || this.yamlConfig || '' // use whichever one was sent to us

    await this.getVizDetails()

    await this.setupAvailableZoneSystems()
    this.fetchLastSettings()
    this.honorQueryParameters()

    // not really done loading yet but the spinny is ugly
    this.$emit('isLoaded')

    this.comparators = this.setupComparisons()

    this.shapes = await this.loadShapes()
    if (this.shapes.length) this.hasShapes = true

    try {
      await this.initH5Files()
      if (!this.h5Main) return

      this.h5zoneLookup = await this.buildTAZLookup()
      let initialTable = this.$route.query.table || localStorage.getItem('matrix-initial-table')
      if (!initialTable) initialTable = await this.h5Main.catalog[0]

      // if saved table is not in THIS matrix, revert to first table
      const catalog = await this.h5Main.getCatalog()
      if (initialTable && !catalog?.includes(initialTable)) {
        initialTable = catalog[0]
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
    cleanLookupNames() {
      return Object.keys(this.h5zoneLookup)
        .map(lookup => lookup.slice(lookup.lastIndexOf('/') + 1))
        .sort()
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

    async h5Main() {
      if (!this.h5Main) return
      this.catalog = await this.h5Main.getCatalog()
      this.matrixSize = await this.h5Main.getSize()
    },
  },

  methods: {
    async setMap(isMap: boolean) {
      this.isMap = isMap

      if (isMap) {
        this.h5fileBlob = null
      } else {
        this.isGettingMatrices = true
        this.h5fileBlob = await this.buildH5Blob()
        this.isGettingMatrices = false
      }
    },

    async buildH5Blob() {
      const size = Math.floor(Math.sqrt(this.matrices.main.data.length))
      // rewrite the matrices to be in zone-number order
      const zmatrix = {} as { [table: string]: Float32Array | Float64Array | number[] }
      for (const table of Object.keys(this.matrices)) {
        zmatrix[table] = this.matrices[table].data.slice()
        const offsetLookup = this.h5zoneLookup[this.row2zone]?.offset2zone
        if (offsetLookup) {
          for (let j = 0; j < size; j++) {
            for (let i = 0; i < size; i++) {
              const zi = offsetLookup[i] - 1
              const zj = offsetLookup[j] - 1
              zmatrix[table][zi * size + zj] = this.matrices[table].data[i * size + j]
            }
          }
        }
      }

      // we are going to fabricate an HDF5 file with the current matrix content!
      const buffer = await this.h5Main.buildH5Buffer({
        size,
        main: zmatrix.main,
        base: zmatrix.base || null,
        diff: zmatrix.diff || null,
      })

      const uint8 = new Uint8Array(buffer)
      const tableLabel = this.activeTable.replaceAll('&nbsp;', ' ')
      const blob = new File([uint8], tableLabel, { type: 'application/octet-stream' })
      return blob
    },

    async addBase() {},

    async changeMatrix(table: any) {
      console.log('table:', table)
      if (!table || table == 'undefined') {
        this.activeTable = ''
        this.$router.replace({ query: {} }).catch(() => {})
        return
      }

      this.activeTable = table
      this.$router.replace({ query: { ...this.$route.query, table } }).catch(() => {})
      await this.getMatrices()
      localStorage.setItem('matrix-initial-table', table)

      if (!this.isMap) this.h5fileBlob = await this.buildH5Blob()
      this.isGettingMatrices = false
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
            mainMatrix.data.forEach((v: number, i: number) => {
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
        // this.isGettingMatrices = false
        this.statusText = ''
      }
    },

    async initH5Files() {
      if (!this.yamlConfig) {
        this.statusText = `<h3>MATRIX VIEWER</h3><br/>Drop an <b>OMX/HDF5</b> matrix file here<br/><br/>or a <b>GeoJSON/GeoPackage/Shapefile.zip</b> zonal boundary<br/>file to view it on a map`
        return
      }
      if (!this.fileSystem) return

      this.statusText = `Loading: ${this.filename}...`
      await this.$nextTick()

      // if we have a yaml config, use it
      this.filename = '' + this.yamlConfig
      if (this.config) this.filename = this.config.dataset

      this.h5MainWorker = new H5ProviderWorker()
      this.h5Main = Comlink.wrap(this.h5MainWorker) as unknown

      const zkey = `auth-token-${this.fileSystem.slug}`
      const token = localStorage.getItem(zkey) || ''

      try {
        await this.h5Main.open({
          fileSystem: this.fileSystem,
          subfolder: this.subfolder,
          filename: this.filename,
          token,
        })
      } catch (e) {
        console.error('' + e)
        this.$emit('error', `${e}: ${this.subfolder}/${this.filename}`)
        return
      }

      this.catalog = await this.h5Main.getCatalog()
      this.matrixSize = await this.h5Main.getSize()
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

    async loadShapes(): Promise<any[]> {
      if (!this.vizDetails.shapes || !this.fileApi) return []

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
      return []
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

      this.h5CompareWorker?.terminate()
      this.h5CompareWorker = new H5ProviderWorker()
      this.h5Compare = Comlink.wrap(this.h5CompareWorker) as unknown

      const zkey = `auth-token-${this.fileSystem.slug}`
      const token = localStorage.getItem(zkey) || ''

      try {
        await this.h5Compare.open({
          fileSystem: this.fileSystem,
          subfolder: comparisonMatrix.subfolder,
          filename: comparisonMatrix.filename,
          token,
        })
      } catch (e) {
        console.error('' + e)
        this.$emit('error', `${e}: ${comparisonMatrix.subfolder}/${comparisonMatrix.filename}`)
        return
      }

      // drag/drop mode, no "root" filesystem. Just set this as base.
      if (comparisonMatrix.root === '') {
        // this.h5baseBlob = this.h5fileBlob
        // this.setCompareLabel(base.filename)
        return
      }

      this.compareLabel = `Comparing to ${comparisonMatrix.subfolder}/${comparisonMatrix.filename}`

      this.setDivergingColors()
      this.changeScale('symlog')

      await this.getMatrices()
      this.isGettingMatrices = false
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

        if (/(gpkg|json|json\.gz|zip|geojson|geojson\.gz)$/.test(file0.name.toLocaleLowerCase())) {
          this.handleDroppedBoundaries(file0)
        } else {
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

    handleClickedSelectRowLookup(event: any) {
      this.statusText = ''
      this.showSelectRowLookupDialog = false
      if (event == 0) return
      this.row2zone = Object.keys(this.h5zoneLookup)[event - 1]
      this.changeMatrix(this.activeTable)
    },

    handleClickedAskCompare(event: any) {
      this.statusText = ''
      switch (event) {
        case 0: // cancel
          this.showCompareOrReplaceDialog = false
          break
        case 1: // replace
          this.h5Main = null
          this.handleDroppedMatrix(this.showCompareOrReplaceDialog)
          break
        case 2: // compare
          this.handleDroppedCompareMatrix()
        default:
          break
      }
    },

    async handleDroppedCompareMatrix() {
      console.log('HANDLE DROPPED COMPARE MATRIX')
      this.isDragging = false

      // File handle is in this.showCompareOrReplaceDialog
      const file = this.showCompareOrReplaceDialog as File
      this.showCompareOrReplaceDialog = false

      if (!this.fileSystem) return

      this.h5CompareWorker?.terminate()
      this.h5CompareWorker = new H5ProviderWorker()
      this.h5Compare = Comlink.wrap(this.h5CompareWorker) as unknown

      const zkey = `auth-token-${this.fileSystem.slug}`
      const token = localStorage.getItem(zkey) || ''

      try {
        this.h5Compare.open({
          file,
          subfolder: '',
          filename: file.name,
          token,
        })
      } catch (e) {
        console.error('' + e)
        this.$emit('error', `${e}: ${file.name}`)
        return
      }

      this.compareLabel = `Comparing to ${file.name}`

      this.setDivergingColors()
      this.changeScale('symlog')

      await this.getMatrices()
      this.isGettingMatrices = false
    },

    async handleDroppedMatrix(file: any) {
      console.log('HANDLE DROPPED MATRIX')
      this.isDragging = false

      // If a matrix is already open, then we ask user if this file is for replace or compare.
      if (this.h5Main) {
        this.showCompareOrReplaceDialog = file
        return
      } else {
        this.showCompareOrReplaceDialog = false
      }

      this.statusText = 'Loading...'

      // clear old buffer from UI
      this.h5fileBlob = null
      await this.$nextTick()

      this.h5MainWorker?.terminate()
      this.h5MainWorker = new H5ProviderWorker()
      this.h5Main = Comlink.wrap(this.h5MainWorker) as unknown
      // this opens file, sets up the dimensions and matrix catalog
      try {
        await this.h5Main.open({
          file,
          subfolder: '',
          filename: this.filename,
          token: '',
        })
      } catch (e) {
        console.error('' + e)
        this.$emit('error', `${e}: ${this.filename}`)
        return
      }

      this.h5fileBlob = file
      this.filename = file.name || 'File'
      this.$emit('title', this.filename)
      this.setCompareLabel(file.name)

      this.catalog = await this.h5Main.getCatalog()
      this.matrixSize = await this.h5Main.getSize()
      this.statusText = ''

      this.statusText = 'Building lookup table'
      await this.$nextTick()
      this.h5zoneLookup = await this.buildTAZLookup()

      this.statusText = ''

      // maybe this matrix is a size we recognize
      if (this.zoneSystems.bySize[this.matrixSize]) {
        const rowlookup = this.zoneSystems.bySize[this.matrixSize].rowlookup
        this.row2zone = rowlookup ? `/lookup/${rowlookup}` : ''
        this.hasShapes = true
      }

      const initialTable = localStorage.getItem('matrix-initial-table') || this.catalog[0]
      if (initialTable) await this.changeMatrix(initialTable)

      // no shapes yet? Just show matrix table
      if (!this.hasShapes) {
        this.isMap = false
      }
    },

    async handleDroppedBoundaries(file: File) {
      this.isDragging = false
      this.hasDroppedBoundaries = false
      this.statusText = 'Loading geography...'
      await this.$nextTick()

      try {
        const name = file.name.toLocaleLowerCase()
        let features = [] as any[]
        // GeoPackage
        if (name.endsWith('.gpkg')) {
          const buffer = await file.arrayBuffer()
          features = await Geotools.loadGeoPackageFromBuffer(buffer)
        }
        // Shapefile as .ZIP
        else if (name.endsWith('.zip')) {
          const buffer = await file.arrayBuffer()
          features = await Geotools.loadShapefileFromBuffers({ zip: buffer })
        }
        // GeoJSON
        else if (name.indexOf('json') > -1) {
          const buffer = await file.arrayBuffer()
          const rawtext = await gUnzip(buffer)
          const text = new TextDecoder().decode(rawtext)
          const geojson = JSON.parse(text)
          features = geojson?.features
        }

        let tazlookup = localStorage.getItem('matrixviewer-taz-lookup') || 'TAZ'
        tazlookup = await new Promise<string>(resolve => {
          const m = prompt('ID / TAZ Column', tazlookup) || tazlookup
          if (m) localStorage.setItem('matrixviewer-taz-lookup', m)
          resolve(m)
        })

        this.filenameShapes = file.name || 'File'
        this.shapes = features
        this.zoneID = tazlookup
        this.hasDroppedBoundaries = true

        await this.$nextTick()

        this.isMap = true
        this.statusText = ''
        if (!this.h5fileBlob) {
          this.$emit(
            'error',
            'Shapes loaded. Now drop an HDF5 file here and click a zone to view it'
          )
        } else {
          this.changeMatrix(this.activeTable)
        }
      } catch (e) {
        console.error('' + e)
      }
    },

    async setupAvailableZoneSystems() {
      try {
        const url = BASE_URL + 'zones/zones.yaml'

        const config = await (await fetch(url)).text()
        const zoneSystemConfigs = YAML.parse(config) as { [id: string]: ZoneSystem }

        for (const key of Object.keys(zoneSystemConfigs)) {
          const zs = zoneSystemConfigs[key]

          // parse sizes and turn into an array
          let sizes = zs.sizes as any
          if (Number.isInteger(sizes)) sizes = `${sizes}`
          sizes = sizes.split(',').map((n: any) => parseInt(n)) as number[]

          const system = { key, url: zs.url, lookup: zs.lookup, sizes, rowlookup: zs.rowlookup }
          this.zoneSystems.byID[key] = system
          sizes.forEach((size: any) => (this.zoneSystems.bySize[size] = system))
        }

        // Also include Flask zone systems
        const flaskZoneSystems = this.globalState.flaskConfig.zones as { [id: string]: ZoneSystem }
        if (flaskZoneSystems) {
          for (const key of Object.keys(flaskZoneSystems)) {
            const zs = flaskZoneSystems[key]

            let sizes = zs.sizes as any
            if (Number.isInteger(sizes)) sizes = `${sizes}`
            sizes = sizes.split(',').map((n: any) => parseInt(n)) as number[]

            const system = {
              key,
              url: zs.file || '',
              lookup: zs.lookup,
              rowlookup: zs.rowlookup || '',
              sizes,
              flask: true,
            }
            this.zoneSystems.byID[key] = system
            sizes.forEach((size: any) => (this.zoneSystems.bySize[size] = system))
          }
        }
      } catch (e) {
        console.error('ZONESYSTEM: ' + e)
      }
    },

    async buildTAZLookup(): Promise<TAZLookup> {
      const lookup = {} as TAZLookup
      if (!this.h5Main) return lookup

      const catalog = await this.h5Main.getCatalog()
      const lookups = (await this.h5Main.getLookups()) as string[]

      if (catalog?.indexOf('zone_number') > -1) {
        // If "zone_number" array exists, build lookup from that
        const offset2zone = await this.h5Main.getDataArray('zone_number')
        const zone2offset = {} as any
        offset2zone.data.forEach((zone: any, offset: number) => {
          zone2offset[zone] = offset
        })
        lookup['zone_number'] = { offset2zone: offset2zone.data, zone2offset }
      } else if (lookups.length) {
        // If we have rowlookups, use that
        for (const lll of lookups) {
          const offset2zone = await this.h5Main.getLookup(lll)
          const zone2offset = {} as any
          offset2zone.data.forEach((zone: any, i: number) => {
            zone2offset[zone] = i
          })
          lookup[lll] = { offset2zone: offset2zone.data, zone2offset }
        }
      } else {
        // NO LOOKUPS! Assume numbers monotonically increase
      }

      // If there is more than one lookup, and size doesnt define a rowlookup, and user
      // hasn't already told us, then we need to ask user which lookup to use.
      if (
        !this.row2zone &&
        Object.keys(lookup).length > 1 &&
        !this.zoneSystems.bySize[this.matrixSize]
      ) {
        console.log(100, this.matrixSize)
        this.showSelectRowLookupDialog = true
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
