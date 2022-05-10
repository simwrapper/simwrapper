<template lang="pug">
.topsheet.curate-content
  h3.curate-heading(v-if="title")  {{ title }}

  .output-table(v-if="entries.length")
    .row(v-for="row,i in entries" :key="'entry'+i")
      .cell.top-label(:style="row.style") {{ row.title }}
      input.input.is-small.cell.top-value(:style="row.style" v-model="row.value" @change="boxChanged")

  .output-table(v-if="table.length" style="margin-top: 1rem")
    .row(v-for="row,i in table" :key="'row'+i")
      .cell.top-label(:style="row.style") {{ row.title }}
      .cell.top-value(:style="row.style") {{ formattedValue(row.value) }}

</template>

<script lang="ts">
import { FileSystemConfig, YamlConfigs } from '@/Globals'
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import TopSheetWorker from './TopSheetWorker.worker.ts?worker'
import globalStore from '@/store'

export type TableRow = {
  title: string
  value: any
  style?: any
}

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) private subfolder!: string
  @Prop({ required: true }) private files!: string[]
  @Prop({ required: true }) private yaml!: string
  @Prop({ required: true }) private allConfigFiles!: YamlConfigs
  @Prop({ required: false }) private cardId?: string

  private solverThread!: any

  private globalState = globalStore.state

  private table: TableRow[] = []
  private entries: { key: string; title: string; value: any }[] = []
  private title = ''

  private formattedValue(value: any) {
    if (!isNaN(value)) return value.toLocaleString([this.$store.state.locale, 'en'])
    if (value === undefined) return '-?-'
    return value
  }

  private mounted() {
    console.log('TOPSHEET YAML IS', this.yaml)
    if (this.files.length) this.runTopSheet()
  }

  private beforeDestroy() {
    try {
      if (this.solverThread) {
        this.solverThread.terminate()
        this.solverThread = null
      }
    } catch (e) {
      console.warn(e)
    }
  }

  @Watch('globalState.locale')
  private themeChanged() {
    if (this.solverThread) {
      this.solverThread.postMessage({
        command: 'updateCalculations',
        entries: this.entries,
        locale: this.globalState.locale,
      })
    }
  }

  private async boxChanged() {
    console.log('changed!')
    if (this.solverThread) {
      this.solverThread.postMessage({
        command: 'updateCalculations',
        entries: this.entries,
        locale: this.globalState.locale,
      })
    }
  }

  private async runTopSheet() {
    if (!this.files.length) return

    try {
      if (!this.solverThread) {
        console.log('spawning topsheet thread')
        this.solverThread = new TopSheetWorker()
        this.solverThread.onmessage = (message: MessageEvent) => {
          this.processWorkerMessage(message)
        }
      }

      this.solverThread.postMessage({
        command: 'runTopSheet',
        fileSystemConfig: this.fileSystemConfig,
        subfolder: this.subfolder,
        files: this.files,
        yaml: this.yaml,
        locale: this.$store.state.locale,
        allConfigFiles: this.allConfigFiles,
      })
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.table = []
      // this.table = [{ title: message, value: '', style: { backgroundColor: 'yellow' } }]
    }
  }

  private processWorkerMessage(message: MessageEvent) {
    const data = message.data
    switch (data.response) {
      case 'title':
        if (this.cardId) this.$emit('titles', data.title)
        else this.title = data.title
        break
      case 'entries':
        this.entries = data.entryFields
        break
      case 'results':
        this.table = data.results
        this.$emit('isLoaded')
        break
      case 'error':
        this.$store.commit('error', data.message)
        this.$emit('isLoaded')
        break
      default:
        // shouldn't be here
        this.$emit('isLoaded')
        console.error(data)
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

h3.curate-heading {
  font-size: 1.6rem;
  font-weight: bold;
  color: var(--textFancy);
  padding-top: 0.5rem;
  margin-top: 0rem;
  margin-bottom: 0.5rem;
  border-bottom: 1px dotted var(--textFancy);
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
