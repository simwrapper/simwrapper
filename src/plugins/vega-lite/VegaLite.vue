<template lang="pug">
.vega-container(v-if="myState.yamlConfig")

  .labels(v-if="!config && !thumbnail")
    h3.center {{ title }}
    h5.center {{ description }}

  .vega-chart(
    :id="cleanConfigId"

  )
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
  @Prop({ required: true })
  private root!: string

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private config!: string

  @Prop({ required: true })
  private thumbnail!: boolean

  private globalState = globalStore.state

  private myState = {
    fileApi: undefined as HTTPFileSystem | undefined,
    fileSystem: undefined as FileSystemConfig | undefined,
    subfolder: '',
    yamlConfig: '',
    thumbnail: false,
  }

  private vizDetails: any = { title: '', description: '' }

  private loadingText: string = 'Flow Diagram'
  private totalTrips = 0

  private title = ''
  private description = ''

  private cleanConfigId = 'vega-' + Math.floor(Math.random() * 1e12)

  public async mounted() {
    this.buildFileApi()

    this.myState.thumbnail = this.thumbnail
    this.myState.yamlConfig = this.config || this.yamlConfig // use whichever one was sent to us
    this.myState.subfolder = this.subfolder

    console.log(this.myState.yamlConfig)
    // if (!this.yamlConfig) this.buildRouteFromUrl()

    await this.getVizDetails()
    this.changeDimensions()
    window.addEventListener('resize', this.changeDimensions)
  }

  public beforeDestroy() {
    window.removeEventListener('resize', this.changeDimensions)
  }

  @Watch('globalState.isDarkMode')
  private swapTheme() {
    this.embedChart()
  }

  @Watch('globalState.resizeEvents')
  private changeDimensions() {
    // if (!this.vizDetails) return

    // figure out dimensions, depending on if we are in a dashboard or not
    let box = document.querySelector(`#${this.cleanConfigId}`) as Element
    let width = box.clientWidth
    let height = box.clientHeight
    console.log(width, height)

    if (this.thumbnail) height = 125
    this.vizDetails.height = height

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
    console.log('HEEERE')
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
      console.log(this.myState.yamlConfig)
      const filename =
        this.myState.yamlConfig.indexOf('/') > -1
          ? this.myState.yamlConfig
          : this.myState.subfolder + '/' + this.myState.yamlConfig

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

    // if there is a URL in the schema, try to load/download it locally first
    if (json.data.url) {
      try {
        let data = ''
        const localUrl = this.myState.subfolder + '/' + json.data.url
        if (json.data.url.endsWith('.json')) {
          data = await this.myState.fileApi.getFileJson(localUrl)
          if (data) json.data = { values: data }
        } else if (json.data.url.endsWith('.csv')) {
          data = await this.myState.fileApi.getFileText(localUrl)
          if (data) json.data = { values: data, format: { type: 'csv' } }
        }
      } catch (e) {
        // didn't work -- let Vega try on its own.
        console.warn(e)
      }
    }
    return json
  }

  private embedChart() {
    this.loadingText = 'Building chart...'

    const exportActions = { export: true, source: false, compiled: false, editor: false }
    const embedOptions = {
      actions: this.thumbnail ? false : exportActions,
      hover: true,
      scaleFactor: 2.0, // make exported PNGs bigger
      // padding: { top: 5, left: 5, right: 5, bottom: 5 },
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
              axis: { titleColor: 'white', labelColor: 'white' },
              legend: { titleColor: 'white', labelColor: 'white' },
            },
          }
        : {
            // light mode
            background: '#00000000',
            config: {
              axis: { titleColor: '#222', labelColor: '#222' },
              legend: { titleColor: '#222', labelColor: '#222' },
            },
          }
    )

    vegaEmbed(`#${this.cleanConfigId}`, this.vizDetails, embedOptions)
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
  display: flex;
  flex-direction: column;
  margin: 0rem 0rem 0rem 0rem;
}

.vega-chart {
  flex: 1;
  margin: 0rem 1rem 1rem 1rem;
  overflow: hidden;
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

.labels {
  margin: 1rem 0rem;
}

.center-chart {
  margin: 0 auto;
  flex: 1;
}

.center {
  text-align: center;
}
</style>
