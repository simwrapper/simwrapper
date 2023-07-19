<template lang="pug">
.my-component(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  img.thumb(v-if="thumbnail" src="./assets/table.png" :width="128")


</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'

import { ColorScheme, FileSystemConfig, VisualizationPlugin, Status } from '@/Globals'

import HTTPFileSystem from '@/js/HTTPFileSystem'

const MyComponent = defineComponent({
  name: 'MyComponent',
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    thumbnail: Boolean,
  },
  data: () => {
    return {
      globalState: globalStore.state,
      fileSystem: null as FileSystemConfig | null,
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",
      vizDetails: {
        title: '',
        description: '',
        thumbnail: '',
      },
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      this.fileSystem = this.getFileSystem(this.root)
      return new HTTPFileSystem(this.fileSystem)
    },
    urlThumbnail(): any {
      return this.thumbnailUrl
    },
  },
  async mounted() {
    await this.getVizDetails()

    if (this.thumbnail) return

    // this.statusMessage = `${this.$i18n.t('loading')}`

    this.buildThumbnail()
  },
  methods: {
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

    async getVizDetails() {
      if (!this.fileApi) return

      console.log(this.yamlConfig)
      // first get config
      try {
        const text = await this.fileApi.getFileText(this.subfolder + '/' + this.yamlConfig)
        this.vizDetails = YAML.parse(text)
      } catch (e) {
        console.error('failed')
      }
      const t = this.vizDetails.title ? this.vizDetails.title : 'Table'
      this.$emit('title', t)
    },

    async buildThumbnail() {
      if (!this.fileApi) return
      if (this.thumbnail && this.vizDetails.thumbnail) {
        try {
          const blob = await this.fileApi.getFileBlob(
            this.subfolder + '/' + this.vizDetails.thumbnail
          )
          const buffer = await blob.arrayBuffer()
          const base64 = util.arrayBufferToBase64(buffer)
          if (base64)
            this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
        } catch (e) {
          console.error(e)
        }
      }
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

// .my-component {
// }

@media only screen and (max-width: 640px) {
}
</style>
