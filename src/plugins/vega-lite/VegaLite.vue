<template lang="pug">
.vega-container(v-if="myState.yamlConfig")

  .labels(v-if="!config && !thumbnail")
    h3.center {{ title }}
    h5.center {{ description }}

  .zippy(:id="zippyId")
    .vega-chart(:id="cleanConfigId")

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import nprogress from 'nprogress'
import vegaEmbed from 'vega-embed'

import globalStore from '@/store'
import { FileSystemConfig, VisualizationPlugin } from '../../Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

@Component({ components: {} })
class VegaComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: false }) private subfolder!: string
  @Prop({ required: false }) private yamlConfig!: string
  @Prop({ required: false }) private config!: string
  @Prop({ required: true }) private thumbnail!: boolean
  @Prop({ required: false }) private cardId!: string

  private globalState = globalStore.state

  private myState = {
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: '',
    yamlConfig: '',
    thumbnail: false,
  }

  private vizDetails: any = { title: '', description: '' }

  private loadingText: string = 'Loading'
  private totalTrips = 0

  private title = ''
  private description = ''

  private cleanConfigId = 'vega-' + Math.floor(Math.random() * 1e12)
  private zippyId = 'zippy-' + Math.floor(Math.random() * 1e12)

  private hasHardCodedHeight = false

  public async mounted() {
    this.buildFileApi()

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.config || this.yamlConfig // use whichever one was sent to us
    this.myState.subfolder = this.subfolder

    if (this.cardId) {
      this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    }

    await this.getVizDetails()
    this.embedChart()
  }

  @Watch('globalState.isDarkMode')
  private swapTheme() {
    this.embedChart()
  }

  @Watch('globalState.resizeEvents')
  private changeDimensions() {
    // figure out dimensions, depending on if we are in a dashboard or not
    let box = document.querySelector(`#${this.zippyId}`) as Element
    if (!box) return

    let height = this.thumbnail ? 125 : box.clientHeight
    if (!this.hasHardCodedHeight) this.vizDetails.height = height

    this.embedChart()
  }

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem
  }

  @Watch('globalState.authAttempts') authenticationChanged() {
    console.log('AUTH CHANGED - Reload')
    this.getVizDetails()
    if (this.vizDetails) this.embedChart()
  }

  @Watch('yamlConfig') changedYaml() {
    this.myState.yamlConfig = this.yamlConfig
    this.getVizDetails()
    if (this.vizDetails) this.embedChart()
  }

  @Watch('subfolder') changedSubfolder() {
    this.myState.subfolder = this.subfolder
    this.getVizDetails()
    if (this.vizDetails) this.embedChart()
  }

  private get hasFacets() {
    if (!this.vizDetails) return false
    if (!this.vizDetails.encoding) return false

    if (
      this.vizDetails.encoding.facet ||
      this.vizDetails.encoding.row ||
      this.vizDetails.encoding.column
    )
      return true

    return false
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  // this happens if viz is the full page, not a thumbnail on a project page
  private buildRouteFromUrl() {
    const params = this.$route.params
    if (!params.project || !params.pathMatch) {
      console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
      return
    }

    // project filesystem
    const filesystem = this.getFileSystem(params.project)
    this.myState.fileApi = new HTTPFileSystem(filesystem)
    this.myState.fileSystem = filesystem

    // subfolder and config file
    const sep = 1 + params.pathMatch.lastIndexOf('/')
    const subfolder = params.pathMatch.substring(0, sep)
    const config = params.pathMatch.substring(sep)

    this.myState.subfolder = subfolder
    this.myState.yamlConfig = config
  }

  private async getVizDetails() {
    this.vizDetails = await this.loadFiles()
    this.loadingText = ''
    nprogress.done()
  }

  private async loadFiles() {
    if (!this.myState.fileApi) return

    let json: any = { data: {} }

    try {
      this.loadingText = 'Loading chart...'

      // might be a project config:
      const filename = this.myState.subfolder + '/' + this.myState.yamlConfig

      json = await this.myState.fileApi.getFileJson(filename)

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

      // maybe it failed because password?
      if (this.myState.fileSystem && this.myState.fileSystem.needPassword && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.fileSystem.slug)
      }
      return
    }

    // If it's not an HTTP URL, then we should fetch it ourselves and then
    // hand it to Vega which will parse it .
    if (json.data.url && !json.data.url.startsWith('http')) {
      const path = `/${this.myState.subfolder}/${json.data.url}`
      const rawData = await this.myState.fileApi.getFileText(path)
      json.data = {
        values: rawData,
        format: { type: path.endsWith('json') ? 'json' : 'csv' },
      }
    }

    // just pass the config to Vega
    return json
  }

  private async embedChart() {
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

      this.$store.commit('error', 'Vega: ' + message)
    }
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'vega-lite',
  prettyName: 'Chart',
  description: 'Interactive chart visualization',
  filePatterns: ['**/*.vega.json'],
  component: VegaComponent,
} as VisualizationPlugin)

export default VegaComponent
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
  padding-right: 0.75rem;
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
