<template lang="pug">
.vega-container(v-if="myState.yamlConfig")

  .labels(v-if="!config && !thumbnail")
    h3.center {{ title }}
    h5.center {{ description }}

  .zippy(:id="zippyId")
    .vega-chart(:id="cleanConfigId")

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import nprogress from 'nprogress'
import vegaEmbed from 'vega-embed'

import globalStore from '@/store'
import { FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const MyComponent = defineComponent({
  name: 'VegaPlugin',
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
      myState: {
        subfolder: '',
        yamlConfig: '',
        thumbnail: false,
      } as any,
      vizDetails: { title: '', description: '' } as any,
      loadingText: 'Loading',
      totalTrips: 0,
      title: '',
      description: '',
      cleanConfigId: 'vega-' + Math.floor(Math.random() * 1e12),
      zippyId: 'zippy-' + Math.floor(Math.random() * 1e12),
      hasHardCodedHeight: false,
    }
  },
  async mounted() {
    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.config || this.yamlConfig || '' // use whichever one was sent to us
    this.myState.subfolder = this.subfolder

    if (this.cardId) {
      this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    }

    await this.getVizDetails()
    this.embedChart()
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
    hasFacets(): boolean {
      if (!this.vizDetails) return false
      if (!this.vizDetails.encoding) return false

      if (
        this.vizDetails.encoding.facet ||
        this.vizDetails.encoding.row ||
        this.vizDetails.encoding.column
      )
        return true

      return false
    },
  },
  watch: {
    'globalState.isDarkMode'() {
      this.embedChart()
    },
    'globalState.resizeEvents'() {
      this.changeDimensions()
    },
    'globalState.authAttempts'() {
      console.log('AUTH CHANGED - Reload')
      this.getVizDetails()
      if (this.vizDetails) this.embedChart()
    },

    yamlConfig() {
      this.myState.yamlConfig = this.yamlConfig || ''
      this.getVizDetails()
      if (this.vizDetails) this.embedChart()
    },

    subfolder() {
      this.myState.subfolder = this.subfolder
      this.getVizDetails()
      if (this.vizDetails) this.embedChart()
    },
  },
  methods: {
    changeDimensions() {
      // figure out dimensions, depending on if we are in a dashboard or not
      let box = document.querySelector(`#${this.zippyId}`) as Element
      if (!box) return

      if (this.thumbnail) this.vizDetails.height = 125

      this.embedChart()
    },

    getFileSystem(name: string) {
      const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
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

      this.myState.subfolder = subfolder
      this.myState.yamlConfig = config
    },

    async getVizDetails() {
      this.vizDetails = await this.loadFiles()
      this.loadingText = ''
      nprogress.done()
    },

    async loadFiles() {
      let json: any = { data: {} }

      // might be a project config:
      const filename = this.myState.subfolder + '/' + this.myState.yamlConfig

      try {
        this.loadingText = 'Loading config...'

        json = await this.fileApi.getFileJson(filename)

        this.description = json.description || ''
        this.title = json.title
          ? json.title
          : this.myState.yamlConfig
              .substring(0, this.myState.yamlConfig.length - 10)
              .replace(/_/g, ' ')

        this.$emit('title', this.title)
      } catch (err) {
        const e = err as any
        console.error({ e })
        this.loadingText = '' + e

        let msg = 'Error loading: ' + filename
        if (e.statusText === 'File not found') msg = 'File not found: ' + filename
        if (e.name === 'SyntaxError') msg = 'Error parsing JSON: ' + filename
        this.$emit('error', msg)

        return
      }

      // If it's not an HTTP URL, then we should fetch it ourselves and then
      // hand it to Vega which will parse it .
      if (json.data.url && !json.data.url.startsWith('http')) {
        const path = `/${this.myState.subfolder}/${json.data.url}`

        try {
          const rawData = await this.fileApi.getFileText(path)
          json.data = {
            values: rawData,
            format: { type: path.toLocaleLowerCase().endsWith('json') ? 'json' : 'csv' },
          }
        } catch (err) {
          const e = err as any
          console.error(e)

          let msg = 'Error loading: ' + path
          if (e.statusText === 'File not found') msg = 'File not found: ' + path
          if (e.name === 'SyntaxError') msg = 'Error parsing JSON: ' + path
          this.$emit('error', msg)
        }
      }

      // just pass the config to Vega
      return json
    },

    async embedChart() {
      if (!this.vizDetails) return

      let box = document.querySelector(`#${this.cleanConfigId}`) as Element
      if (!box) return

      this.loadingText = 'Building chart...'

      const exportActions = { export: true, source: false, compiled: false, editor: false }

      const embedOptions = {
        actions: this.thumbnail ? false : exportActions,
        hover: true,
        scaleFactor: 2.0, // make exported PNGs bigger
      }

      // remove legends on thumbnails so chart fits better
      if (this.thumbnail && this.vizDetails.encoding) {
        for (const layer of Object.keys(this.vizDetails.encoding)) {
          this.vizDetails.encoding[layer].legend = null
        }
      }

      // set background and text colors
      this.vizDetails = Object.assign(
        this.vizDetails,
        this.globalState.isDarkMode
          ? {
              // dark mode
              background: '#00000000',
              config: {
                title: { color: 'white' },
                axis: { titleColor: 'white', labelColor: 'white', gridColor: '#404040' },
                legend: { titleColor: 'white', labelColor: 'white' },
              },
            }
          : {
              // light mode
              background: '#00000000',
              config: {
                title: { color: '#222' },
                axis: { titleColor: '#222', labelColor: '#222' },
                legend: { titleColor: '#222', labelColor: '#222' },
              },
            }
      )

      // Note whether user specified a height; we need to know this if the page size changes
      this.hasHardCodedHeight = !!this.vizDetails.height

      // Use responsive size unless user has forced a size on us
      if (!this.vizDetails.width) this.vizDetails.width = 'container'
      if (!this.vizDetails.height) this.vizDetails.height = 'container'

      try {
        await vegaEmbed(`#${this.cleanConfigId}`, this.vizDetails, embedOptions)
      } catch (e) {
        let message = '' + e
        console.error(message)

        if (message.indexOf('{') > -1) message = message.substring(0, message.indexOf('{'))

        this.$emit('error', 'Vega: ' + message)
      }
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.vega-container {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr;
  background-color: var(--bgDashboard);
}

.labels {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  margin: 1rem 0rem;
}

.zippy {
  grid-column: 1 / 2;
  grid-row: 2 / 3;
  max-height: 100%;
  height: 100%;
  padding-right: 0.25rem;
}

.vega-chart {
  height: 100%;
  width: 100%;
  z-index: 0;
}

h1 {
  margin: 0px auto;
  font-size: 1.5rem;
}

h3 {
  margin: 0px auto;
}

h4,
p {
  margin: 1rem 1rem;
}

.center {
  text-align: center;
}
</style>
