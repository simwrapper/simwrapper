<template lang="pug">
VuePlotly.yplot(
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
  ref="plotly-element"
)
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'

import { FileSystemConfig, Status, BG_COLOR_DASHBOARD, UI_FONT } from '@/Globals'
import globalStore from '@/store'
import { buildCleanTitle } from './_allPanels'

export default defineComponent({
  name: 'BubbleChartPanel',
  components: { VuePlotly },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
    cardTitle: { type: String, required: true },
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
    cardId: String,
  },
  data: () => {
    return {
      globalState: globalStore.state,

      // dataSet is either x,y or allRows[]
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: any[] },
      id: 'bubble-' + Math.random(),
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
          filename: 'bubble-chart',
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
      if (!this.datamanager) return {}

      try {
        const config = this.config as any
        const dataset = await this.datamanager.getDataset(config)

        // no filter? we are done:
        if (!config.filters) return dataset

        // filter data before returning:
        for (const [column, value] of Object.entries(config.filters)) {
          const filter: FilterDefinition = {
            dataset: config.dataset,
            column: column,
            value: value,
            range: Array.isArray(value),
          }
          this.datamanager.setFilter(filter)
        }

        const filteredData = await new Promise<any>(resolve => {
          this.datamanager?.addFilterListener(config, async () => {
            const filteredData = await this.datamanager?.getFilteredDataset(config)

            const rows = filteredData?.filteredRows as any[]
            if (!rows || !rows.length) {
              resolve({ allRows: {} })
              return
            }

            const keys = Object.keys(rows[0])
            const allRows = {} as any
            keys.forEach(key => (allRows[key] = { name: key, values: [] as any }))
            rows.forEach(row => {
              keys.forEach(key => allRows[key].values.push(row[key]))
            })

            resolve({ allRows })
          })
        })

        return filteredData
      } catch (e) {
        const message = '' + e
        console.log(message)
      }
      return {}
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

    // size circle
    // color is data
    updateChartSimple() {
      const factor = this.config.factor || 1.0

      var legendname = this.config.bubble
      if (this.config.legendName) legendname = this.config.legendName
      if (this.config.legendTitle) legendname = this.config.legendTitle

      const allRows = this.dataSet.allRows || ({} as any)

      if (Object.keys(allRows).length === 0) {
        this.data = []
        return
      }

      // bubble sizes
      let bubble = allRows[this.config.bubble].values.map((v: any) => v * factor)
      if (this.config.skipFirstRow) bubble = bubble.slice(1)

      let x = allRows[this.config.x].values || []
      if (this.config.skipFirstRow) x = x.slice(1)

      let y = allRows[this.config.y].values
      if (this.config.skipFirstRow) y = y.slice(1)

      this.data = [
        {
          x: x,
          y: y,
          name: legendname,
          mode: 'markers',
          type: 'scatter',
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: true,
          showlegend: true,
          marker: { size: bubble },
        },
      ]
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
