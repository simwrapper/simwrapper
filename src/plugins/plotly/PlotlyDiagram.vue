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
import { FileSystemConfig, UI_FONT, BG_COLOR_DASHBOARD, DataTable } from '@/Globals'
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
      const dataTable = await this.loadDatasets()
      if (Object.keys(dataTable).length) {
        this.replaceTemplateStringsWithRealData(dataTable)
      }
    },

    async loadDatasets(): Promise<DataTable> {
      this.loadingText = 'Loading datasets...'

      const url = this.vizDetails.dataset
      const csvData = await this.myDataManager.getDataset({ dataset: url }, { highPrecision: true })
      return csvData.allRows
    },

    replaceTemplateStringsWithRealData(dataTable: DataTable) {
      this.recursiveCheckForTemplate(dataTable, this.vizDetails, '$dataset')
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
    },
  },
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
