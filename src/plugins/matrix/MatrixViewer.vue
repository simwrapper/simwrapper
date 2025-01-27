<template lang="pug">
.matrix-viewer(v-if="!thumbnail")
  config-panel(
    :isMap="isMap"
    :mapConfig="mapConfig"
    :comparators="comparators"
    :compareLabel="compareLabel"
    @setMap="isMap=$event"
    @shapes="filenameShapes=$event"
    @changeColor="changeColor"
    @changeScale="changeScale"
    @changeRowWise="changeRowWise"
    @addBase="addBase"
    @compare="compareToBase"
  )

  .main-area(
    :class="{'is-dragging': isDragging}"
    @drop="onDrop"
    @dragstart="dragStart"
    @dragover="stillDragging"
    @dragleave="debounceDragEnd"
    @dragover.prevent
    @dragenter.prevent
  )

    .status-text(v-if="statusText")
      h4 {{ statusText }}

    H5Map-viewer.fill-it(v-if="isMap && h5fileBlob"
      :fileApi="fileApi"
      :subfolder="subfolder"
      :blob="h5fileBlob"
      :baseBlob="h5baseBlob"
      :filenameH5="filename"
      :filenameShapes="filenameShapes"
      :shapes="shapes"
      :userSuppliedZoneID="zoneID"
      :mapConfig="mapConfig"
      :zoneSystems="zoneSystems"
      @nozones="isMap=false"
    )

    H5Web.fill-it.h5-table-viewer(v-if="h5fileBlob && !isMap"
      :filename="filename"
      :blob="h5fileBlob"
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

import H5Web from './H5TableViewer'
import H5MapViewer from './H5MapViewer.vue'
import ConfigPanel from './ConfigPanel.vue'

import { ColorMap } from '@/components/ColorMapSelector/models'
import { ScaleType } from '@/components/ScaleSelector/ScaleOption'
import { COLORMAP_GROUPS } from '@/components/ColorMapSelector/groups'

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
  components: { H5Web, H5MapViewer, ConfigPanel },
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
      h5wasm: null as null | Promise<any>,
      h5zoneFile: null as null | H5WasmFile,
      h5fileBlob: null as null | File | Blob,
      h5baseBlob: null as null | File | Blob,
      globalState: globalStore.state,
      filename: '',
      filenameShapes: '',
      filenameBase: '',
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
      matrices: ['1', '2'] as string[],
      activeTable: '',
      debounceDragEnd: {} as any,
      mapConfig: {
        scale: ScaleType.Linear,
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

    // not really done loading yet but the spinny is ugly
    this.$emit('isLoaded')

    this.comparators = this.setupComparisons()

    this.shapes = await this.loadShapes()
    this.h5fileBlob = (await this.loadFile()) || null
    this.h5baseBlob = (await this.loadBaseFile()) || null

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

    saveMapSettings() {
      const json = JSON.stringify(this.mapConfig)
      localStorage.setItem('matrixviewer-map-config', json)
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

    async loadBaseFile() {
      if (!this.yamlConfig) return null
      if (this.config) this.filenameBase = this.config.basedata
      if (!this.filenameBase) return null

      this.statusText = `Loading: ${this.filenameBase}...`

      const path = `${this.subfolder}/${this.filenameBase}`
      const blob = await this.fileApi?.getFileBlob(path)
      this.statusText = ''
      return blob
    },

    async loadFile() {
      if (!this.yamlConfig) {
        this.statusText = `Drop an HDF5 or GeoJSON file here to view it`
        return null
      }

      // if we have a yaml config, use it
      this.filename = '' + this.yamlConfig
      if (this.config) {
        this.filename = this.config.dataset
      }

      this.statusText = `Loading: ${this.filename}...`

      const path = `${this.subfolder}/${this.filename}`
      const blob = await this.fileApi?.getFileBlob(path)
      this.statusText = ''
      return blob
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

    addBase() {
      const comparator = {
        root: this.root,
        subfolder: this.subfolder,
        filename: this.filename,
      }

      // just save the last one
      this.comparators = [comparator]

      // only save this as a possible comparator matrix IF we have a root filesystem
      // since those are the only ones we can retrieve later...
      // (drag/drop files don't have a path associated with them)
      if (this.root) {
        localStorage.setItem('h5mapComparators', JSON.stringify(this.comparators))
      }

      this.compareToBase(comparator)
    },

    async compareToBase(base: ComparisonMatrix) {
      console.log('COMPARE', base)

      this.filenameBase = base.filename

      // drag/drop mode, no "root" filesystem. Just set this as base.
      if (base.root === '') {
        this.h5baseBlob = this.h5fileBlob
        this.setCompareLabel(base.filename)
        return
      }

      try {
        const path = `${base.subfolder}/${base.filename}`
        this.statusText = `Loading: ${base.filename}...`

        const fileSystem: FileSystemConfig = this.$store.state.svnProjects.find(
          (a: FileSystemConfig) => a.slug === base.root
        )
        const baseFileApi = new HTTPFileSystem(fileSystem, globalStore)

        const blob = await baseFileApi.getFileBlob(path)

        this.h5baseBlob = blob
        this.compareLabel = `Compare: ${this.filename} to ${base.filename}`
        this.statusText = ''
        this.setCompareLabel(base.filename)
        this.setDivergingColors()
        console.log({ h5BaseBlob: this.h5baseBlob })
      } catch (e) {
        console.error('' + e)
        this.h5baseBlob = null
      }
      this.statusText = ''
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

    async dragEnd(event: any) {
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

      this.h5fileBlob = file
      this.filename = file.name || 'File'
      this.$emit('title', this.filename)
      this.setCompareLabel(file.name)
      this.statusText = ''

      return
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
}

.status-text h4 {
  margin: auto 0rem;
  padding: 3rem 0;
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
  padding: 0.75rem;
}
</style>
