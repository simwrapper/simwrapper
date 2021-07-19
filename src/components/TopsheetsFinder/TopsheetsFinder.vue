<i18n>
en:
  title: 'Key Performance Indicators'
de:
  title: 'Key Performance Indicators'
</i18n>

<template lang="pug">
.topsheets-finder.curate-content
  top-sheet(v-for="sheet of topsheets" :key="sheet"
    :fileSystemConfig="fileSystemConfig"
    :subfolder="subfolder"
    :files="files"
    :yaml="sheet"
  )

</template>

<script lang="ts">
import micromatch from 'micromatch'

import { FileSystemConfig } from '@/Globals'
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import TopSheet from '@/components/TopSheet/TopSheet.vue'

@Component({ components: { TopSheet } })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private fileSystemConfig!: FileSystemConfig

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: true })
  private files!: string[]

  private topsheets: any[] = []

  private fileSystem!: HTTPFileSystem

  @Watch('subfolder') folderUpdated() {
    this.topsheets = []
  }

  @Watch('files') async filesUpdated() {
    if (this.files.length) {
      this.fileSystem = new HTTPFileSystem(this.fileSystemConfig)
      this.topsheets = await this.findTopsheetsForThisFolder()
      console.log('TOPSHEETS', this.topsheets)
    }
  }

  private async mounted() {}

  private async findTopsheetsForThisFolder() {
    const folders = this.findAllTopsheetFolders()
    const topsheets = {} as any

    // get list of all topsheet.yaml files, overwriting/overriding as we drill down
    for (const folder of folders) {
      const { files } = await this.fileSystem.getDirectory(folder)
      for (const file of files) topsheets[file] = `${folder}/${file}`
    }

    // use local files in this folder instead of any we just found
    const matches = micromatch(this.files, ['topsheet*.y?(a)ml'])
    for (const match of matches) topsheets[match] = `${match}`

    return Object.values(topsheets)
  }

  private findAllTopsheetFolders() {
    // Check for any .topsheets folders, here or above
    // BUT override topsheets with topsheets in this folder

    const allFolders = localStorage.getItem('RunFinder.foundFolders')
    if (!allFolders) return []

    const topsheetEntries = JSON.parse(allFolders)[this.fileSystemConfig.name].filter((f: any) => {
      return f.path.endsWith('.topsheets')
    })
    const topsheetFolders = topsheetEntries.map((f: any) => f.path)

    // We only want the ones that are at this point in the tree or above us.
    const relevantTopsheetFolders = topsheetFolders.filter((f: string) => {
      // ----> i am in: /data/berlin
      // /data/berlin/.topsheets  -> true
      // /data/.topsheets -> true
      // /data/emissions/.topsheets -> false
      // ----> so remove "/.topsheets" and see if our folder begins with that
      const candidate = f.substring(0, f.length - 11)
      return this.subfolder.startsWith(candidate)
    })

    return relevantTopsheetFolders
  }
}
</script>

<style scoped lang="scss">
@import '~vue-slider-component/theme/default.css';
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
