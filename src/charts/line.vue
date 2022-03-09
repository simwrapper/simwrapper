<template lang="pug">
VuePlotly.myplot(
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
  private id = 'line-' + Math.random()

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

  private updateChartSimple() {
    let useOwnNames = false

    // old legendname field
    if (this.config.legendName) this.config.legendTitles = this.config.legendName
    if (this.config.legendName !== undefined) {
      if (this.config.legendName.length == this.config.usedCol.length) {
        useOwnNames = true
      }
    }

    const allRows = this.dataSet.allRows || ({} as any)
    const columnNames = Object.keys(allRows)

    if (!columnNames.length) {
      this.data = []
      return
    }

    let x = allRows[this.config.x].values || []
    if (this.config.skipFirstRow) x = x.slice(1)

    // old configs called it "usedCol" --> now "columns"
    let columns = this.config.columns || this.config.usedCol

    // Or maybe user didn't specify: then use all the columns!
    if (!columns && columnNames.length) {
      columns = columnNames.filter(col => col !== this.config.x).sort()
    }

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]
      const legendName = useOwnNames ? this.config.legendTitles[i] : col

      let values = allRows[col].values
      if (this.config.skipFirstRow) values = values.slice(1)

      // are durations in 00:00:00 format?
      if (this.config.convertToSeconds) values = this.convertToSeconds(values)

      this.data.push({
        x: x,
        y: values,
        name: legendName,
        type: 'line',
        textinfo: 'label+percent',
        textposition: 'inside',
        automargin: true,
      })
    }
  }

  private convertToSeconds(values: any[]) {
    values = values.map((v: string) => {
      try {
        const pieces = v.split(':')
        const seconds = pieces.reduce((prev: any, curr: any) => parseInt(curr, 10) + prev * 60, 0)
        return seconds
      } catch (e) {
        return 0
      }
    })
  }

  private layout: any = {
    height: 300,
    margin: { t: 30, b: 50, l: 60, r: 20 },
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
      rangemode: 'tozero',
    },
    legend: {
      // x: 0.5,
      // xanchor: 'right',
      // y: 0,
      orientation: 'h',
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
      format: 'png', // one of png, svg, jpeg, webp
      filename: 'line-chart',
      width: 1200,
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
