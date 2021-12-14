<template lang="pug">
VuePlotly.myplot(
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
  :class="className"
)
  //- @click="handlePlotlyClick"

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import { FileSystemConfig, UI_FONT } from '@/Globals'
import DashboardDataManager from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'

import globalStore from '@/store'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop() fileSystemConfig!: FileSystemConfig
  @Prop() subfolder!: string
  @Prop() config!: any
  @Prop() files!: string[]
  @Prop() datamanager!: DashboardDataManager
  @Prop() cardId!: string

  private globalState = globalStore.state

  private id = 'bar-' + Math.random()
  private plotID = this.getRandomInt(100000)

  private className = ''

  // dataSet is either x,y or allRows[]
  private dataSet: { x?: any[]; y?: any[]; allRows?: any[] } = {}

  private async mounted() {
    this.updateLayout()
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  }

  private changeDimensions(dimensions: { width: number; height: number }) {
    this.layout = Object.assign({}, this.layout, dimensions)
  }

  private beforeDestroy() {
    try {
      this.datamanager.removeFilterListener(this.config, this.handleFilterChanged)
    } catch (e) {}
  }

  @Watch('globalState.isDarkMode')
  updateTheme() {
    const colors = {
      paper_bgcolor: this.globalState.isDarkMode ? '#282c34' : '#fff',
      plot_bgcolor: this.globalState.isDarkMode ? '#282c34' : '#fff',
      font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
    }
    this.layout = Object.assign({}, this.layout, colors)
  }

  private updateLayout() {
    this.layout.xaxis.title = this.config.xAxisTitle || this.config.xAxisName || ''
    this.layout.yaxis.title = this.config.yAxisTitle || this.config.yAxisName || ''
  }

  private async handlePlotlyClick(click: any) {
    try {
      const { x, y, data } = click.points[0]

      const filter = this.config.groupBy
      const value = x

      this.datamanager.setFilter(this.config.dataset, filter, value)
    } catch (e) {
      console.error(e)
    }
  }

  private async handleFilterChanged() {
    try {
      const { filteredRows } = await this.datamanager.getFilteredDataset(this.config)

      // is filter UN-selected?
      if (!filteredRows) {
        this.data = [this.data[0]]
        this.data[0].opacity = 1.0
        return
      }

      const fullDataCopy = Object.assign({}, this.data[0])

      fullDataCopy.x = filteredRows.x
      fullDataCopy.y = filteredRows.y
      fullDataCopy.opacity = 1.0
      fullDataCopy.name = 'Filtered'
      //@ts-ignore - let plotly manage bar colors EXCEPT the filter
      fullDataCopy.marker = { color: '#ffaf00' } // 3c6' }

      this.data = [this.data[0], fullDataCopy]
      this.data[0].opacity = 0.3
      this.data[0].name = 'All'
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.dataSet = {}
    }
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

  private getRandomInt(max: number) {
    return Math.floor(Math.random() * max).toString()
  }

  private remFactor = 0
  private rem2px(rem: number) {
    // only calculate the factor one time
    if (!this.remFactor) {
      var el = document.createElement('div')
      document.body.appendChild(el)
      el.style.width = '1000rem'
      var factor = el.clientWidth / 1000
      document.body.removeChild(el)
    }
    return rem * this.remFactor
  }

  private updateChart() {
    if (this.config.groupBy) this.updateChartWithGroupBy()
    else this.updateChartSimple()
  }

  private updateChartWithGroupBy() {
    this.className = this.plotID // stacked bug-fix hack

    // TODO: re-implement grouping

    // const { x, y } = this.dataRows

    // this.data = [
    //   {
    //     x,
    //     y,
    //     name: this.config.groupBy,
    //     type: 'bar',
    //     textinfo: 'label+percent',
    //     textposition: 'inside',
    //     automargin: true,
    //     opacity: 1.0,
    //   },
    // ]
  }

  private updateChartSimple() {
    const x = []

    var useOwnNames = false

    const allRows = this.dataSet.allRows || []

    console.log({ allRows })
    // old configs called it "usedCol" --> now "columns"
    let columns = this.config.columns || this.config.usedCol

    // Or maybe user didn't specify: then use all the columns!
    if (!columns && allRows.length)
      columns = Object.keys(allRows[0])
        .filter((col) => col !== this.config.x)
        .sort((a: any, b: any) => (allRows[0][a] > allRows[0][b] ? -1 : 1))

    // old legendname field
    if (this.config.legendName) this.config.legendTitles = this.config.legendName

    if (this.config.legendTitles !== undefined) {
      if (this.config.legendTitles.length === columns.length) {
        useOwnNames = true
      }
    }

    if (this.config.stacked) this.layout.barmode = 'stack'
    if (this.config.stacked) this.className = this.plotID

    for (var i = 0; i < allRows.length; i++) {
      if (i == 0 && this.config.skipFirstRow) {
      } else {
        x.push(allRows[i][this.config.x])
      }
    }

    for (let i = 0; i < columns.length; i++) {
      const name = columns[i]
      let legendName = ''
      if (columns[i] !== 'undefined') {
        if (useOwnNames) {
          legendName = this.config.legendTitles[i]
        } else {
          legendName = name
        }
        let value = []
        for (var j = 0; j < allRows.length; j++) {
          if (j == 0 && this.config.skipFirstRow) {
          } else {
            value.push(allRows[j][name])
          }
        }

        // are durations in 00:00:00 format?
        if (this.config.convertToSeconds) {
          value = value.map((v: string) => {
            try {
              const pieces = v.split(':')
              // console.log(pieces)
              const seconds = pieces.reduce(
                (prev: any, curr: any) => parseInt(curr, 10) + prev * 60,
                0
              )
              return seconds
            } catch (e) {
              return 0
            }
          })
        }

        this.data.push({
          x: x,
          y: value,
          name: legendName,
          type: 'bar',
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: true,
          opacity: 1.0,
        })
      }
    }
    console.log({ data: this.data })
  }

  private layout: any = {
    height: 300,
    margin: { t: 30, b: 50, l: 60, r: 20 },
    //legend: { orientation: 'h' }, // , yanchor: 'bottom', y: -0.4 },
    font: {
      color: '#444444',
      family: UI_FONT,
    },
    barmode: 'overlay',
    bargap: 0.08,
    xaxis: {
      autorange: true,
      title: '',
    },
    yaxis: {
      autorange: true,
      title: '',
    },
    legend: {
      // x: 0.5,
      // xanchor: 'right',
      // y: 0,
      orientation: 'h',
    },
  }

  private data = [] as any[]

  private options = {
    responsive: true,
    displaylogo: false,
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
