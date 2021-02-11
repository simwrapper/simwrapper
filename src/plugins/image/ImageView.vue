<template lang="pug">
.image-container(v-if="myState.yamlConfig" :class="{'zthumbnail' : thumbnail }")
  img.medium-zoom(
    :src="myState.imageData"
    :class="{'invert-colors' : isDarkMode }")
</template>

<script lang="ts">
'use strict'

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
// import mediumZoom from 'medium-zoom'
import readBlob from 'read-blob'

import globalStore from '@/store.ts'
import { ColorScheme, FileSystem, VisualizationPlugin } from '../../Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'

@Component({ components: {} })
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

  private myState = {
    fileApi: this.fileApi,
    subfolder: this.subfolder,
    yamlConfig: this.yamlConfig,
    thumbnail: this.thumbnail,
    imageData: '',
  }

  private matsimPngTitles: { [key: string]: string } = {
    'modestats.png': 'Mode statistics',
    'ph_modestats.png': 'Passenger hours traveled per mode',
    'pkm_modestats.png': 'Passenger km traveled per mode',
    'scorestats.png': 'Score statistics',
    'stopwatch.png': 'Stopwatch: computation time',
    'traveldistancestatslegs.png': 'Leg travel distance',
    'traveldistancestatstrips.png': 'Trip travel distance',
  }

  private get isDarkMode() {
    return this.globalState.colorScheme == ColorScheme.DarkMode
  }

  public mounted() {
    if (!this.yamlConfig) {
      this.buildRouteFromUrl()
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
  }

  private async getVizDetails() {
    try {
      const blob = await this.myState.fileApi.getFileBlob(
        this.myState.subfolder + '/' + this.myState.yamlConfig
      )

      if (!blob) {
        console.log('no blob! :-(')
        return
      }

      const dataUrl = await readBlob.dataurl(blob)
      this.myState.imageData = dataUrl

      const newTitle = this.matsimPngTitles[this.yamlConfig]
        ? this.matsimPngTitles[this.yamlConfig]
        : this.yamlConfig

      this.$emit('title', newTitle)
    } catch (e) {
      console.error({ e })
      return null
    }
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'image-view',
  prettyName: 'Image',
  description: '',
  filePatterns: ['!(*thumbnail*).(png|jpg)'], // skip thumbnails!
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.image-container.zthumbnail {
  max-height: $thumbnailHeight;
  overflow: hidden;
}

.medium-zoom {
  padding: 0.25rem 0.25rem;
}

// .invert-colors {
//   filter: invert(100%);
// }
</style>
