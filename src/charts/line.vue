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
import DashboardDataManager from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'

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
  private id = 'line-' + Math.random()

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
    const x = []

    var useOwnNames = false

    // old legendname field
    if (this.config.legendName) this.config.legendTitles = this.config.legendName

    if (this.config.legendName !== undefined) {
      if (this.config.legendName.length == this.config.usedCol.length) {
        useOwnNames = true
      }
    }

    const allRows = this.dataSet.allRows || []

    for (var i = 0; i < allRows.length; i++) {
      if (i == 0 && this.config.skipFirstRow) {
      } else {
        x.push(allRows[i][this.config.x])
      }
    }

    // old configs called it "usedCol" --> now "columns"
    const columns = this.config.columns || this.config.usedCol

    for (let i = 0; i < columns.length; i++) {
      const name = columns[i]
      let legendName = ''
      if (columns[i] !== 'undefined') {
        if (useOwnNames) {
          legendName = this.config.legendTitles[i]
        } else {
          legendName = name
        }
        const value = []
        for (var j = 0; j < allRows.length; j++) {
          if (j == 0 && this.config.skipFirstRow) {
          } else {
            value.push(allRows[j][name])
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

  private data: any = []

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
