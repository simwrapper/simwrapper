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
import { defineComponent } from 'vue'
import YAML from 'yaml'

import util from '@/js/util'
import globalStore from '@/store'

import { ColorScheme, FileSystemConfig, VisualizationPlugin, Status, YamlConfigs } from '@/Globals'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import TopSheet from '@/components/TopSheet/TopSheet.vue'

const thumbnailUrl = "url('assets/thumbnail.jpg') no-repeat;"

const Component = defineComponent({
  name: 'CalculationTable',
  components: { TopSheet },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: String,
    config: Object,
    thumbnail: Boolean,
  },
  data: () => {
    return {
      globalState: globalStore.state,
      allConfigFiles: { dashboards: {}, topsheets: {}, vizes: {}, configs: {} } as YamlConfigs,
      files: [] as string[],
      isLoaded: false,
      vizDetails: {
        title: '',
        description: '',
        thumbnail: '',
      },
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },
    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    urlThumbnail(): any {
      return thumbnailUrl
    },
  },
  methods: {
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
  },
  async mounted() {
    await this.getVizDetails()
    this.allConfigFiles = await this.fileApi.findAllYamlConfigs(this.subfolder)
    const { files } = await this.fileApi.getDirectory(this.subfolder)
    this.files = files

    this.isLoaded = true

    if (this.thumbnail) return
  },
})

export default Component
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.my-component {
  margin: 0 0;
  padding: 0 2rem;
  background-color: var(--bgMapPanel);
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
