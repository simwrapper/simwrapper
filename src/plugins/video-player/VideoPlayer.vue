<template lang="pug">
#container(:style="{padding: thumbnail ? '0 0' : '0 20px 20px 20px'}")
  h3(v-if="!thumbnail") {{ title }}

  .vid-container
    video-player.vjs-default-skin.vjs-big-play-centered(
      v-if="movieSource"
      ref="videoPlayer"
      :options="playerOptions"
    )


</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { videoPlayer } from 'vue-video-player'

import '~/video.js/dist/video-js.min.css'

import globalStore from '@/store'
import { FileSystem, FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

@Component({ components: { videoPlayer } })
class MyComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private subfolder!: string
  @Prop({ required: true }) private yamlConfig!: string
  @Prop({ required: true }) private thumbnail!: boolean

  private movieSource = ''
  private title = ''

  private fileApi?: FileSystemConfig

  // videojs options
  private playerOptions = {
    muted: false,
    language: 'en',
    playbackRates: [0.5, 1.0, 1.5, 2.0, 5.0],
    preload: 'metadata',
    responsive: true,
    fluid: true,
    playsInline: true,
    controls: true,
    sources: [] as any[],
  }

  private myState = {
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
    imageData: '',
  }

  public beforeDestroy() {
    window.removeEventListener('resize', this.onResize)
    if (!this.thumbnail) globalStore.commit('setFullScreen', false)
  }

  public mounted() {
    if (!this.thumbnail) globalStore.commit('setFullScreen', true)

    this.fileApi = this.getFileSystem(this.root)

    if (!this.yamlConfig) {
      this.buildRouteFromUrl()
    } else {
      this.myState.subfolder = this.subfolder
      this.myState.yamlConfig = this.yamlConfig
      this.buildMovieSource()
    }

    this.getVizDetails()

    // if (!this.thumbnail) this.generateBreadcrumbs()
    if (!this.thumbnail) window.addEventListener('resize', this.onResize)
  }

  @Watch('yamlConfig') changedYaml() {
    this.myState.yamlConfig = this.yamlConfig
    this.getVizDetails()
  }

  @Watch('subfolder') changedSubfolder() {
    this.myState.subfolder = this.subfolder
    this.getVizDetails()
  }

  private buildMovieSource() {
    this.movieSource = `${this.fileApi?.baseURL}/${this.myState.subfolder}/${this.myState.yamlConfig}`

    this.playerOptions.sources.push({
      type: 'video/mp4',
      src: this.movieSource,
    })
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  // this happens if viz is the full page, not a thumbnail on a project page
  private async buildRouteFromUrl() {
    const params = this.$route.params
    if (!params.project || !params.pathMatch) {
      console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
      return
    }

    // project filesystem
    this.fileApi = this.getFileSystem(params.project)

    // subfolder and config file
    const sep = 1 + params.pathMatch.lastIndexOf('/')
    const subfolder = params.pathMatch.substring(0, sep)
    const config = params.pathMatch.substring(sep)

    this.myState.subfolder = subfolder
    this.myState.yamlConfig = config

    this.buildMovieSource()
  }

  private aspect = 0

  public onResize() {
    const parent = document.getElementsByClassName('vid-container')[0] as HTMLElement
    const video = document.getElementsByClassName('video-js')[0] as HTMLElement

    if (!this.aspect) this.aspect = video.clientHeight / video.clientWidth

    var parentWidth = parent.clientWidth
    var windowHeight = window.innerHeight
    var windowWidth = window.innerWidth

    parent.style.width = '100%'
    parent.style.margin = 'auto auto'

    const maxHeight = windowHeight - 120
    const newWidth = Math.floor(maxHeight / this.aspect)
    video.style.width = `${newWidth}px`
    video.style.height = `${newWidth * this.aspect}px`
    parent.style.width = `${newWidth}px`
    parent.style.height = `${newWidth * this.aspect}px`

    const maxWidth = windowWidth - 60
    if (video.clientWidth > maxWidth) {
      const newWidth = maxWidth
      video.style.width = `${newWidth}px`
      video.style.height = `${newWidth * this.aspect}px`
      parent.style.width = `${newWidth}px`
      parent.style.height = `${newWidth * this.aspect}px`
    }
  }

  private async generateBreadcrumbs() {
    const filesystem = this.getFileSystem(this.$route.params.project)
    if (!filesystem) return []

    const crumbs = [
      {
        label: filesystem.name,
        url: '/' + filesystem.slug,
      },
    ]

    const subfolders = this.myState.subfolder.split('/')
    let buildFolder = '/'
    for (const folder of subfolders) {
      if (!folder) continue

      buildFolder += folder + '/'
      crumbs.push({
        label: folder,
        url: '/' + filesystem.slug + buildFolder,
      })
    }

    // save them!
    globalStore.commit('setBreadCrumbs', crumbs)

    return crumbs
  }

  private async getVizDetails() {
    this.title = this.myState.yamlConfig.replace(/_/g, ' ')
    this.title = this.title.substring(0, this.title.lastIndexOf('.'))

    if (this.title) {
      this.$emit('title', this.title)
    }
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'video-player',
  prettyName: 'Video',
  description: '',
  filePatterns: ['*.mp4'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
#container {
  display: flex;
  flex-direction: column;
  // grid-template-columns: 1fr;
  // grid-template-rows: auto auto;
  background-color: #223;
}

h3 {
  color: #ccc;
  padding: 0.5rem 0;
  text-align: center;
}

.video-js {
  background-color: #223;
}
</style>
