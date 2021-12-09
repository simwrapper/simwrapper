<template lang="pug">
VuePlotly.myplot(v-if="data[0].values.length"
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
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

  private id = 'pie-' + Math.random()

  // dataSet is either x,y or allRows[]
  private dataSet: { x?: any[]; y?: any[]; allRows?: any[] } = {}

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
      const allRows = await this.datamanager.getDataset(this.config)
      // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)
      return allRows
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
    const allRows = this.dataSet.allRows || {}
    this.data[0].labels = Object.keys(allRows)
    this.data[0].values = Object.values(allRows)
  }

  private layout: any = {
    height: 300,
    margin: { t: 30, b: 5, l: 0, r: 0 },
    legend: { orientation: 'h' }, // , yanchor: 'bottom', y: -0.4 },
    font: {
      family: UI_FONT,
      color: '#444444',
    },
  }

  // format hover ?
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
