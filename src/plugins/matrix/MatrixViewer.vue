<template lang="pug">
.matrix-viewer(v-if="!thumbnail")
  config-panel(
    :isMap="isMap"
    :mapConfig="mapConfig"
    :comparators="comparators"
    @setMap="isMap=$event"
    @shapes="filenameShapes=$event"
    @changeColor="changeColor"
    @changeScale="mapConfig.scale=$event"
    @changeRowWise="mapConfig.isRowWise=$event"
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

    H5Map-viewer.fill-it(v-if="isMap && h5buffer"
      :fileApi="fileApi"
      :subfolder="subfolder"
      :buffer="h5buffer"
      :diffBuffer="h5DiffBuffer"
      :filenameH5="filename"
      :filenameShapes="filenameShapes"
      :shapes="shapes"
      :mapConfig="mapConfig"
      :zoneSystems="zoneSystems"
    )

    H5Web.fill-it.h5-table-viewer(v-if="h5buffer && !isMap"
      :filename="filename"
      :buffer="h5buffer"
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import YAML from 'yaml'
import { debounce } from 'debounce'
import { Dataset, File as H5WasmFile, Group as H5WasmGroup, ready as h5wasmReady } from 'h5wasm'

import globalStore from '@/store'
import { DEFAULT_PROJECTION, FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import H5Web from './H5TableViewer'
import H5MapViewer from './H5MapViewer.vue'
import ConfigPanel from './ConfigPanel.vue'

import { ColorMap } from '@/components/ColorMapSelector/models'
import { ScaleType } from '@/components/ScaleSelector/ScaleOption'

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
    config: String,
    thumbnail: Boolean,
    cardId: String,
  },
  data: () => {
    return {
      title: '',
      description: '',
      comparators: [] as ComparisonMatrix[],
      isDragging: false,
      isMap: true,
      h5wasm: null as null | Promise<any>,
      h5zoneFile: null as null | H5WasmFile,
      globalState: globalStore.state,
      filename: '',
      filenameShapes: '',
      shapes: null as null | any[],
      h5buffer: null as null | ArrayBuffer,
      h5DiffBuffer: null as null | ArrayBuffer,
      useConfig: '',
      vizDetails: { title: '', description: '' },
      statusText: 'Loading...',
      layerId: Math.floor(1e12 * Math.random()),
      matrices: ['1', '2'] as string[],
      activeTable: '1',
      debounceDragEnd: {} as any,
      mapConfig: {
        scale: ScaleType.Linear,
        colormap: 'Viridis',
        isInvertedColor: false,
        isRowWise: true,
      } as MapConfig,
      zoneSystems: { byID: {}, bySize: {} } as ZoneSystems,
    }
  },
  async mounted() {
    this.debounceDragEnd = debounce(this.dragEnd, 500)
    this.useConfig = this.config || this.yamlConfig || '' // use whichever one was sent to us

    await this.getVizDetails()

    // don't actually load any files if we're just in the file browser
    if (this.thumbnail) return

    await this.setupAvailableZoneSystems()

    this.comparators = this.setupComparisons()
    this.h5buffer = await this.loadFile()
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
    async loadFile() {
      if (!this.yamlConfig) {
        this.statusText = `Drop an HDF5 file here to view it`
        return null
      }

      this.filename = '' + this.yamlConfig
      this.statusText = `Loading: ${this.filename}...`

      const path = `${this.subfolder}/${this.yamlConfig}`
      const blob = await this.fileApi?.getFileBlob(path)
      const buffer = (await blob?.arrayBuffer()) || null
      this.statusText = ''
      return buffer
    },

    async getVizDetails() {
      this.$emit('title', `Matrix - ${this.yamlConfig}`)
    },

    changeColor(event: any) {
      // inversion
      if (!event) {
        this.mapConfig.isInvertedColor = !this.mapConfig.isInvertedColor
      } else {
        this.mapConfig.colormap = event
      }
    },

    changeMapConfig(event: any) {
      console.log('BOOP', event)
    },

    getContainerStyle(panel: any, x: number, y: number) {
      let style: any = {}
      return style
      // const rightPadding = x === this.panels[y].length - 1 ? '6px' : '0'
      // padding: this.isMultipanel ? `6px ${rightPadding} 6px 6px` : '0px 0px',
    },

    setupComparisons() {
      const comparisons = localStorage.getItem('h5mapComparators')
      if (!comparisons) return []

      return JSON.parse(comparisons)
    },

    addBase() {
      this.comparators = [
        {
          root: this.root,
          subfolder: this.subfolder,
          filename: this.filename,
        },
      ]
      localStorage.setItem('h5mapComparators', JSON.stringify(this.comparators))
    },

    async compareToBase(base: ComparisonMatrix) {
      console.log('COMPARE', base)

      try {
        const path = `${base.subfolder}/${base.filename}`
        this.statusText = `Loading: ${base.filename}...`

        const fileSystem: FileSystemConfig = this.$store.state.svnProjects.find(
          (a: FileSystemConfig) => a.slug === base.root
        )
        const baseFileApi = new HTTPFileSystem(fileSystem, globalStore)

        const blob = await baseFileApi.getFileBlob(path)
        const buffer = await blob?.arrayBuffer()

        this.h5DiffBuffer = buffer
        this.statusText = ''
        console.log({ h5DiffBuffer: this.h5DiffBuffer })
      } catch (e) {
        console.error('' + e)
        this.h5DiffBuffer = null
      }
      this.statusText = ''
    },

    async onDrop(event: any) {
      event.preventDefault()
      this.isDragging = false

      try {
        const files = event.dataTransfer?.files as FileList
        const file0 = files.item(0)
        if (!file0) return

        this.handleDroppedMatrix(file0)

        // if (/(geojson|geojson\.gz)$/.test(file0.name)) {
        //   console.log('GeoJSON!')
        //   this.handleDroppedBoundaries(event)
        // } else {
        //   console.log('Not GeoJSON!')
        //   this.handleDroppedMatrix(event)
        // }
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

      let oldbuffer = this.h5buffer
      let dropbuffer = null
      this.h5buffer = null

      // clear old buffer from UI
      await this.$nextTick()

      try {
        dropbuffer = await file.arrayBuffer()
        this.statusText = ''
        if (dropbuffer) {
          this.filename = file.name || 'File'
        }
      } catch (e) {
        console.error('' + e)
        dropbuffer = null
      }

      // WHAT DID USER wANt??

      if (!oldbuffer && !this.h5DiffBuffer) {
        // if none are set, this is normal data
        this.h5buffer = dropbuffer
      } else if (oldbuffer && !this.h5DiffBuffer) {
        // if no base set but normal data already set,
        // then move normal -> base, and this is new normal
        this.h5DiffBuffer = oldbuffer
        this.h5buffer = dropbuffer
      } else {
        // if base is already set, replace normal data and keep base as-is
        this.h5buffer = dropbuffer
      }
    },

    async handleDroppedBoundaries(file: File) {
      this.isDragging = false
      this.statusText = 'Loading geography...'
      await this.$nextTick()
      try {
        const geojson = JSON.parse(await file.text())
        this.filenameShapes = file.name || 'File'
        this.shapes = geojson.features
        this.statusText = ''
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
          console.log(1, sizes)
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
