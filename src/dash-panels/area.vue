<template lang="pug">
VuePlotly.myplot(
  :data="data"
  :layout="layout"
  :options="options"
)
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import VuePlotly from '@/components/VuePlotly.vue'
import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import { FileSystemConfig, Status, BG_COLOR_DASHBOARD, UI_FONT } from '@/Globals'
import { buildCleanTitle } from './_allPanels'
import { buildColors } from '@/js/ColorsAndWidths'

import globalStore from '@/store'

export default defineComponent({
  name: 'AreaChartPanel',
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
      id: 'area-' + Math.floor(1e12 * Math.random()),
      colorMap: {} as { [category: string]: string },
      YAMLrequirementsArea: { dataset: '', x: '' },
      data: [] as any[],
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
          showgrid: false,
        },
        legend: {
          orientation: 'v',
          x: 1,
          y: 1,
        },
      },
      options: {
        displaylogo: false,
        responsive: true,
        automargin: true,
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
          filename: 'area-chart',
          width: null,
          height: null,
        },
      },
    }
  },
  async mounted() {
    this.updateLayout()
    this.updateTheme()

    this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)

    this.dataSet = await this.loadData()
    this.updateChart()

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  },
  beforeDestroy() {
    this.datamanager?.removeFilterListener(
      { ...this.config, subfolder: this.subfolder },
      this.handleFilterChanged
    )
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

    updateLayout() {
      this.layout.xaxis.title.text = this.config.xAxisTitle || this.config.xAxisName || ''
      this.layout.yaxis.title.text = this.config.yAxisTitle || this.config.yAxisName || ''
    },

    updateTheme() {
      const colors = {
        paper_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        plot_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
      }
      this.layout = Object.assign({}, this.layout, colors)
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

    async loadData() {
      if (!this.datamanager) return {}

      try {
        this.validateYAML()
        let dataset = await this.datamanager.getDataset(this.config, { subfolder: this.subfolder })

        // no filter? we are done
        if (!this.config.filters) return dataset

        // filter data before returning:
        this.datamanager.addFilterListener(
          { ...this.config, subfolder: this.subfolder },
          this.handleFilterChanged
        )

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
        this.$emit('error', `Error loading: ${this.subfolder}/${this.config.dataset}`)
        console.error('' + e)
      }
      return { allRows: {} }
    },

    validateYAML() {
      for (const key in this.YAMLrequirementsArea) {
        if (key in this.config === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `Area chart missing required key: ${key}`,
            desc: `Required keys: ${Object.keys(this.YAMLrequirementsArea)}`,
          })
        }
      }
    },

    updateChart() {
      try {
        if (this.config.groupBy) this.updateChartWithGroupBy()
        else this.updateChartSimple()
      } catch (e) {
        const msg = '' + e
        this.$emit('error', { type: Status.ERROR, msg })
      }
    },

    updateChartWithGroupBy() {
      // tba
    },

    updateChartSimple() {
      const allRows = this.dataSet.allRows || ({} as any)
      const columnNames = Object.keys(allRows)
      let useOwnNames = false
      let x: any[] = []

      if (!columnNames.length) return

      // old configs called it "usedCol" --> now "columns"
      let columns = this.config.columns || this.config.usedCol

      // Or maybe user didn't specify: then use all the columns!
      if (!columns && columnNames.length) {
        columns = columnNames.filter(col => col !== this.config.x).sort()
      }

      // Build colors for each column of data
      this.colorMap = buildColors(columns, this.config.colorRamp)

      // old legendname field
      if (this.config.legendName) this.config.legendTitles = this.config.legendName
      if (this.config.legendTitles?.length) useOwnNames = true

      // check for x column
      if (!allRows[this.config.x]) {
        this.$emit(
          'error',
          `${this.cardTitle}: "${this.config.dataset}" x column "${this.config.x}" missing`
        )
        return
      }

      // convert the data
      const convertedData: any = {}
      x = allRows[this.config.x].values || []
      if (this.config.skipFirstRow) x = x.slice(1)

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const legendName = useOwnNames ? this.config.legendTitles[i] ?? col : col

        let values = allRows[col].values
        if (this.config.skipFirstRow) values = values.slice(1)

        // are durations in 00:00:00 format?
        if (this.config.convertToSeconds) values = this.convertToSeconds(values)
        convertedData[col] = {
          name: legendName,
          x: x,
          y: values,
          stackgroup: 'one', // so they stack
          mode: 'none', // no background lines
          marker: { color: this.colorMap[col] },
        }
      }

      this.data = Object.values(convertedData)
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
