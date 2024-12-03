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

import VuePlotly from '@/components/VuePlotly.vue'
import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import { DataTable, FileSystemConfig, BG_COLOR_DASHBOARD, UI_FONT, Status } from '@/Globals'
import globalStore from '@/store'
import { buildCleanTitle } from './_allPanels'
import { round } from 'lodash'

export default defineComponent({
  name: 'HeatmapPanel',
  components: { VuePlotly },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
    cardTitle: { type: String, required: true },
    cardId: String,
    datamanager: { type: Object as PropType<DashboardDataManager>, required: true },
    zoomed: Boolean,
  },
  data: () => {
    return {
      globalState: globalStore.state,
      // dataSet is either x,y or allRows[]
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: DataTable },
      id: ('heatmap-' + Math.floor(1e12 * Math.random())) as any,
      // YAMLrequirementsHeatmap: { dataset: '', y: '', columns: [] },
      YAMLrequirementsHeatmap: { dataset: '', y: '' },
      layout: {
        margin: { t: 8, b: 50 },
        font: {
          color: '#444444',
          family: UI_FONT,
        },
        barmode: '',
        bargap: 0.08,
        xaxis: {
          autorange: true,
          title: '',
        },
        yaxis: {
          autorange: true,
          title: '',
        },
        legend: {
          x: 1,
          xanchor: 'right',
          y: 1,
        },
        annotations: [],
      } as any,
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
          filename: 'heatmap',
          width: 1200,
          height: 800,
          scale: 1.0, // Multiply title/legend/axis/canvas sizes by this factor
        },
      },
    }
  },
  async mounted() {
    this.updateTheme()
    this.checkWarningsAndErrors()
    this.dataSet = await this.loadData()

    if (Object.keys(this.dataSet).length) {
      this.updateChart()
      this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)
      this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    }
    this.$emit('isLoaded')
  },
  beforeDestroy() {
    this.datamanager?.removeFilterListener(
      { ...this.config, subfolder: this.subfolder },
      this.handleFilterChanged
    )
  },

  watch: {
    zoomed() {
      this.resizePlot()
    },
    'globalState.isDarkMode'() {
      this.updateTheme()
    },
  },
  methods: {
    changeDimensions(dimensions: { width: number; height: number }) {
      this.layout = Object.assign({}, this.layout, dimensions)
    },

    resizePlot() {
      var elements = document.getElementsByClassName('spinner-box')
      if (this.zoomed) {
        for (let element of elements) {
          if (element.clientHeight > 0) {
            this.layout.height = element.clientHeight
          }
        }
      } else {
        this.layout.height = 300
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
      for (const key in this.YAMLrequirementsHeatmap) {
        if (key in this.config === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `YAML file missing required key: ${key}`,
            desc: 'Check this.YAMLrequirementsXY for required keys',
          })
        }
      }
    },

    updateChart() {
      this.layout.xaxis.title = this.config.xAxisTitle || this.config.xAxisName || ''
      this.layout.yaxis.title = this.config.yAxisTitle || this.config.yAxisName || ''

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

    updateChartSimple() {
      var xaxis: any[] = []
      var matrix: any[] = []

      const allRows = this.dataSet.allRows || ({} as any)

      let columns = this.config.columns || this.config.usedCol || []

      // Add all columns except the y column if no columns are specified
      if (!columns.length) {
        let allColumns = Object.keys(allRows)
        const y = this.config.y

        const index = allColumns.indexOf(y, 0)
        if (index > -1) {
          allColumns.splice(index, 1)
        }
        columns = allColumns
      }

      if (!columns.length) return

      // check for valid columns
      let status = true
      const check = ['y']
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

      // Reads all the data of the y-axis.
      let yaxis = allRows[this.config.y].values

      // Reads all the data of the x-axis.
      for (const key of Object.keys(allRows)) {
        if (columns.includes(key)) {
          xaxis.push(key)
        }
      }

      // Converts all data to the matrix format of the heatmap
      for (let i = 0; i < columns.length; i++) {
        matrix[i] = allRows[columns[i]].values
      }

      if (!this.config.flipAxes) {
        // Transposes the matrix to get the same orientation as in the .csv file
        yaxis = yaxis.reverse()
        this.transpose(matrix)
        matrix = matrix.reverse()
      }

      // Pushes the data into the chart
      this.data = [
        {
          x: this.config.flipAxes ? yaxis : xaxis,
          y: this.config.flipAxes ? xaxis : yaxis,
          z: matrix,
          colorscale: 'Viridis', // 'YlOrRed', // 'Hot',
          type: 'heatmap',
          automargin: true,
        },
      ]

      if (this.config.showLabels) {
        // Clear all annotations
        this.layout.annotations.length = 0

        const d = this.data[0]
        for (let i = 0; i < d.x.length; i++) {
          for (let j = 0; j < d.y.length; j++) {
            const result = {
              x: d.x[i],
              y: d.y[j],
              text: round(d.z[j][i], 2),
              showarrow: false,
              font: {
                family: 'Arial Black',
                size: 12,
                color: 'white',
              },
            }
            this.layout.annotations.push(result)
          }
        }
      }
    },

    transpose(matrix: any) {
      for (let i = 0; i < matrix.length; i++) {
        for (let j = 0; j < i; j++) {
          const tmp = matrix[i][j]
          matrix[i][j] = matrix[j][i]
          matrix[j][i] = tmp
        }
      }
    },

    // Check this plot for warnings and errors
    checkWarningsAndErrors() {
      var plotTitle = this.cardTitle
      // warnings
      // missing title
      if (plotTitle.length == 0) {
        this.$emit('error', {
          type: Status.WARNING,
          msg: `The plot title is missing!`,
          desc: "Please add a plot title in the .yaml-file (title: 'Example title')",
        })
      }
      // errors
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
</style>
