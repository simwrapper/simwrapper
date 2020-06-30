<template lang="pug">
#charts
  .preamble
    h3.select-scenario Select Scenario:

    .variation
      b Variation
      .variation-choices.buttons.has-addons
        button.button.is-small(
          :class="{'is-link': plusminus === '-5', 'is-selected': plusminus === '-5'}"
          @click="setPlusMinus('-5')") -5
        button.button.is-small(
          :class="{'is-link': plusminus === '5', 'is-selected': plusminus === '5'}"
          @click="setPlusMinus('5')") +5

  #main-section
    .pieces
      .sliders
        .button-choices.buttons.has-addons
          button.button.is-small(
            :class="{'is-link': !isBase, 'is-selected': !isBase}"
            :key="'do-something'" @click='setBase(false)') Alternatives
          button.button.is-small(
            :class="{'is-link': isBase, 'is-selected': isBase}"
            :key="'base'" @click='setBase(true)') What would have happened w/o restrictions

        .selection-widgets(:class="{'totally-disabled': isBase}")
          .g1
            h5.title Percentage of out-of-home activities still occuring after March 23
            p.subhead By type (%)

            .myslider(v-for="measure in Object.keys(state.measures).slice(4)" :key="measure")
              my-slider(:measure="measure" :state="state" @changed="sliderChanged")

          .g1
            h5.title Reopening of educational facilities on April 20
            p.subhead Students Returning (%):

            .myslider(v-for="measure in Object.keys(state.measures).slice(1,4)" :key="measure")
              my-slider(:measure="measure" :state="state" @changed="sliderChanged")

        h5.cumulative Cumulative Infected
        p.infected {{ prettyInfected }}

      .log-plot
        h5 {{ cityCap }} Simulated Population Health Outcomes Over Time
        p Log scale
        vue-plotly.plotsize(:data="data" :layout="loglayout" :options="options")

      .linear-plot
        h5 {{ cityCap }} Simulated Population Health Outcomes Over Time
        p Linear scale
        vue-plotly.plotsize(:data="data" :layout="layout" :options="options")

</template>

<script lang="ts">
// ###########################################################################
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import Papa from 'papaparse'
import VuePlotly from '@statnett/vue-plotly'
import ZipLoader from 'zip-loader'
import moment from 'moment'

import MySlider from './SelectWidget.vue'

@Component({
  components: {
    MySlider,
    VuePlotly,
  },
})
export default class SectionViewer extends Vue {
  @Prop() private state!: any

  @Prop({ required: true }) private city!: string

  private MAX_DAYS = 200
  private plusminus = '-5'

  @Watch('city') private switchCity() {
    this.loadedSeriesData = {}
    this.loadZipData()
  }

  @Watch('plusminus') private switchPlusMinus() {
    console.log('now we are', this.plusminus)
    this.showPlotForCurrentSituation()
  }

  private isBase = false

  private data: any[] = []

  private layout = {
    autosize: true,
    legend: {
      orientation: 'h',
    },
    font: {
      family: 'Roboto,Arial,Helvetica,sans-serif',
      size: 12,
      color: '#000',
    },
    margin: { l: 50, t: 10, r: 10, b: 0 },
    yaxis: {
      title: 'Population',
      autorange: true,
    },
    xaxis: {
      range: ['2020-02-16', '2020-08-31'],
      type: 'date',
    },
    plot_bgcolor: '#f8f8f8',
    paper_bgcolor: '#f8f8f8',
  }

  private loglayout = {
    autosize: true,
    showlegend: true,
    legend: {
      orientation: 'h',
    },
    font: {
      family: 'Roboto,Arial,Helvetica,sans-serif',
      size: 12,
      color: '#000',
    },
    margin: { t: 5, r: 10, b: 0, l: 60 },
    xaxis: {
      range: ['2020-02-16', '2020-08-31'],
      type: 'date',
    },
    yaxis: {
      type: 'log',
      autorange: true,
      title: 'Population (log scale)',
    },
    plot_bgcolor: '#f8f8f8',
    paper_bgcolor: '#f8f8f8',
  }

  private options = {
    // displayModeBar: true,
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
      filename: 'custom_image',
      width: 800,
      height: 600,
      scale: 1.0, // Multiply title/legend/axis/canvas sizes by this factor
    },
  }

  private setBase(value: boolean) {
    this.isBase = value
    this.showPlotForCurrentSituation()
  }

  private setPlusMinus(value: string) {
    this.plusminus = value
  }

  private get cityCap() {
    return this.city.slice(0, 1).toUpperCase() + this.city.slice(1)
  }

  private currentSituation: any = {}
  private loadedSeriesData: any = {}
  private zipLoader: any

  private labels: any = {
    nSusceptible: 'Susceptible',
    nInfectedButNotContagious: 'Infected, not contagious',
    nContagious: 'Contagious',
    nShowingSymptoms: 'Showing Symptoms',
    nSeriouslySick: 'Seriously Sick',
    nCritical: 'Critical',
    nTotalInfected: 'Total Infected',
    nInfectedCumulative: 'Infected Cumulative',
    nRecovered: 'Recovered',
    nInQuarantine: 'In Quarantine',
  }

  private mounted() {
    this.loadZipData()
  }

  private zipCache: any = {}

  private get prettyInfected() {
    if (!this.state.cumulativeInfected) return ''

    const rounded = 100 * Math.round(this.state.cumulativeInfected * 0.01)
    return Number(rounded).toLocaleString()
  }

  private async loadZipData() {
    // check cache first!
    if (this.zipCache[this.city]) {
      console.log('using cached zip for!', this.city)
      this.zipLoader = this.zipCache[this.city]
    } else {
      // load the zip from file
      const filepath = this.state.publicPath + 'v6-data-' + this.city + '.zip'
      this.zipLoader = new ZipLoader(filepath)
      await this.zipLoader.load()
    }

    console.log('zip loaded!')
    this.zipCache[this.city] = this.zipLoader
    this.runChanged()
  }

  private fillcolors: any = {
    Susceptible: '#0000ff',
    'Seriously Sick': '#cc2211',
    'Showing Symptoms': '#00ffff',
    'Infected Cumulative': '#f791cf',
    'Infected, not contagious': '#ee8800',
    Critical: '#882299',
    Recovered: '#eedd44',
    Contagious: '#00aa00',
    'Total Infected': '#a65628',
  }

  private testErrors() {
    const blow: any = [
      {
        x: [1, 2, 3],
        y: [1, 1.1, 1.2],
        name: 'low',
      },
    ]

    const z = blow[0].x.length

    console.log({ z })

    const high = [
      {
        x: [1, 2, 3, 4],
        y: [3, 4, 5, 6],
        name: 'high',
      },
    ]

    blow[0].x.push(55)
    console.log({ z })

    const answer = this.generateErrorBars(blow, high)
    console.log({ answer })
  }

  private generateErrorBars(low: any[], high: any[]): any[] {
    console.log({ low, high })

    for (let metric = 0; metric < low.length; metric++) {
      const lowLen = low[metric].x.length
      const highLen = high[metric].x.length

      console.log({ lowLen, highLen })

      let newX: any[] = []
      newX = newX.concat(low[metric]['x'])
      // if (highLen > lowLen) newX.push(high[metric]['x'][highLen - 1])
      // if (highLen < lowLen) newX.push(low[metric]['x'][lowLen - 1])

      newX = newX.concat(high[metric]['x'].slice().reverse()) // slice copies, then reverse reverses in-place.

      let newY: any[] = []
      newY = newY.concat(low[metric]['y'])
      // if (highLen > lowLen) newY.push(low[metric]['y'][lowLen - 1])
      // if (highLen < lowLen) newY.push(high[metric]['y'][highLen - 1])

      newY = newY.concat(high[metric]['y'].slice().reverse()) // slice copies, then reverse reverses in-place.

      low[metric].x = newX
      low[metric].y = newY

      const color = this.fillcolors[low[metric]['name']]
      // scatterplot fakes a look like error bands
      low[metric].fillcolor = color + '20'
      low[metric].showlegend = true
      low[metric].line = { color: color }
      low[metric].fill = 'tozerox'
      low[metric].type = 'scatter'
    }

    console.log({ errorBar: low })
    return low
  }

  private async runChanged() {
    // maybe we already did the calcs
    if (this.loadedSeriesData[this.currentRun.RunId]) {
      this.data = this.loadedSeriesData[this.currentRun.RunId]
      this.updateTotalInfected()
      return
    }

    // load both datasets
    const csvLow: any[] = await this.loadCSV(this.currentRun)
    const timeSeriesesLow = this.generateSeriesFromCSVData(csvLow)

    // const errorBars = this.generateErrorBars(timeSeriesesLow, timeSeriesesHigh)

    // cache the result
    this.loadedSeriesData[this.currentRun.RunId] = timeSeriesesLow

    this.data = timeSeriesesLow
    this.updateTotalInfected()
  }

  private updateTotalInfected() {
    const infectedCumulative = this.data.filter(a => a.name === 'Infected Cumulative')[0]
    this.state.cumulativeInfected = Math.max(...infectedCumulative.y)
  }

  private sliderChanged(measure: any, value: any) {
    console.log(measure, value)
    this.currentSituation[measure] = value
    this.showPlotForCurrentSituation()
  }

  private showPlotForCurrentSituation() {
    if (this.isBase) {
      this.currentRun = { RunId: 'sz0' }
      this.runChanged()
      return
    }

    let lookupKey = ''
    for (const measure of Object.keys(this.state.measures))
      lookupKey += this.currentSituation[measure] + '-'

    const suffix = this.plusminus === '5' ? '5' : '-5'
    const lookup = lookupKey.replace('undefined', suffix)
    // const lookupLow = lookupKey.replace('undefined', '-5')
    // const lookupHigh = lookupKey.replace('undefined', '5')

    console.log(lookup) // , lookupLow, lookupHigh)

    this.currentRun = this.state.runLookup[lookup]
    // this.currentRunHigh = this.state.runLookup[lookupHigh]

    if (!this.currentRun) return

    this.runChanged()
  }

  private currentRun: any = {}
  // private currentRunHigh: any = {}

  private unpack(rows: any[], key: any) {
    let v = rows.map(function(row) {
      if (key === 'day') return row[key]
      return row[key]
    })

    v = v.slice(0, this.MAX_DAYS)

    // maybe the sim ended early - go out to 150 anyway
    if (v.length < this.MAX_DAYS) {
      v.push(key === 'day' ? this.MAX_DAYS : v[v.length - 1])
    }
    return v
  }

  private async loadCSV(currentRun: any) {
    if (!currentRun.RunId) return []

    const filename = currentRun.RunId + '.infections.txt'
    console.log('Extracting', filename)

    let text = this.zipLoader.extractAsText(filename)
    const z = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true })

    return z.data
  }

  private calculateDatefromSimulationDay(day: number) {
    const startDay = this.plusminus === '-5' ? '2020-02-22' : '2020-02-12'
    const date = moment(startDay)
      .add(day, 'days')
      .format('YYYY-MM-DD')
    return date
  }

  private generateSeriesFromCSVData(data: any[]) {
    const serieses = []

    const days: number[] = this.unpack(data, 'day')
    console.log({ days })
    const x = days.map(d => this.calculateDatefromSimulationDay(d))

    console.log({ x })

    for (const column of Object.keys(this.labels)) {
      const name = this.labels[column]

      if (name === 'In Quarantine') continue

      const y: number[] = this.unpack(data, column)
      serieses.push({ x, y, name })
    }

    // Add Berlin "Reported Cases"
    if (this.city === 'berlin') serieses.push(this.state.berlinCases)

    return serieses
  }
}

// ###########################################################################
</script>

<style scoped>
#main-section {
  display: flex;
  flex-direction: row;
}

h5 {
  font-weight: bold;
  font-size: 18px;
}

.pieces {
  padding: 0rem 0rem;
  display: grid;
  width: 100%;
  grid-gap: 0rem;
  grid-template-columns: auto 1fr;
  grid-template-rows: auto;
}

.pieces h3 {
  color: #667883;
  border-bottom: 1px solid #ddd;
  padding-bottom: 0.5rem;
  margin: 1rem 1rem 2rem 0rem;
  text-transform: uppercase;
  letter-spacing: 2px;
}

.sliders {
  grid-column: 1 / 2;
  grid-row: 1 / 4;
  margin-right: 1rem;
  width: 17rem;
  display: flex;
  flex-direction: column;
}

.log-plot {
  background-color: #f8f8f8;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  margin: 0 0 1rem 1rem;
  text-align: center;
  grid-column: 2 / 3;
  grid-row: 2 / 3;
  display: flex;
  flex-direction: column;
  border: 1px solid #ccc;
}

.linear-plot {
  background-color: #f8f8f8;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  margin: 1rem 0 1rem 1rem;
  text-align: center;
  grid-column: 2 / 3;
  grid-row: 3 / 4;
  display: flex;
  flex-direction: column;
  border: 1px solid #ccc;
}

h5 {
  margin-top: 0.5rem;
}

.plotsize {
  height: 30rem;
}

p.subhead {
  margin-top: -0.25rem;
}

.myslider {
  width: 100%;
  margin-left: 0.5rem;
}

.plot {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  padding: 1rem 0rem;
}

.infected {
  padding-left: 0rem;
  font-weight: bold;
  font-size: 2rem;
  margin-top: -1rem;
  margin-left: 1rem;
  color: rgb(151, 71, 34);
}

.button-choices {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-bottom: 0.25rem;
}

.button-choices button {
  width: 100%;
}

.title {
  line-height: 1.4rem;
  margin: 1rem 0 0.5rem 0;
}

.totally-disabled {
  pointer-events: none;
  opacity: 0.4;
}

.g1 {
  padding: 0rem 1rem 1rem 0.5rem;
  margin-bottom: 2rem;
  border: 1px solid #aaa;
  border-radius: 4px;
}

.cumulative {
  margin-top: 1rem;
  margin-left: 1rem;
}

.preamble {
  display: flex;
  flex-direction: row;
  margin-top: 2rem;
}

.variation {
  display: flex;
  flex-direction: column;
  margin-left: auto;
  margin-bottom: 0.3rem;
  text-align: center;
}

.variation-choices {
  padding: 0 0;
}

@media only screen and (max-width: 640px) {
  #main-section {
    flex-direction: column;
    padding: 0 0;
    margin: 0 0rem;
  }

  p.infected {
    margin-bottom: 1rem;
  }

  .pieces {
    padding: 1rem 0rem;
    display: flex;
    flex-direction: column;
  }

  .log-plot {
    margin-left: 0;
  }

  .linear-plot {
    margin-top: 2rem;
    margin-left: 0;
  }
  .sliders {
    width: 15rem;
  }
}
</style>
