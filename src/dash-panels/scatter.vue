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

import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'
import { FileSystemConfig, Status, BG_COLOR_DASHBOARD, UI_FONT } from '@/Globals'
import globalStore from '@/store'
import { buildCleanTitle } from './_allPanels'
import { buildColors } from '@/js/ColorsAndWidths'

export default defineComponent({
  name: 'BarChartPanel',
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
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: any },
      colorMap: {} as { [category: string]: string },
      id: ('scatter-' + Math.floor(1e12 * Math.random())) as any,
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
          filename: 'scatter-plot',
          width: null,
          height: null,
        },
      },
    }
  },
  async mounted() {
    this.updateTheme()

    this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)

    this.dataSet = await this.loadData()
    this.updateChart()

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  },
  beforeDestroy() {
    this.datamanager?.removeFilterListener(this.config, this.handleFilterChanged)
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

    handleFilterChanged() {
      if (!this.datamanager) return

      const { filteredRows } = this.datamanager.getFilteredDataset(this.config) as any

      if (!filteredRows || !filteredRows.length) {
        this.dataSet = { allRows: {} }
      } else {
        const allRows = {} as any

        const keys = Object.keys(filteredRows[0])
        keys.forEach(key => (allRows[key] = { name: key, values: [] as any }))

        filteredRows.forEach((row: any) => {
          keys.forEach(key => allRows[key].values.push(row[key]))
        })
        this.dataSet = { allRows }
      }

      this.updateChart()
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
      try {
        let dataset = await this.datamanager.getDataset(this.config)

        // no filter? we are done
        if (!this.config.filters) return dataset

        // filter data before returning:
        this.datamanager.addFilterListener(this.config, this.handleFilterChanged)

        for (const [column, value] of Object.entries(this.config.filters)) {
          const filter: FilterDefinition = {
            dataset: this.config.dataset,
            column: column,
            value: value,
            range: Array.isArray(value),
          }
          this.datamanager.setFilter(filter)
        }
        // empty for now; filtered data will come back later via handleFilterChanged async.
        return { allRows: {} }
      } catch (e) {
        console.error('' + e)
      }
      return { allRows: {} }
    },

    updateChart() {
      this.layout.xaxis.title.text = this.config.xAxisTitle || this.config.xAxisName || ''
      this.layout.yaxis.title.text = this.config.yAxisTitle || this.config.yAxisName || ''

      try {
        if (this.config.groupBy) this.updateChartWithGroupBy()
        else this.updateChartSimple()
      } catch (e) {
        const msg = '' + e
        this.$emit('error', {
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
      var useOwnNames = false

      const allRows = this.dataSet.allRows || ({} as any)
      const columnNames = Object.keys(allRows)

      if (!columnNames.length) return

      const factor = this.config.factor || 1.0

      // // old configs called it "usedCol" --> now "columns"
      const columns = this.config.columns || this.config.usedCol || [this.config.y] || []

      let legendname = columns
      if (this.config.legendName) legendname = this.config.legendName
      if (this.config.legendTitle) legendname = this.config.legendTitle

      // check for valid columns
      let status = true
      const check = ['x']
      for (const col of check) {
        if (!allRows[this.config[col]]) {
          this.$emit(
            'error',
            `${this.cardTitle}: "${this.config.dataset}" ${check} column "${col}" missing`
          )
          status = false
        }
      }
      if (!status) return

      let x = allRows[this.config.x].values || []
      if (this.config.skipFirstRow) x = x.slice(1)

      const markerSize = this.config.markerSize || 3

      // Build colors for each column of data
      this.colorMap = buildColors(columns, this.config.colorRamp)

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const legendName = useOwnNames ? this.config.legendTitles[i] : col

        let values = allRows[col].values
        if (this.config.skipFirstRow) values = values.slice(1)

        this.data.push({
          x: x,
          y: values,
          name: legendName,
          mode: 'markers',
          type: 'scatter',
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: true,
          showlegend: true,
          marker: { size: markerSize, color: this.colorMap[i] },
        })
      }
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
