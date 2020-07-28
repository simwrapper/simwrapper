<template lang="pug">
#container
  h3(v-if="!thumbnail") {{ title }}

  video-player.video-player-box.vjs-default-skin.vjs-big-play-centered(v-if="movieSource"
    ref="videoPlayer"
    :options="playerOptions"
  )

</template>

<script lang="ts">
'use strict'

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import readBlob from 'read-blob'
import { videoPlayer } from 'vue-video-player'

import globalStore from '@/store.ts'
import { FileSystem, VisualizationPlugin } from '../../Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'

@Component({
  components: {
    'video-player': videoPlayer,
  },
})
class MyComponent extends Vue {
  @Prop({ required: false })
  private fileApi!: FileSystem

  @Prop({ required: false })
  private subfolder!: string

  @Prop({ required: false })
  private yamlConfig!: string

  @Prop({ required: false })
  private thumbnail!: boolean

  private globalState = globalStore.state

  private movieSource = ''
  private title = ''

  // videojs options
  private playerOptions = {
    muted: false,
    language: 'en',
    playbackRates: [0.75, 1.0, 1.5, 2.0, 5.0],
    preload: 'auto',
    responsive: true,
    fluid: true,
    playsinline: true,
    sources: [] as any[],
  }

  get player() {
    const z: any = this.$refs.videoPlayer
    return z.player
  }

  private myState = {
    fileApi: this.fileApi,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
    imageData: '',
  }

  public mounted() {
    if (!this.yamlConfig) {
      this.buildRouteFromUrl()
    } else {
      const filesystem = this.getFileSystem(this.$route.name as string)
      this.buildMovieSource(filesystem.svn, this.subfolder + '/', this.yamlConfig)
    }

    if (!this.thumbnail) this.generateBreadcrumbs()

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

  private buildMovieSource(url: string, subfolder: string, config: string) {
    this.movieSource = `${url}/${subfolder}${config}`

    this.playerOptions.sources.push({
      type: 'video/mp4',
      src: this.movieSource,
    })
  }

  private getFileSystem(name: string) {
    const svnProject: any[] = globalStore.state.svnProjects.filter((a: any) => a.url === name)
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

    // subfolder and config file
    const sep = 1 + params.pathMatch.lastIndexOf('/')
    const subfolder = params.pathMatch.substring(0, sep)
    const config = params.pathMatch.substring(sep)

    this.myState.subfolder = subfolder
    this.myState.yamlConfig = config

    this.buildMovieSource(filesystem.svn, subfolder, config)
  }

  private async generateBreadcrumbs() {
    const filesystem = this.getFileSystem(this.$route.params.project)
    if (!filesystem) return []

    const crumbs = [
      {
        label: filesystem.name,
        url: '/' + filesystem.url,
      },
    ]

    const subfolders = this.myState.subfolder.split('/')
    let buildFolder = '/'
    for (const folder of subfolders) {
      if (!folder) continue

      buildFolder += folder + '/'
      crumbs.push({
        label: folder,
        url: '/' + filesystem.url + buildFolder,
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
  filePatterns: ['*.(mp4|mov|avi)'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '~video.js/dist/video-js.min.css';

#container {
  background-color: #334;
}

h3 {
  color: #ccc;
  padding: 0.5rem 0;
  text-align: center;
}

.medium-zoom {
  padding: 0.25rem 0.25rem;
}
</style>
