<template lang="pug">
.topsheets-finder.curate-content
  top-sheet(v-for="sheet of topsheets" :key="sheet"
    :fileSystemConfig="fileSystemConfig"
    :subfolder="subfolder"
    :files="files"
    :yaml="sheet"
    :allConfigFiles="allConfigFiles"
  )

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { title: 'Key Performance Indicators' },
  },
}

import { FileSystemConfig, YamlConfigs } from '@/Globals'
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import TopSheet from '@/components/TopSheet/TopSheet.vue'

@Component({ i18n, components: { TopSheet } })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private fileSystemConfig!: FileSystemConfig

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: true })
  private files!: string[]

  private fileSystem!: HTTPFileSystem
  private allConfigFiles!: YamlConfigs
  private topsheets: any[] = []

  @Watch('subfolder')
  @Watch('files')
  private async filesUpdated() {
    if (this.files.length) {
      this.fileSystem = new HTTPFileSystem(this.fileSystemConfig)
      this.topsheets = await this.findTopsheetsForThisFolder()
    }
  }

  private async mounted() {}

  private async findTopsheetsForThisFolder(): Promise<string[]> {
    this.allConfigFiles = await this.fileSystem.findAllYamlConfigs(this.subfolder)
    return Object.values(this.allConfigFiles.topsheets)
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

h3.curate-heading {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--textFancy);
  padding-top: 0.5rem;
  margin-top: 0rem;
  margin-bottom: 0.5rem;
}

.curate-content {
  padding: 1rem 0rem;
  margin: 0rem 0rem;
}

.output-table {
  width: 100%;
  display: table;
}

.row {
  display: table-row;
}

.cell {
  padding-right: 1rem;
  display: table-cell;
  font-size: 1.1rem;
}

// .top-label {
// }

.top-value {
  text-align: right;
  font-weight: bold;
}
</style>
