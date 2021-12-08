<template lang="pug">
VuePlotly(
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
  ref="plotly-element"
)
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { isNumeric } from 'vega-lite'

import VuePlotly from '@/components/VuePlotly.vue'
import DashboardDataManager from '@/js/DashboardDataManager'
import { FileSystemConfig, UI_FONT } from '@/Globals'

import globalStore from '@/store'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop() datamanager!: DashboardDataManager

  private globalState = globalStore.state

  // dataSet is either x,y or allRows[]
  private dataSet: { x?: any[]; y?: any[]; allRows?: any[] } = {}
  private id = 'area-' + Math.random()

  private async mounted() {
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()
    this.$emit('isLoaded')
  }

  @Watch('globalState.isDarkMode') updateTheme() {
    const colors = {
      paper_bgcolor: this.globalState.isDarkMode ? '#282c34' : '#fff',
      plot_bgcolor: this.globalState.isDarkMode ? '#282c34' : '#fff',
      font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
    }
    this.layout = Object.assign({}, this.layout, colors)
  }

  private async loadData() {
    if (!this.files.length) return {}

    try {
      const dataset = await this.datamanager.getDataset(this.config)
      // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)
      return dataset
    } catch (e) {
      const message = '' + e
      console.log(message)
    }
    return {}
  }

  private updateChart() {
    if (this.config.groupBy) this.updateChartWithGroupBy()
    else this.updateChartSimple()
  }

  private updateChartWithGroupBy() {
    // tba
  }

  private updateChartSimple() {
    // data comes back as an array of objects with elements.
    // We need to reshape it into an array of { x:[...] and y:[...] } objects,
    // one for each area in the chart

    const allRows = this.dataSet.allRows || []

    const x = allRows.map((row: any) => row[this.config.x])

    // Identify usable data columns
    const ignore: any[] = this.config.ignoreColumns || []
    const include: any[] = this.config.columns || this.config.usedCol || []

    // ignored columns
    let useColumns = Object.keys(allRows[0]).filter(
      (col) => col !== this.config.x && ignore.indexOf(col) === -1
    )

    // selected columns
    if (include.length) {
      useColumns = Object.keys(allRows[0]).filter((col) => include.indexOf(col) > -1)
    }

    // convert the data
    const convertedData: any = {}

    for (const col of useColumns.sort((a: string, b: string) => (a > b ? -1 : 1))) {
      convertedData[col] = {
        name: col,
        x: x,
        y: [],
        stackgroup: 'one', // so they stack
        mode: 'none', // no background lines
      }
    }

    for (const row of allRows) {
      useColumns.forEach((col: any) => {
        convertedData[col].y.push(isNumeric(row[col]) ? row[col].toFixed(4) : row[col])
      })
    }

    this.data = Object.values(convertedData)
  }

  private layout: any = {
    height: 300,
    margin: { t: 25, b: 0, l: 0, r: 0 },
    xaxis: {
      // title: {
      //   text: this.config.x,
      //   // standoff: 0,
      // },
      automargin: true,
      showgrid: false,
    },
    yaxis: { automargin: true, showgrid: false },
    legend: { orientation: 'h' }, // , yanchor: 'bottom', y: -0.4 },
    font: {
      family: UI_FONT,
      color: '#444444',
    },
  }

  private data: any[] = []

  private options = {
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
      filename: 'plot',
      width: 1200,
      height: 800,
      scale: 1.0, // Multiply title/legend/axis/canvas sizes by this factor
    },
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

@media only screen and (max-width: 640px) {
}
</style>
