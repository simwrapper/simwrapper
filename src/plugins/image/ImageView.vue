<template lang="pug">
.image-container(v-if="myState.yamlConfig" :class="{'zthumbnail' : thumbnail }")
  img.medium-zoom(
    :src="myState.imageData"
    :class="{'invert-colors' : isDarkMode }")
</template>

<script lang="ts">
'use strict'

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import readBlob from 'read-blob'

import globalStore from '@/store'
import { ColorScheme, FileSystem, FileSystemConfig, VisualizationPlugin } from '@/Globals'

const MyComponent = defineComponent({
  name: 'ImageViewPlugin',
  props: {
    fileApi: { type: Object as PropType<FileSystem>, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    thumbnail: Boolean,
  },
  data: () => {
    return {
      globalState: globalStore.state,
      myState: {} as any,
      matsimPngTitles: {
        'modestats.png': 'Mode statistics',
        'ph_modestats.png': 'Passenger hours traveled per mode',
        'pkm_modestats.png': 'Passenger km traveled per mode',
        'scorestats.png': 'Score statistics',
        'stopwatch.png': 'Stopwatch: computation time',
        'traveldistancestatslegs.png': 'Leg travel distance',
        'traveldistancestatstrips.png': 'Trip travel distance',
      } as { [id: string]: string },
    }
  },
  computed: {
    isDarkMode(): boolean {
      return this.globalState.isDarkMode
    },
  },
  methods: {
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

        const config = this.yamlConfig as any
        const newTitle = this.matsimPngTitles[config]
          ? this.matsimPngTitles[config]
          : this.yamlConfig

        this.$emit('title', newTitle)
      } catch (e) {
        console.error({ e })
        return null
      }
    },
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
  mounted() {
    this.myState = {
      fileApi: this.fileApi,
      subfolder: this.subfolder,
      yamlConfig: this.yamlConfig,
      thumbnail: this.thumbnail,
      imageData: '',
    }

    if (!this.yamlConfig) {
      this.buildRouteFromUrl()
    }

    this.getVizDetails()
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.image-container.zthumbnail {
  max-height: $thumbnailHeight;
  overflow: hidden;
}
</style>
