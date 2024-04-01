<template lang="pug">
.matrix-viewer(v-if="!thumbnail")
  matrix-selector-panel(
    :isMap="isMap"
    :mapConfig="mapConfig"
    @setMap="isMap=$event"
    @shapes="filenameShapes=$event"
    @changeColor="changeColor"
    @changeScale="mapConfig.scale=$event"
    @changeRowWise="mapConfig.isRowWise=$event"
  )

  .main-area
    h4.status-text(v-if="statusText") {{ statusText }}

    H5Map-viewer.fill-it(v-if="isMap && h5buffer"
      :fileApi="fileApi"
      :subfolder="subfolder"
      :buffer="h5buffer"
      :filenameH5="yamlConfig"
      :filenameShapes="filenameShapes"
      :mapConfig="mapConfig"
    )

    H5Web.fill-it.h5web(v-if="h5buffer && !isMap"
      :filename="filename"
      :buffer="h5buffer"
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import * as shapefile from 'shapefile'
import * as turf from '@turf/turf'
import { Dataset, File as H5WasmFile, Group as H5WasmGroup, ready as h5wasmReady } from 'h5wasm'

import globalStore from '@/store'
import { DEFAULT_PROJECTION, FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import H5Web from './H5TableViewer'
import H5MapViewer from './H5MapViewer.vue'
import MatrixSelectorPanel from './MatrixSelectorPanel.vue'

import { ColorMap } from '@/components/ColorMapSelector/models'
import { ScaleType } from '@/components/ScaleSelector/ScaleOption'

export interface MapConfig {
  scale: ScaleType
  colormap: ColorMap
  isInvertedColor: Boolean
  isRowWise: Boolean
}

const MyComponent = defineComponent({
  name: 'MatrixViewer',
  components: { H5Web, H5MapViewer, MatrixSelectorPanel },
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
      isMap: true,
      h5wasm: null as null | Promise<any>,
      h5zoneFile: null as null | H5WasmFile,
      globalState: globalStore.state,
      filename: '',
      filenameShapes: '/dist15.geojson',
      h5buffer: null as null | ArrayBuffer,
      useConfig: '',
      vizDetails: { title: '', description: '' },
      statusText: 'Loading...',
      layerId: Math.floor(1e12 * Math.random()),
      matrices: ['1', '2'] as string[],
      activeTable: '1',
      mapConfig: {
        scale: ScaleType.Linear,
        colormap: 'Viridis',
        isInvertedColor: false,
        isRowWise: true,
      } as MapConfig,
    }
  },
  async mounted() {
    this.useConfig = this.config || this.yamlConfig || '' // use whichever one was sent to us
    await this.getVizDetails()

    // don't actually load any files if we're just in the file browser
    if (this.thumbnail) return

    this.h5buffer = await this.loadFile()
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },
    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
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
      this.filename = '' + this.yamlConfig
      this.statusText = `Loading: ${this.filename}...`

      const path = `${this.subfolder}/${this.yamlConfig}`
      const blob = await this.fileApi.getFileBlob(path)
      const buffer = await blob.arrayBuffer()
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
  text-align: center;
  // font-weight: bold;
  padding: 3rem 0;
  margin-top: 5rem;
}
</style>
