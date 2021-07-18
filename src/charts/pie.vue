<template lang="pug">
vue-plotly(:data="data" :layout="layout" :options="options")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Worker, spawn, Thread } from 'threads'
import VuePlotly from '@statnett/vue-plotly'

import { FileSystemConfig } from '@/Globals'

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

  private solverThread!: any
  private dataRows: any = {}

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
      this.dataRows = {}
    } finally {
      Thread.terminate(this.solverThread)
    }
  }

  private updateChart() {
    this.data[0].labels = Object.keys(this.dataRows)
    this.data[0].values = Object.values(this.dataRows)
  }

  private layout = {
    height: 300,
    // width: 500,
    margin: { t: 30, b: 5, l: 0, r: 0 },
    legend: { orientation: 'h' }, // , yanchor: 'bottom', y: -0.4 },
    font: {
      family: "'Titillium Web', 'Roboto', 'Open Sans', Avenir, Arial, Helvetica, sans-serif",
    },
  }

  private data = [
    {
      labels: [] as any[],
      values: [] as any[],
      type: 'pie',
      hole: 0.2,
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
