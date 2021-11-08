<template lang="pug">
vue-plotly(:data="data" :layout="layout" :options="options" :config="{responsive: true}" :class="className")

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
    barmode: '',
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
