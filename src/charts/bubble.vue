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

import { FileSystemConfig, UI_FONT } from '@/Globals'
import globalStore from '@/store'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop() datamanager!: DashboardDataManager
  @Prop() cardId!: string

  private globalState = globalStore.state

  // dataSet is either x,y or allRows[]
  private dataSet: { x?: any[]; y?: any[]; allRows?: any[] } = {}
  private id = 'bubble-' + Math.random()

  private async mounted() {
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  }

  private changeDimensions(dimensions: { width: number; height: number }) {
    this.layout = Object.assign({}, this.layout, dimensions)
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
    this.layout.xaxis.title = this.config.xAxisTitle || this.config.xAxisName || ''
    this.layout.yaxis.title = this.config.yAxisTitle || this.config.yAxisName || ''

    if (this.config.groupBy) this.updateChartWithGroupBy()
    else this.updateChartSimple()
  }

  private updateChartWithGroupBy() {
    // tba
  }

  // size circle
  // color is data
  private updateChartSimple() {
    const x = []
    const bubble = []
    const y = []

    const factor = this.config.factor || 1.0

    var legendname = this.config.bubble
    if (this.config.legendName) legendname = this.config.legendName
    if (this.config.legendTitle) legendname = this.config.legendTitle

    const allRows = this.dataSet.allRows || []

    for (var i = 0; i < allRows.length; i++) {
      if (i == 0 && this.config.skipFirstRow) {
      } else {
        x.push(allRows[i][this.config.x])
      }
    }

    // // old configs called it "usedCol" --> now "columns"
    // const columns = this.config.columns || this.config.usedCol

    for (var i = 0; i < allRows.length; i++) {
      if (i == 0 && this.config.skipFirstRow) {
      } else {
        bubble.push(allRows[i][this.config.bubble] * factor)
      }
    }

    for (var i = 0; i < allRows.length; i++) {
      if (i == 0 && this.config.skipFirstRow) {
      } else {
        y.push(allRows[i][this.config.y])
      }
    }

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
    // width: 500,
    margin: { t: 30, b: 50, l: 60, r: 20 },
    //legend: { orientation: 'h' }, // , yanchor: 'bottom', y: -0.4 },
    font: {
      family: UI_FONT,
      color: '#444444',
    },
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
