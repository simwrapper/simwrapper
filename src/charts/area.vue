<template lang="pug">
vue-plotly(:data="data" :layout="layout" :options="options")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Worker, spawn, Thread } from 'threads'
import { isNumeric } from 'vega-lite'
import VuePlotly from '@statnett/vue-plotly'

import { FileSystemConfig, UI_FONT } from '@/Globals'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any

  private solverThread!: any
  private dataRows: any[] = []

  private async mounted() {
    await this.loadData()
    this.$emit('isLoaded')
  }

  private async loadData() {
    if (!this.files.length) return

    if (!this.solverThread) {
      this.solverThread = await spawn(new Worker('../workers/DataFetcher.thread'))
    }

    try {
      const data = await this.solverThread.fetchData({
        fileSystemConfig: this.fileSystemConfig,
        subfolder: this.subfolder,
        files: this.files,
        config: this.config,
      })

      this.dataRows = data
      this.updateChart()
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.dataRows = []
    } finally {
      Thread.terminate(this.solverThread)
    }
  }

  private updateChart() {
    // data comes back as an array of objects with elements.
    // We need to reshape it into an array of { x:[...] and y:[...] } objects,
    // one for each area in the chart

    const rows = this.dataRows as any[]
    const x = this.dataRows.map((row: any) => row[this.config.x])

    // Remove spurious columns
    const ignore: any[] = this.config.ignoreColumns || []
    const areaColumns = Object.keys(rows[0]).filter(
      col => col !== this.config.x && ignore.indexOf(col) === -1
    )

    // convert the data
    const convertedData: any = {}

    for (const col of areaColumns.sort((a: string, b: string) => (a > b ? -1 : 1))) {
      convertedData[col] = {
        name: col,
        x: x,
        y: [],
        stackgroup: 'one', // so they stack
        mode: 'none', // no background lines
      }
    }

    for (const row of rows) {
      areaColumns.forEach((col: any) => {
        convertedData[col].y.push(isNumeric(row[col]) ? row[col].toFixed(4) : row[col])
      })
    }

    this.data = Object.values(convertedData)
  }

  private layout = {
    height: 300,
    // // width: 500,
    margin: { t: 25, b: 0, l: 0, r: 0 },
    // auto
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
      format: 'svg', // one of png, svg, jpeg, webp
      filename: 'incidenceByAgeGroupOverTime',
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
