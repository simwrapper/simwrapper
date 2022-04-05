<template lang="pug">
.my-component(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  img.thumb(v-if="thumbnail" src="./assets/table.png" :width="128")


</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'

import { ColorScheme, FileSystemConfig, VisualizationPlugin, Status } from '@/Globals'

import HTTPFileSystem from '@/js/HTTPFileSystem'

@Component({
  components: {},
})
class MyComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private subfolder!: string
  @Prop({ required: false }) private yamlConfig!: string
  @Prop({ required: false }) private thumbnail!: boolean

  private globalState = globalStore.state

  private fileApi!: HTTPFileSystem
  private fileSystem!: FileSystemConfig

  private vizDetails = {
    title: '',
    description: '',
    thumbnail: '',
  }

  private async mounted() {
    this.buildFileApi()
    await this.getVizDetails()

    if (this.thumbnail) return

    // this.statusMessage = `${this.$i18n.t('loading')}`

    this.buildThumbnail()
  }

  private beforeDestroy() {}

  public buildFileApi() {
    const filesystem = this.getFileSystem(this.root)
    this.fileApi = new HTTPFileSystem(filesystem)
    this.fileSystem = filesystem
  }

  private thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"
  private get urlThumbnail() {
    return this.thumbnailUrl
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

  private async getVizDetails() {
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
  }

  private async buildThumbnail() {
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
  }
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'calculation-table',
  prettyName: 'Table',
  description: 'Calculation table',
  filePatterns: ['(topsheet|table)*.y?(a)ml'],
  component: MyComponent,
} as VisualizationPlugin)

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.my-component {
}

@media only screen and (max-width: 640px) {
}
</style>
