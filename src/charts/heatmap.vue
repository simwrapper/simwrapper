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

import VuePlotly from '@/components/VuePlotly.vue'
import DashboardDataManager from '@/js/DashboardDataManager'
import { FileSystemConfig, UI_FONT } from '@/Globals'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop() datamanager!: DashboardDataManager

  private globalState = this.$store.state

  // dataSet is either x,y or allRows[]
  private dataSet: { x?: any[]; y?: any[]; allRows?: any[] } = {}
  private id = 'heatmap-' + Math.random()

  private async mounted() {
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()
    this.$emit('isLoaded')
  }

  @Watch('globalState.isDarkMode') updateTheme() {
    this.layout.paper_bgcolor = this.globalState.isDarkMode ? '#282c34' : '#fff' // #f8f8ff
    this.layout.plot_bgcolor = this.globalState.isDarkMode ? '#282c34' : '#fff'
    this.layout.font.color = this.globalState.isDarkMode ? '#cccccc' : '#444444'
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
    var xaxis: any[] = []
    var yaxis: any[] = []
    var matrix: any[] = []
    var subMatrix: any[] = []

    const allRows = this.dataSet.allRows || []

    const columns = this.config.columns || this.config.usedCol || []

    // Reads all the data of the y-axis.
    for (var i = 0; i < allRows.length; i++) {
      // Adding all values to the yAxis Array
      yaxis.push(allRows[i][this.config.y])
    }

    // Reads all the data of the x-axis.
    for (const [key, value] of Object.entries(allRows[0])) {
      if (columns.includes(key)) {
        xaxis.push(key)
      }
    }

    // Converts all data to the matrix format of the heatmap
    for (var i = 0; i < allRows.length; i++) {
      for (const [key, value] of Object.entries(allRows[i])) {
        if (this.config.columns.includes(key)) {
          subMatrix[xaxis.indexOf(key)] = value
        }
      }
      matrix[yaxis.indexOf(allRows[i][this.config.y])] = subMatrix
      subMatrix = []
    }

    // Pushes the data into the chart
    this.data = [
      {
        x: xaxis,
        y: yaxis,
        z: matrix,
        //colorscale: 'Hot', // 'YlOrRed', // 'Hot',
        type: 'heatmap',
        automargin: true,
      },
    ]
  }

  private layout: any = {
    height: 300,
    width: 0,
    margin: { t: 30, b: 50, l: 60, r: 20 },
    //legend: { orientation: 'h' }, // , yanchor: 'bottom', y: -0.4 },
    font: {
      color: '#444444',
      family: UI_FONT,
    },
    barmode: '',
    bargap: 0.08,
    xaxis: {
      autorange: true,
      title: this.config.xAxisTitle,
    },
    yaxis: {
      autorange: true,
      title: this.config.yAxisTitle,
    },
    legend: {
      x: 1,
      xanchor: 'right',
      y: 1,
    },
  }

  private data = [
    {
      x: [] as any[],
      y: [] as any[],
      z: [] as any[],
      type: 'heatmap',
      automargin: true,
    },
  ]

  private options = {
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
</style>
