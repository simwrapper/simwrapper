<template lang="pug">
.my-component(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false")

  img.thumb(v-if="thumbnail" src="./assets/table.png" :width="128")


  .topsheet(v-if="!thumbnail && isLoaded")
      p.header {{ subfolder }}

      h2 {{ vizDetails.title }}
      p {{ vizDetails.description}}

      hr

      component.dash-card(
        is="TopSheet"
        :fileSystemConfig="fileSystem"
        :subfolder="subfolder"
        :config="vizDetails"
        :yaml="yamlConfig"
        :files="files"
        :cardTitle="vizDetails.title"
        :cardId="'table1'"
        :allConfigFiles="allConfigFiles"
      )

      //- @isLoaded="handleCardIsLoaded(card)"
      //- @dimension-resizer="setDimensionResizer"
      //- @titles="setCardTitles(card, $event)"

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'

import { ColorScheme, FileSystemConfig, VisualizationPlugin, Status, YamlConfigs } from '@/Globals'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import TopSheet from '@/components/TopSheet/TopSheet.vue'

@Component({
  components: { TopSheet },
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

  private isLoaded = false
  private allConfigFiles: YamlConfigs = { dashboards: {}, topsheets: {}, vizes: {}, configs: {} }
  private files: string[] = []

  private async mounted() {
    this.buildFileApi()
    await this.getVizDetails()
    this.allConfigFiles = await this.fileApi.findAllYamlConfigs(this.subfolder)
    const { files } = await this.fileApi.getDirectory(this.subfolder)
    this.files = files

    this.isLoaded = true

    if (this.thumbnail) return
  }

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
}

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'calc-table',
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
  margin: 0 0;
  padding: 0 2rem;
}

.header {
  margin-top: 0.5rem;
  margin-bottom: 2rem;
  color: var(--text);
}

.topsheet {
  max-width: 55rem;
  margin: 0rem auto;
}

@media only screen and (max-width: 640px) {
}
</style>
