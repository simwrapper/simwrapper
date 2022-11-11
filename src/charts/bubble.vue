<template lang="pug">
VuePlotly.yplot(
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
  ref="plotly-element"
)
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import DashboardDataManager from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'

import { FileSystemConfig, Status, UI_FONT } from '@/Globals'
import globalStore from '@/store'
import { buildCleanTitle } from '@/charts/allCharts'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop() datamanager!: DashboardDataManager
  @Prop() cardId!: string
  @Prop({ required: true }) cardTitle!: string

  private globalState = globalStore.state

  // dataSet is either x,y or allRows[]
  private dataSet: { x?: any[]; y?: any[]; allRows?: any[] } = {}
  private id = 'bubble-' + Math.random()

  private async mounted() {
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()

    this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  }

  private changeDimensions(dimensions: { width: number; height: number }) {
    this.layout = Object.assign({}, this.layout, dimensions)
  }

  @Watch('globalState.isDarkMode') updateTheme() {
    const colors = {
      paper_bgcolor: this.globalState.isDarkMode ? '#141619' : '#fff',
      plot_bgcolor: this.globalState.isDarkMode ? '#141619' : '#fff',
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
    this.layout.xaxis.title.text = this.config.xAxisTitle || this.config.xAxisName || ''
    this.layout.yaxis.title.text = this.config.yAxisTitle || this.config.yAxisName || ''

    try {
      if (this.config.groupBy) this.updateChartWithGroupBy()
      else this.updateChartSimple()
    } catch (e) {
      const msg = '' + e
      this.$store.commit('setStatus', {
        type: Status.ERROR,
        msg,
        desc: 'Add a desription...',
      })
    }
  }

  private updateChartWithGroupBy() {
    // tba
  }

  // size circle
  // color is data
  private updateChartSimple() {
    const factor = this.config.factor || 1.0

    var legendname = this.config.bubble
    if (this.config.legendName) legendname = this.config.legendName
    if (this.config.legendTitle) legendname = this.config.legendTitle

    const allRows = this.dataSet.allRows || ({} as any)

    if (Object.keys(allRows).length === 0) {
      this.data = []
      return
    }

    // bubble sizes
    let bubble = allRows[this.config.bubble].values.map((v: any) => v * factor)
    if (this.config.skipFirstRow) bubble = bubble.slice(1)

    let x = allRows[this.config.x].values || []
    if (this.config.skipFirstRow) x = x.slice(1)

    let y = allRows[this.config.y].values
    if (this.config.skipFirstRow) y = y.slice(1)

    this.data = [
      {
        x: x,
        y: y,
        name: legendname,
        mode: 'markers',
        type: 'scatter',
        textinfo: 'label+percent',
        textposition: 'inside',
        automargin: true,
        showlegend: true,
        marker: { size: bubble },
      },
    ]
  }

  private layout: any = {
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
  }

  private data = [] as any[]

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
      filename: 'bubble-chart',
      width: null,
      height: null,
    },
  }
}
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
