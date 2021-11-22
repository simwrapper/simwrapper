<template lang="pug">
vue-plotly(:data="data" :layout="layout" :options="options" :config="{responsive: true}" :class="className")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Worker, spawn, Thread } from 'threads'
import VuePlotly from '@statnett/vue-plotly'

import { FileSystemConfig, UI_FONT } from '@/Globals'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any

  private globalState = this.$store.state

  private thread!: any
  private dataRows: any = {}

  private async mounted() {
    this.updateTheme()
    await this.loadData()
  }

  @Watch('globalState.isDarkMode') updateTheme() {
    this.layout.paper_bgcolor = this.globalState.isDarkMode ? '#282c34' : '#fff' // #f8f8ff
    this.layout.plot_bgcolor = this.globalState.isDarkMode ? '#282c34' : '#fff'
    this.layout.font.color = this.globalState.isDarkMode ? '#cccccc' : '#444444'
  }

  private async loadData() {
    if (!this.files.length) return

    if (this.thread) Thread.terminate(this.thread)
    this.thread = await spawn(new Worker('../workers/DataFetcher.thread'))

    try {
      const data = await this.thread.fetchData({
        fileSystemConfig: this.fileSystemConfig,
        subfolder: this.subfolder,
        files: this.files,
        config: this.config,
      })

      this.dataRows = data
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.dataRows = {}
    } finally {
      Thread.terminate(this.thread)
    }
  }

  // Creates the HeatMap as soon as the data has been read in or updated.
  @Watch('dataRows') private prepareData() {
    var xaxis: any[] = []
    var yaxis: any[] = []
    var matrix: any[] = []
    var subMatrix: any[] = []

    // Reads all the data of the y-axis.
    for (var i = 0; i < this.dataRows.length; i++) {
      // Adding all values to the yAxis Array
      yaxis.push(this.dataRows[i][this.config.y])
    }

    // Reads all the data of the x-axis.
    for (const [key, value] of Object.entries(this.dataRows[0])) {
      console.log(this.dataRows[0])
      if (this.config.columns.includes(key)) {
        xaxis.push(key)
      }
    }

    // Converts all data to the matrix format of the heatmap
    for (var i = 0; i < this.dataRows.length; i++) {
      for (const [key, value] of Object.entries(this.dataRows[i])) {
        if (this.config.columns.includes(key)) {
          subMatrix[xaxis.indexOf(key)] = value
        }
      }
      matrix[yaxis.indexOf(this.dataRows[i][this.config.y])] = subMatrix
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
