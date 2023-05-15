<template lang="pug">
.mycomponent(:class="{'is-thumbnail': thumbnail}")

  //- h2 {{  vizDetails.title }}
  //- p(v-if="vizDetails.description") {{  vizDetails.description }}

  VuePlotly.myplot(
    :data="traces"
    :layout="layout"
    :options="options"
    :id="id"
  )

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { total: 'total', showChanges: 'Only show changes' },
    de: { total: 'Insgesamt', showChanges: 'Nur Änderungen zeigen' },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import yaml from 'yaml'
import Papaparse from 'papaparse'
import VuePlotly from '@/components/VuePlotly.vue'

import globalStore from '@/store'
import { FileSystemConfig, UI_FONT, BG_COLOR_DASHBOARD, DataTable, DataSet } from '@/Globals'
import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const MyComponent = defineComponent({
  name: 'PlotlyPlugin',
  components: { VuePlotly },
  i18n,
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    config: { type: Object as any },
    datamanager: { type: Object as PropType<DashboardDataManager> },
    resize: Object as any,
    thumbnail: Boolean,
    yamlConfig: String,
  },

  data() {
    return {
      globalState: globalStore.state,
      vizDetails: { title: '', description: '' } as any,
      loadingText: '',
      jsonChart: {} as any,
      totalTrips: 0,
      id: `plotly-id-${Math.floor(1e12 * Math.random())}` as any,
      traces: [] as any[],
      prevWidth: -1,
      prevHeight: -1,
      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),
      // Plotly Layout
      layout: {
        margin: { t: 8, b: 0, l: 0, r: 0, pad: 2 },
        font: {
          color: '#444444',
          family: UI_FONT,
        },
        xaxis: {
          automargin: true,
          autorange: true,
          title: { text: '', standoff: 12 },
          animate: true,
        },
        yaxis: {
          automargin: true,
          autorange: true,
          title: { text: '', standoff: 16 },
          animate: true,
          rangemode: 'tozero',
        },
        legend: {
          orientation: 'v',
          x: 1,
          y: 1,
        },
      },
      // Plotly options
      options: {
        displaylogo: false,
        responsive: true,
        modeBarButtonsToRemove: [
          'pan2d',
          'zoom2d',
          'select2d',
          'lasso2d',
          'zoomIn2d',
          'zoomOut2d',
          'autoScale2d',
          'hoverClosestCartesian',
          'hoverCompareCartesian',
          'resetScale2d',
          'toggleSpikelines',
          'resetViewMapbox',
        ],
        toImageButtonOptions: {
          format: 'png', // one of png, svg, jpeg, webp
          filename: 'chart',
          width: null,
          height: null,
        },
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
  },

  watch: {
    'globalState.resizeEvents'() {
      this.changeDimensions({})
    },

    resize(event: any) {
      this.changeDimensions(event)
    },
    'globalState.isDarkMode'() {
      this.updateTheme()
    },
  },

  async mounted() {
    await this.getVizDetails()
    // only continue if we are on a real page and not the file browser
    if (this.thumbnail) return

    try {
      if (this.vizDetails.dataset) await this.prepareData()
      if (this.vizDetails.traces) this.traces = this.vizDetails.traces
    } catch (err) {
      const e = err as any
      console.error({ e })
      this.loadingText = '' + e
    }

    this.updateTheme()
    window.addEventListener('resize', this.changeDimensions)
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.changeDimensions)
  },

  methods: {
    changeDimensions(dim: any) {
      if (dim?.height && dim?.width) {
        if (dim.height !== this.prevHeight || dim.width !== this.prevWidth) {
          this.prevHeight = dim.height
          this.prevWidth = dim.width
          this.layout = Object.assign({}, this.layout, dim)
        }
      }
    },

    updateTheme() {
      const colors = {
        paper_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        plot_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
      }
      this.layout = Object.assign({}, this.layout, colors)
    },

    async getVizDetails() {
      if (this.config) {
        this.vizDetails = Object.assign({}, this.config)
        this.$emit('title', this.vizDetails.title || 'Chart')
        if (this.vizDetails.traces) this.traces = this.vizDetails.traces
        return
      }

      // might be a project config:
      this.loadingText = 'Loading config...'
      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + config

      const text = await this.fileApi.getFileText(filename)
      const parsed = yaml.parse(text)

      this.vizDetails = parsed
      if (!this.vizDetails.title) this.vizDetails.title = 'Chart'
      this.$emit('title', this.vizDetails.title)
    },

    async prepareData(): Promise<any> {

      // Dataset can be single string or full object
      if (typeof this.vizDetails.dataset === 'string') {
          this.vizDetails.dataset = [{
            name: 'dataset',
            file: this.vizDetails.dataset
          }]
      }

      // TODO: currently hard-coded to only work with one dataset
      const ds = this.vizDetails.dataset[0] as DataSet

      let dataTable = await this.loadDatasets(ds)
      dataTable = this.transformData(ds, dataTable)

      let traces = []

      // TODO: Warning if traces is empty

      if (Object.keys(dataTable).length) {

        this.vizDetails.traces.forEach( (v: any) => {

            // This data uses array as name and needs to be split into multiple traces.
            if (v.name?.startsWith("$")) {

              let name = v.name.replace("$dataset.", "")
              let groups = this.groupDataTable(dataTable, name)

              Object.keys(groups).forEach(group => {

                // TODO: Is there a library for deep copy ?
                let copy = (JSON.parse(JSON.stringify(v)));

                copy.name = group;
                this.recursiveCheckForTemplate(groups[group], copy, '$dataset')
                traces.push(copy)
              })



            } else {
              this.recursiveCheckForTemplate(dataTable, v, '$dataset')
              traces.push(v)
            }

        })

      } else
        traces = this.vizDetails.traces

      this.vizDetails.traces = traces
    },

    async loadDatasets(ds: DataSet): Promise<DataTable> {
      this.loadingText = 'Loading datasets...'

      const csvData = await this.myDataManager.getDataset({ dataset: ds.file }, { highPrecision: true })
      return csvData.allRows
    },

    // Transform dataset if requested
    transformData(ds: DataSet, dataTable: DataTable) : DataTable {

      // TODO: Error checks and messages

      if ('pivot' in ds) {
        this.pivot(dataTable, ds.pivot.exclude, ds.pivot.valuesTo, ds.pivot.namesTo)
      }

      if ('aggregate' in ds) {
        this.aggregateColumns(dataTable, ds.aggregate.removeColumns, ds.aggregate.target)
      }

      return dataTable;
    },
    
    countOccurrences(array: Float64Array | Float32Array | any[]): {[key: string] : number} {
      let counts = {} as {[key: string] : number}
      array.forEach( (el : any) => {
          counts[el] = counts[el] ? counts[el] + 1 : 1;      
      });

      return counts
    },

    // Group data table by values in columnName and generate multiple tables
    groupDataTable(dataTable: DataTable, columnName: string): {[key: string] : DataTable} {

      let obj = {} as {[key: string] : DataTable}

      let column =  dataTable[columnName]

      let occ = this.countOccurrences(column.values)

      // Copy all columns and initialize as empty
      Object.entries(occ).forEach( kv => {

        const [group, n] = kv

        let dt = {} as DataTable

        // Shallow copy each column
        Object.entries(dataTable).forEach(kv => {
          const [key, column] = kv
          dt[key] = {...column}

          let c = Object.getPrototypeOf(column.values).constructor

          // Construct array of same type
          dt[key].values = new c(n)
        })

        obj[group] = dt
      })

      for (var i = 0; i < dataTable[columnName].values.length; i++) {

          var group = dataTable[columnName].values[i]
          let target = obj[group]

          // determine index by subtracting the total for each group
          let idx = target[columnName].values.length - occ[group]--;

          // Copy columns
          Object.entries(dataTable).forEach(kv => {
            const [key, column] = kv

            target[key].values[idx] = column.values[i];
          })

      }

      return obj
    },

    // Aggregate columns, currently only sum
    aggregateColumns(dataTable: DataTable, removeColumns: any, target: string) {




    },

    // Pivot wide to long format
    pivot(dataTable: DataTable, exclude: any[], valuesTo: string, namesTo: string) {

      // Columns to pivot
      const pivot = Object.keys(dataTable).filter(k => exclude.indexOf(k) == -1)
      
      exclude.forEach(column => {
        if (!(column in dataTable)) {       
            globalStore.commit('error', `Pivot column ${column} not in ${this.vizDetails.dataset}`)
        }
      })

      // New data entries
      const columns = Object.fromEntries(exclude.map(c => [c, []]))

      // Pivot target arrays
      const values = []
      const names = []

      const n = dataTable[Object.keys(dataTable)[0]].values.length

      console.log('Columns', columns, 'Pivot', pivot, 'n', n)

      for(let i = 0; i < n; i++) {
        // TODO: Fill columns and pivot
      }
    },

    recursiveCheckForTemplate(dataTable: DataTable, object: any, template: string) {
      Object.entries(object).forEach(kv => {
        const [key, value] = kv
        if (typeof value === 'string') {
          // string stuff
          if (value.includes(template)) {
            const column = value.substring(value.indexOf('.') + 1)
            if (column in dataTable) {
              object[key] = dataTable[column].values
            } else {
              globalStore.commit('error', `Column "column" not in ${this.vizDetails.dataset}`)
            }
          }
        } else if (Array.isArray(value)) {
          // array stuff
          if (typeof value[0] == 'object') {
            value.forEach(v => this.recursiveCheckForTemplate(dataTable, v, template))
          }
        } else if (typeof value == 'object') {
          this.recursiveCheckForTemplate(dataTable, value, template)
        }
      })
    }
  }
})

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'plotly',
  prettyName: 'Plotly Chart',
  description: 'Generic viewer for any type of Plotly chart',
  filePatterns: ['**/plotly*.y?(a)ml'],
  component: MyComponent,
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.mycomponent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  // margin: 1rem;
}

.mycomponent.is-thumbnail {
  padding-top: 0;
  height: $thumbnailHeight;
}

.myplot {
  height: 100%;
  width: 100%;
  flex: 1;
  margin: 0 auto;
}

.myplot.is-thumbnail {
  padding: 0rem 0rem;
  margin: 0 0;
}
</style>
