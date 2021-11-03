<template lang="pug">
vue-plotly(:data="data" :layout="layout" :options="options")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Worker, spawn, Thread } from 'threads'
import VuePlotly from '@statnett/vue-plotly'

import { FileSystemConfig, UI_FONT } from '@/Globals'

const mockData = {
  car: 34,
  bike: 18,
  pt: 30,
  walk: 8,
}

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
    this.$emit('isLoaded')
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
      this.updateChart()
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.dataRows = {}
    } finally {
      Thread.terminate(this.thread)
    }
  }

  private updateChart() {
    const x = []

    var useOwnNames = false

    if (this.config.legendName !== undefined) {
      if (this.config.legendName.length == this.config.usedCol.length) {
        useOwnNames = true
      }
    }

    for (var i = 0; i < this.dataRows.length; i++) {
      if (i == 0 && this.config.skipFirstRow) {
      } else {
        x.push(this.dataRows[i].iteration)
      }
    }

    for (var i = 0; i < this.config.usedCol.length; i++) {
      var name = this.config.usedCol[i]
      var legendName = ''
      if (this.config.usedCol[i] !== 'undefined') {
        if (useOwnNames) {
          legendName = this.config.legendName[i]
        } else {
          legendName = name
        }
        const value = []
        for (var j = 0; j < this.dataRows.length; j++) {
          if (j == 0 && this.config.skipFirstRow) {
          } else {
            value.push(this.dataRows[j][name])
          }
        }
        this.data.push({
          x: x,
          y: value,
          name: legendName,
          type: 'line',
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: true,
        })
      }
    }
  }

  private layout: any = {
    height: 300,
    // width: 500,
    margin: { t: 30, b: 50, l: 60, r: 20 },
    //legend: { orientation: 'h' }, // , yanchor: 'bottom', y: -0.4 },
    font: {
      family: UI_FONT,
      color: '#444444',
    },
    xaxis: {
      autorange: true,
      title: this.config.xAxisName,
    },
    yaxis: {
      autorange: true,
      title: this.config.yAxisName,
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
      name: '',
      type: 'line',
      textinfo: 'label+percent',
      textposition: 'inside',
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
      format: 'svg', // one of png, svg, jpeg, webp
      filename: 'incidenceByAgeGroupOverTime',
      width: 800,
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
