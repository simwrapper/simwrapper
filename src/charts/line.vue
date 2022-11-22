<template lang="pug">
VuePlotly.myplot(
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
)
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import DashboardDataManager from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'

import { FileSystemConfig, Status, BG_COLOR_DASHBOARD, UI_FONT } from '@/Globals'
import globalStore from '@/store'
import { buildCleanTitle } from '@/charts/allCharts'

export default defineComponent({
  name: 'LineChartPanel',
  components: { VuePlotly },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
    cardTitle: { type: String, required: true },
    cardId: String,
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
  },
  data: () => {
    return {
      globalState: globalStore.state,
      // dataSet is either x,y or allRows[]
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: any[] },
      id: ('line-' + Math.random()) as any,
      YAMLrequirementsLine: { dataset: '', x: '' },
      YAMLdeprecations: ['usedCol'],
      layout: {
        height: 300,
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
      data: [] as any[],
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
          filename: 'line-chart',
          width: null,
          height: null,
        },
      },
    }
  },
  async mounted() {
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()

    this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  },
  watch: {
    'globalState.isDarkMode'() {
      this.updateTheme()
    },
  },
  methods: {
    changeDimensions(dimensions: { width: number; height: number }) {
      this.layout = Object.assign({}, this.layout, dimensions)
    },
    updateTheme() {
      const colors = {
        paper_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        plot_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
      }
      this.layout = Object.assign({}, this.layout, colors)
    },

    async loadData() {
      if (!this.files.length) return {}

      try {
        this.validateYAML()
        const dataset = await this.datamanager.getDataset(this.config)
        // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)
        return dataset
      } catch (e) {
        const message = '' + e
        console.log(message)
      }
      return {}
    },

    validateYAML() {
      console.log('in line validation')

      for (const key in this.YAMLrequirementsLine) {
        if (key in this.config === false) {
          this.$store.commit('setStatus', {
            type: Status.ERROR,
            msg: `line chart: missing required key: ${key}`,
            desc: JSON.stringify(this.config),
          })
        }
      }

      for (const deprecated of this.YAMLdeprecations) {
        if (this.config[deprecated]) {
          this.$store.commit('setStatus', {
            type: Status.WARNING,
            msg: `line chart: deprecated field: ${deprecated}`,
            desc: JSON.stringify(this.config),
          })
        }
      }
    },

    updateChart() {
      this.layout.xaxis.title.text = this.config.xAxisTitle || this.config.xAxisName || ''
      this.layout.yaxis.title.text = this.config.yAxisTitle || this.config.yAxisName || ''

      try {
        if (this.config.groupBy) this.updateChartWithGroupBy()
        else this.updateChartSimple()
      } catch (e) {
        const msg = '' + e
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg,
          desc: 'Add a desription...',
        })
      }
    },

    updateChartWithGroupBy() {
      // tba
    },

    updateChartSimple() {
      let useOwnNames = false

      // old legendname field
      if (this.config.legendName) this.config.legendTitles = this.config.legendName
      if (this.config.legendName !== undefined) {
        if (this.config.legendName.length == this.config.usedCol.length) {
          useOwnNames = true
        }
      }

      const allRows = this.dataSet.allRows || ({} as any)
      const columnNames = Object.keys(allRows)

      if (!columnNames.length) {
        this.data = []
        return
      }

      let x = allRows[this.config.x].values || []
      if (this.config.skipFirstRow) x = x.slice(1)

      // old configs called it "usedCol" --> now "columns"
      let columns = this.config.columns || this.config.usedCol

      // Or maybe user didn't specify: then use all the columns!
      if (!columns && columnNames.length) {
        columns = columnNames.filter(col => col !== this.config.x).sort()
      }

      const lines = [] as any[]

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const legendName = useOwnNames ? this.config.legendTitles[i] : col

        let values = allRows[col].values
        if (this.config.skipFirstRow) values = values.slice(1)

        // are durations in 00:00:00 format?
        if (this.config.convertToSeconds) values = this.convertToSeconds(values)

        lines.push({
          x: x,
          y: values,
          name: legendName,
          type: 'line',
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: false,
        })
      }
      this.data = lines
    },

    convertToSeconds(values: any[]) {
      values = values.map((v: string) => {
        try {
          const pieces = v.split(':')
          const seconds = pieces.reduce((prev: any, curr: any) => parseInt(curr, 10) + prev * 60, 0)
          return seconds
        } catch (e) {
          return 0
        }
      })
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.myplot {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
}

@media only screen and (max-width: 640px) {
}
</style>
