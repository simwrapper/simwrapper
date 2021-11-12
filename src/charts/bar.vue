<template lang="pug">
vue-plotly#vue-bar-chart(
  :data="data"
  :layout="layout"
  :options="options"
  :config="{responsive: true}"
  :id="id"
  ref="plotly-element"
  @click="handlePlotlyClick"
)
  //- :class="className"

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { Worker, spawn, Thread } from 'threads'
import VuePlotly from '@statnett/vue-plotly'
import { rollup } from 'd3-array'
import { FileSystemConfig, UI_FONT } from '@/Globals'
import DashboardDataManager from '@/js/DashboardDataManager'

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
  @Prop({ required: true }) datamanager!: DashboardDataManager

  private id = 'bar-' + Math.random()

  private globalState = this.$store.state

  // private thread!: any
  private dataRows: any = {}

  private plotID = this.getRandomInt(100000)

  private async mounted() {
    this.updateTheme()
    await this.loadData()
    this.resizePlot()
    window.addEventListener('resize', this.myEventHandler)

    this.$emit('isLoaded')
  }

  private async beforeDestroy() {
    window.removeEventListener('resize', this.myEventHandler)
  }

  @Watch('globalState.isDarkMode') updateTheme() {
    this.layout.paper_bgcolor = this.globalState.isDarkMode ? '#282c34' : '#fff' // #f8f8ff
    this.layout.plot_bgcolor = this.globalState.isDarkMode ? '#282c34' : '#fff'
    this.layout.font.color = this.globalState.isDarkMode ? '#cccccc' : '#444444'
  }

  private handlePlotlyClick(click: any) {
    try {
      const { x, y, data } = click.points[0]
      const fullData = Object.assign({}, data)

      fullData.x = [x]
      fullData.y = [y]
      this.data.push(fullData)
      this.data[0].opacity = 0.25
    } catch (e) {
      console.error(e)
    }
  }

  private async loadData() {
    if (!this.files.length) return

    try {
      const { fullData, filteredData } = await this.datamanager.getDataset(this.config)

      // console.log({ fullData })

      this.dataRows = fullData
      this.updateChart()
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.dataRows = {}
    }
  }

  private getRandomInt(max: number) {
    return Math.floor(Math.random() * max).toString()
  }

  // The myEventHandler was added because Plottly has a bug with resizing.
  private myEventHandler() {
    this.resizePlot()
  }

  private resizePlot() {
    var plotElement = document.getElementsByClassName('dash-row')
    for (var i = 0; i < plotElement.length; i++) {
      var childElement = plotElement[i].firstChild?.lastChild?.firstChild as Element
      var name = childElement.className
      if (name.includes(this.plotID)) {
        this.layout.width = plotElement[i].clientWidth - this.rem2px(3)
      }
    }
  }

  private rem2px(rem: number) {
    var el = document.createElement('div')
    document.body.appendChild(el)
    el.style.width = '1000rem'
    var factor = el.clientWidth / 1000
    document.body.removeChild(el)
    return rem * factor
  }

  private updateChart() {
    if (this.config.groupBy) this.updateChartWithGroupBy()
    else this.updateChartSimple()
  }

  private updateChartWithGroupBy() {
    this.className = this.plotID // stacked bug-fix hack

    const { x, y } = this.dataRows

    this.data = [
      {
        x,
        y,
        name: this.config.groupBy,
        type: 'bar',
        textinfo: 'label+percent',
        textposition: 'inside',
        automargin: true,
        opacity: 1.0,
      },
    ]

    // var useOwnNames = false

    // for (var i = 0; i < this.dataRows.length; i++) {
    //   if (i == 0 && this.config.skipFirstRow) {
    //   } else {
    //     x.push(this.dataRows[i][this.config.x])
    //   }
    // }

    // for (let i = 0; i < this.config.columns.length; i++) {
    //   const name = this.config.columns[i]
    //   let legendName = ''
    //   if (this.config.columns[i] !== 'undefined') {
    //     if (useOwnNames) {
    //       legendName = this.config.legendTitles[i]
    //     } else {
    //       legendName = name
    //     }
    //     const value = []
    //     for (var j = 0; j < this.dataRows.length; j++) {
    //       if (j == 0 && this.config.skipFirstRow) {
    //       } else {
    //         value.push(this.dataRows[j][name])
    //       }
    //     }
    //     this.data.push({
    //       x: x,
    //       y: value,
    //       name: legendName,
    //       type: 'bar',
    //       textinfo: 'label+percent',
    //       textposition: 'inside',
    //       automargin: true,
    //     })
    //   }
    // }
  }

  private updateChartSimple() {
    const x = []

    var useOwnNames = false

    if (this.config.legendTitles !== undefined) {
      if (this.config.legendTitles.length === this.config.columns.length) {
        useOwnNames = true
      }
    }

    if (this.config.stacked) this.layout.barmode = 'stack'
    if (this.config.stacked) this.className = this.plotID

    for (var i = 0; i < this.dataRows.length; i++) {
      if (i == 0 && this.config.skipFirstRow) {
      } else {
        x.push(this.dataRows[i][this.config.x])
      }
    }

    for (let i = 0; i < this.config.columns.length; i++) {
      const name = this.config.columns[i]
      let legendName = ''
      if (this.config.columns[i] !== 'undefined') {
        if (useOwnNames) {
          legendName = this.config.legendTitles[i]
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
          type: 'bar',
          textinfo: 'label+percent',
          textposition: 'inside',
          automargin: true,
          opacity: 1.0,
        })
      }
    }
  }

  private className = ''

  private layout: any = {
    height: 300,
    width: 0,
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
      name: '',
      type: 'bar',
      textinfo: 'label+percent',
      textposition: 'inside',
      automargin: true,
      opacity: 1.0,
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

@media only screen and (max-width: 640px) {
}
</style>
