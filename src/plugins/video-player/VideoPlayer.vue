<template lang="pug">
.video-plugin-container(:class="{thumbnail}")
  h3(v-if="!thumbnail") {{ title }}

  .vid-container(v-if="!thumbnail")
    video(
      :controls="playerOptions.controls"
      :loop='playerOptions.loop'
      :allowfullscreen="true"
      :autoplay="playerOptions.autoplay"
      :muted="playerOptions.muted"
    )
      source(:src="movieSource" type="video/mp4")
      p Video tag not supported. Download the video&nbsp;
        a(:href="movieSource" target="_blank") here

</template>

<script lang="ts">
import { defineComponent } from 'vue'

// import { videoPlayer } from 'vue-video-player'

import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'

// import '~/video.js/dist/video-js.min.css'

const MyComponent = defineComponent({
  name: 'VideoPlayerPlugin',
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object,
    thumbnail: Boolean,
  },

  data: () => {
    return {
      movieSource: '',
      title: '',
      myState: {} as any,
      fileApi: null as FileSystemConfig | null,
      sources: [] as any[],
      playerOptions: {
        autoplay: false,
        controls: true,
        fluid: false,
        language: globalStore.state.locale,
        muted: false,
        playbackRates: [0.5, 1.0, 1.5, 2.0, 5.0],
        playsInline: true,
        preload: 'metadata',
        responsive: true,
      },
    }
  },

  beforeDestroy() {
    if (!this.thumbnail) globalStore.commit('setFullScreen', false)
  },

  mounted() {
    this.fileApi = this.getFileSystem(this.root)

    this.myState = {
      subfolder: this.subfolder,
      yamlConfig: this.yamlConfig,
      thumbnail: this.thumbnail,
      imageData: '',
    }

    this.getVizDetails()

    if (this.thumbnail) return

    this.playerOptions.fluid = !!this.thumbnail
    if (!this.thumbnail) globalStore.commit('setFullScreen', true)

    if (!this.yamlConfig) {
      this.buildRouteFromUrl()
    } else {
      this.myState.subfolder = this.subfolder
      this.myState.yamlConfig = this.yamlConfig
      this.buildMovieSource()
    }
  },
  watch: {
    yamlConfig() {
      this.myState.yamlConfig = this.yamlConfig
      this.getVizDetails()
    },

    subfolder() {
      this.myState.subfolder = this.subfolder
      this.getVizDetails()
    },
  },
  methods: {
    buildMovieSource() {
      this.movieSource = `${this.fileApi?.baseURL}/${this.myState.subfolder}/${this.myState.yamlConfig}`
    },

    getFileSystem(name: string) {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    // this happens if viz is the full page, not a thumbnail on a project page
    async buildRouteFromUrl() {
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
    },

    async generateBreadcrumbs() {
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
    },

    async getVizDetails() {
      this.title = this.myState.yamlConfig.replace(/_/g, ' ')
      this.title = this.title.substring(0, this.title.lastIndexOf('.'))

      if (this.title) {
        this.$emit('title', this.title)
      }
    },
  },
})

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
