<template lang="pug">
VuePlotly.myplot(
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
  :class="className"
)

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { buildColors } from '@/js/ColorsAndWidths'

import { FileSystemConfig, Status, BG_COLOR_DASHBOARD, UI_FONT } from '@/Globals'
import DashboardDataManager, { FilterDefinition } from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'
import { buildCleanTitle } from './_allPanels'

import globalStore from '@/store'

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
    datamanager: Object as PropType<DashboardDataManager>,
  },

  data: () => {
    return {
      globalState: globalStore.state,
      id: 'bar-' + Math.floor(1e12 * Math.random()),
      plotID: Math.floor(1e12 * Math.random()).toString(),
      className: '',
      // dataSet is either x,y or allRows[]
      dataSet: {} as { x?: any[]; y?: any[]; allRows?: any },
      colorMap: {} as { [category: string]: string },
      YAMLrequirementsBar: { dataset: '', x: '' },
      layout: {
        barmode: 'overlay',
        bargap: 0.08,
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
        responsive: true,
        displaylogo: false,
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
          filename: 'bar-chart',
          width: null,
          height: null,
        },
      },
    }
  },
  async mounted() {
    this.updateLayout()
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()

    this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')

    this.checkWarningsAndErrors()
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

    checkWarningsAndErrors() {
      // Check this plot for warnings and errors

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

    updateTheme() {
      const colors = {
        paper_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        plot_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
      }
      this.layout = Object.assign({}, this.layout, colors)
    },

    updateLayout() {
      this.layout.xaxis.title.text = this.config.xAxisTitle || this.config.xAxisName || ''
      this.layout.yaxis.title.text = this.config.yAxisTitle || this.config.yAxisName || ''
    },

    async handlePlotlyClick(click: any) {
      try {
        const { x, y, data } = click.points[0]

        const filter = this.config.groupBy
        const value = x

        // TODO this.datamanager.setFilter(this.config.dataset, filter, value)
      } catch (e) {
        console.error(e)
      }
    },

    async handleFilterChanged() {
      if (!this.datamanager) return
      try {
        const { filteredRows } = this.datamanager.getFilteredDataset(this.config) as any

        // is filter UN-selected?
        if (!filteredRows) {
          this.data = [this.data[0]]
          this.data[0].opacity = 1.0
          return
        }

        const fullDataCopy = Object.assign({}, this.data[0])

        fullDataCopy.x = filteredRows.x
        fullDataCopy.y = filteredRows.y
        fullDataCopy.opacity = 1.0
        fullDataCopy.name = 'Filtered'
        // let plotly manage bar colors EXCEPT the filter
        fullDataCopy.marker = { color: '#ffaf00' } // 3c6' }

        this.data = [this.data[0], fullDataCopy]
        this.data[0].opacity = 0.3
        this.data[0].name = 'All'
      } catch (e) {
        const message = '' + e
        console.log(message)
        this.dataSet = {}
      }
    },

    async loadData() {
      if (!this.datamanager) return {}

      try {
        this.validateYAML()
        let dataset = await this.datamanager.getDataset(this.config, { subfolder: this.subfolder })

        // no filter? we are done:
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
        console.error('' + e)
      }
      return { allRows: {} }
    },

    validateYAML() {
      for (const key in this.YAMLrequirementsBar) {
        if (key in this.config === false) {
          this.$emit('error', {
            type: Status.ERROR,
            msg: `Bar chart missing required key: ${key}`,
            desc: `Bar chart requires ${Object.keys(this.YAMLrequirementsBar)}`,
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
      this.className = this.plotID // stacked bug-fix hack

      // TODO: re-implement grouping

      // const { x, y } = this.dataRows

      // this.data = [
      //   {
      //     x,
      //     y,
      //     name: this.config.groupBy,
      //     type: 'bar',
      //     textinfo: 'label+percent',
      //     textposition: 'inside',
      //     automargin: true,
      //     opacity: 1.0,
      //   },
      // ]
    },

    updateChartSimple() {
      let x: any[] = []

      var useOwnNames = false

      const allRows = this.dataSet.allRows || ({} as any)
      const columnNames = Object.keys(allRows)

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

      if (this.config.stacked) {
        this.layout.barmode = 'stack'
      } else {
        this.layout.barmode = 'group'
      }

      if (this.config.stacked) this.className = this.plotID

      // check for x column
      if (!allRows[this.config.x]) {
        this.$emit(
          'error',
          `${this.cardTitle}: "${this.config.dataset}" x column "${this.config.x}" missing`
        )
        return
      }

      const xColumn = allRows[this.config.x]

      if (!xColumn) {
        throw Error(`File ${this.config.dataset}: Could not find column ${this.config.x}`)
      }

      x = xColumn.values
      if (this.config.skipFirstRow) x = x.slice(1)

      for (let i = 0; i < columns.length; i++) {
        const col = columns[i]
        const legendName = useOwnNames ? this.config.legendTitles[i] ?? col : col

        let values = allRows[col].values
        if (this.config.skipFirstRow) values = values.slice(1)

        // are durations in 00:00:00 format?
        if (this.config.convertToSeconds) values = this.convertToSeconds(values)

        this.data.push({
          x: x,
          y: values,
          name: legendName,
          type: 'bar',
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: true,
          opacity: 1.0,
          marker: { color: this.colorMap[col] },
        })
      }
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

//
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
