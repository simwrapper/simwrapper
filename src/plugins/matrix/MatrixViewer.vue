<template lang="pug">
.matrix-viewer
  .flex-row
    b-input(placeholder="filename.h5" v-model="filename")
    b-button(@click="loadFile") Open

  .thing(v-if="h5file")
    H5Web.h5web(:filename="filename" :buffer="h5file")

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import nprogress from 'nprogress'
import YAML from 'yaml'

import globalStore from '@/store'
import { FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import H5Web from './H5Web'

const MyComponent = defineComponent({
  name: 'MatrixViewer',
  components: { H5Web },
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
      globalState: globalStore.state,
      filename: 'HWYALLAM.h5',
      h5file: null as any,
      useConfig: '',
      vizDetails: { title: '', description: '' } as any,
      loadingText: 'Loading',
      title: '',
      description: '',
    }
  },
  async mounted() {
    this.useConfig = this.config || this.yamlConfig || '' // use whichever one was sent to us

    // if (this.cardId) {
    //   this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    // }

    await this.getVizDetails()
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
      console.log(1)
      this.filename = '' + this.yamlConfig

      const path = `${this.subfolder}/${this.yamlConfig}`
      const blob = await this.fileApi.getFileBlob(path)
      const buffer = await blob.arrayBuffer()
      this.h5file = buffer
    },

    // this happens if viz is the full page, not a thumbnail on a project page
    buildRouteFromUrl() {
      const params = this.$route.params
      if (!params.project || !params.pathMatch) {
        console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
        return
      }

      // subfolder and config file
      const sep = 1 + params.pathMatch.lastIndexOf('/')
      const subfolder = params.pathMatch.substring(0, sep)
      const config = params.pathMatch.substring(sep)

      // this.subfolder = subfolder
      this.useConfig = config
    },

    async getVizDetails() {
      // There is no YAML config for an HDF5 file; we just have the file.
      // Load it!

      if (this.thumbnail) return

      this.filename = '' + this.yamlConfig
      this.loadFile()
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';
// @import '@h5web/app/dist/styles.css';

.matrix-viewer {
  position: absolute;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  flex-direction: column-reverse;
  background-color: var(--bgDashboard);
}

.thing {
  flex: 1;
  background-color: lightyellow;
  position: relative;
}

.h5web {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.flex-row {
  margin-top: 1rem;
}
</style>
