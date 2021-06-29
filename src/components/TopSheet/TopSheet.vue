<i18n>
en:
  title: 'Key Performance Indicators'
de:
  title: 'Key Performance Indicators'
</i18n>

<template lang="pug">
.topsheet.curate-content(v-if="table.length")
  h3.curate-heading  {{ $t('title') }}

  .output-table
    .row(v-for="row,i in entries" :key="'entry'+i")
      .cell.top-label(:style="row.style") {{ row.title }}
      input.input.is-small.cell.top-value(:style="row.style" v-model="row.value" @change="boxChanged")

  .output-table(style="margin-top: 1rem")
    .row(v-for="row,i in table" :key="'row'+i")
      .cell.top-label(:style="row.style") {{ row.title }}
      .cell.top-value(:style="row.style") {{ formattedValue(row.value) }}

</template>

<script lang="ts">
import { FileSystemConfig } from '@/Globals'
import { Worker, spawn, Thread } from 'threads'
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

// import globalStore from '@/store'

export type TableRow = {
  title: string
  value: any
  style?: any
}

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private fileSystemConfig!: FileSystemConfig

  @Prop({ required: true })
  private subfolder!: string

  @Prop({ required: true })
  private files!: string[]

  private solverThread!: any

  private table: TableRow[] = []
  private entries: { key: string; title: string; value: any }[] = []

  @Watch('files') filesUpdated() {
    this.table = []
    this.runTopSheet()
  }

  private formattedValue(value: any) {
    if (!isNaN(value)) return value.toLocaleString([this.$store.state.locale, 'en'])
    return value
  }

  private mounted() {
    if (this.files.length) this.runTopSheet()
  }

  private beforeDestroy() {
    try {
      if (this.solverThread) {
        Thread.terminate(this.solverThread)
        this.solverThread = null
      }
    } catch (e) {
      console.warn(e)
    }
  }

  private async boxChanged() {
    console.log('changed!')
    if (this.solverThread) {
      const output = await this.solverThread.updateCalculations(this.entries)
      this.table = output
    }
  }

  private async runTopSheet() {
    if (!this.files.length) return

    if (!this.solverThread) {
      console.log('spawing topsheet thread')
      this.solverThread = await spawn(new Worker('./TopSheetWorker.thread'))
    }

    const parent = this
    try {
      this.table = await this.solverThread.runTopSheet({
        fileSystemConfig: this.fileSystemConfig,
        subfolder: this.subfolder,
        files: this.files,
      })

      const boxes = await this.solverThread.getTextEntryFields()
      console.log({ boxes })
      this.entries = boxes
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.table = []
      // this.table = [{ title: message, value: '', style: { backgroundColor: 'yellow' } }]
    }
  }

  private dataIsLoaded(results: TableRow[]) {
    console.log({ results })
    this.table = results
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
