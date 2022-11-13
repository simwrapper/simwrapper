<template lang="pug">
.video-plugin-container(:class="{thumbnail}")
  h3(v-if="!thumbnail") {{ title }}

  .vid-container
    video(:controls="controls" :loop='loop' :allowfullscreen='allowfullscreen' :autoplay="autoplay" :muted="muted")
      source(v-for="(src, type) in sources" :src="src" :type="type" :key="type")
      p(v-for="(src, type) in sources" :key="type") Video tag not supported. Download the video&nbsp;
        a(:href="src" target="_blank") here

    //- video-player.vjs-default-skin.vjs-big-play-centered(
    //-   ref="videoPlayer"
    //-   :options="playerOptions"
    //- )
    //- v-if="movieSource"

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
// import { videoPlayer } from 'vue-video-player'

import globalStore from '@/store'
import { FileSystem, FileSystemConfig, VisualizationPlugin } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

// import '~/video.js/dist/video-js.min.css'

@Component({ components: {} }) //  videoPlayer } })
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
    fluid: !!this.thumbnail,
    playsInline: true,
    controls: true,
    sources: [] as any[],
  }

  private myState: any = {}

  public beforeDestroy() {
    if (!this.thumbnail) globalStore.commit('setFullScreen', false)
  }

  public mounted() {
    this.myState = {
      subfolder: this.subfolder,
      yamlConfig: this.yamlConfig,
      thumbnail: this.thumbnail,
      imageData: '',
    }

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
  kebabName: 'vid-player',
  prettyName: 'Video',
  description: '',
  filePatterns: ['*.mp4'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style>
.video-js {
  position: absolute;
  width: 100%;
  height: auto;
  top: 0;
  right: 0;
  bottom: 0;
  left: 0;
  margin: auto 0;
  background-color: #223;
}
</style>

<style scoped lang="scss">
.video-plugin-container {
  display: flex;
  flex-direction: column;
  background-color: #223;
  padding: 0 20px 20px 20px;
  position: relative;
}

.thumbnail {
  height: 11rem;
  // z-index: -1;
  padding: 0 0;
}

.vid-container {
  width: 100%;
  height: 100%;
  position: relative;
}

.thumbnail .vid-container {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  overflow: hidden;
}

h3 {
  color: #ccc;
  padding: 0.5rem 0;
  text-align: center;
}
</style>
