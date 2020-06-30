<template lang="pug">
#charts
  .preamble
    h3.select-scenario Select Scenario:

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
          .heinsberg(v-if="city==='heinsberg'")
            .g1
              h6.title February 26:
                br
                | Activities limited
              p.subhead Percent still occurring (%)
              .myslider(v-if="Object.keys(state.measures).length"
                v-for="measure in ['remainingFractionWork', 'remainingFractionLeisure1', 'remainingFractionShoppingBusinessErrands']"
                :key="'h' + measure")
                my-slider(:measure="measure" :state="state" @changed="sliderChanged")
            .g1
              h6.title April 20:
                br
                | Reopening of educational facilities
              p.subhead Students returning (%):
              .myslider(v-if="Object.keys(state.measures).length"
                v-for="measure in ['remainingFractionKiga', 'remainingFractionPrima', 'remainingFractionSecon']" :key="'h' + measure")
                my-slider(:measure="measure" :state="state" @changed="sliderChanged")

          .berlin-munich(v-else)
            .g1
              h6.title March 14:
                br
                | Leisure activities limited
              p.subhead Percent still occurring (%)
              .myslider(v-if="Object.keys(state.measures).length" v-for="measure in ['remainingFractionLeisure1']" :key="measure")
                my-slider(:measure="measure" :state="state" @changed="sliderChanged")

            .g1
              h6.title March 23:
                br
                | Out-of-home activities limited
              p.subhead By type and percent (%)
              .myslider(v-if="Object.keys(state.measures).length"
                v-for="measure in ['remainingFractionWork', 'remainingFractionLeisure2', 'remainingFractionShoppingBusinessErrands']"
                :key="measure")
                my-slider(:measure="measure" :state="state" @changed="sliderChanged")

            .g1
              h6.title April 20:
                br
                | Reopening of educational facilities
              p.subhead Students returning (%):
              .myslider(v-if="Object.keys(state.measures).length"
                v-for="measure in ['remainingFractionKiga', 'remainingFractionPrima', 'remainingFractionSecon']" :key="measure")
                my-slider(:measure="measure" :state="state" @changed="sliderChanged")

        h5.cumulative Cumulative Infected by September 2020
        p.infected {{ prettyInfected }}

      .all-plots

        .plot-options
          .scale-options
            b Scale
            .variation-choices.buttons.has-addons
              button.button.is-small(
                :class="{'is-link': !logScale, 'is-selected': !logScale}"
                @click="logScale = !logScale") Linear
              button.button.is-small(
                :class="{'is-link': logScale, 'is-selected': logScale}"
                @click="logScale = !logScale") Log

          .variation
            b Shift Start Date
            .variation-choices.buttons.has-addons
              button.button.is-small(v-if="city !== 'munich'"
                :class="{'is-link': plusminus === '6', 'is-selected': plusminus === '6'}"
                @click="setPlusMinus('6')") -6
              button.button.is-small(v-if="city !== 'munich'"
                :class="{'is-link': plusminus === '3', 'is-selected': plusminus === '3'}"
                @click="setPlusMinus('3')") -3
              button.button.is-small(
                :class="{'is-link': plusminus === '0', 'is-selected': plusminus === '0'}"
                @click="setPlusMinus('0')") +0
              button.button.is-small(
                :class="{'is-link': plusminus === '-3', 'is-selected': plusminus === '-3'}"
                @click="setPlusMinus('-3')") +3
              button.button.is-small(
                :class="{'is-link': plusminus === '-6', 'is-selected': plusminus === '-6'}"
                @click="setPlusMinus('-6')") +6

        .linear-plot
          h5 {{ cityCap }} Simulated Health Outcomes Over Time
          p {{ this.logScale ? 'Log scale' : 'Linear scale' }}
          vue-plotly.plotsize(:data="data" :layout="layout" :options="options")

        .linear-plot(v-if="city ==='berlin'")
          h5 {{ cityCap }} Hospitalization Rate Comparison
          p {{ this.logScale ? 'Log scale' : 'Linear scale' }}
          hospitalization-plot.plotsize.compact(:data="data" :logScale="logScale" :city="city")

        .linear-plot
          h5 {{ cityCap }} Estimated R-Values
          p Based on four-day new infections
          r-value-plot.plotsize.compact(:data="data" :logScale="false")

</template>

<script lang="ts">
// ###########################################################################
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import Papa from 'papaparse'
import VuePlotly from '@statnett/vue-plotly'
import ZipLoader from 'zip-loader'
import moment from 'moment'

import MySlider from './SelectWidget.vue'
import HospitalizationPlot from '@/components/HospitalizationPlot.vue'
import RValuePlot from '@/components/RValuePlot.vue'

@Component({
  components: {
    HospitalizationPlot,
    MySlider,
    RValuePlot,
    VuePlotly,
  },
})
export default class SectionViewer extends Vue {
  @Prop({ required: true }) private state!: any

  @Prop({ required: true }) private city!: string

  private dayZero: any = {
    berlin: '2020-02-20',
    munich: '2020-02-20',
    heinsberg: '2020-02-15',
  }

  private MAX_DAYS = 200

  private plusminus = '0'

  private logScale = true

  @Watch('city') private switchCity() {
    // Munich doesn't have +3 / +6
    if (this.city !== 'berlin' && parseInt(this.plusminus) > 0) this.plusminus = '0'

    this.loadedSeriesData = {}
    this.loadZipData()
  }

  @Watch('plusminus') private switchPlusMinus() {
    this.showPlotForCurrentSituation()
  }

  @Watch('logScale') updateScale() {
    this.layout.yaxis.type = this.logScale ? 'log' : 'linear'
  }

  private isBase = false
  private currentRun: any = {}

  private data: any[] = []

  private layout = {
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
      range: ['2020-02-09', '2020-08-31'],
      type: 'date',
    },
    yaxis: {
      type: this.logScale ? 'log' : 'linear',
      autorange: true,
      title: 'Population (' + (this.logScale ? 'log scale)' : 'Linear scale)'),
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
    console.log('loadZipData:', this.city)
    // check cache first!
    if (this.zipCache[this.city]) {
      console.log('using cached zip for!', this.city)
      this.zipLoader = this.zipCache[this.city]
    } else {
      // load the zip from file
      const filepath = this.state.publicPath + 'v7-data-' + this.city + '.zip'
      console.log('---loading', filepath)
      this.zipLoader = new ZipLoader(filepath)
      await this.zipLoader.load()
      console.log('zip loaded!')
    }

    this.zipCache[this.city] = this.zipLoader
    this.runChanged()
    console.log({ measure: this.state.measures })
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

    const suffix = this.plusminus //  === '5' ? '5' : '-5'
    const lookup = lookupKey.replace('undefined', suffix)

    console.log(lookup)

    this.currentRun = this.state.runLookup[lookup]

    if (!this.currentRun) return

    this.runChanged()
  }

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

    const filename = currentRun.RunId + '.infections.csv'
    console.log('Extracting', filename)

    let text = this.zipLoader.extractAsText(filename)
    const z = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true })

    return z.data
  }

  private calculateDatefromSimulationDay(day: number) {
    const shift = parseInt(this.plusminus)

    const date = moment(this.dayZero[this.city])
      .subtract(shift, 'days')
      .add(day, 'days')
      .format('YYYY-MM-DD')
    return date
  }

  private generateSeriesFromCSVData(data: any[]) {
    const serieses = []

    const days: number[] = this.unpack(data, 'day')
    const x = days.map(d => this.calculateDatefromSimulationDay(d))

    for (const column of Object.keys(this.labels)) {
      const name = this.labels[column]

      if (name === 'In Quarantine') continue

      const y: number[] = this.unpack(data, column)
      serieses.push({ x, y, name })
    }

    // Add Berlin "Reported Cases"
    // if (this.city === 'berlin') serieses.push(this.state.berlinCases)
    serieses.push(this.state.berlinCases)

    return serieses
  }
}

// ###########################################################################
</script>

<style scoped lang="scss">
#main-section {
  display: flex;
  flex-direction: row;
}

h5 {
  font-weight: bold;
  font-size: 18px;
}

h6 {
  font-size: 1.1rem;
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

.all-plots {
  margin-left: 1rem;
  grid-column: 2 / 3;
  grid-row: 2 / 3;
  display: flex;
  flex-direction: column;
}

.log-plot {
  background-color: #f8f8f8;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  margin: 0 0 1rem 1rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  border: 1px solid #ccc;
}

.linear-plot {
  background-color: #f8f8f8;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  margin: 0rem 0 2rem 1rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  border: 1px solid #ccc;
}

h5 {
  margin-top: 0.5rem;
}

.plotsize {
  height: 25rem;
}

.plotsize.compact {
  height: 15rem;
}

p.subhead {
  margin-top: -0.25rem;
}

.myslider {
  width: 100%;
}

.plot {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  padding: 1rem 0rem;
}

.plot-options {
  display: flex;
  flex-direction: row;
  margin-left: 1rem;
}

.infected {
  padding-left: 0rem;
  font-weight: bold;
  font-size: 2rem;
  margin-top: 0rem;
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
  padding: 0rem 0.5rem 1rem 0.5rem;
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
  text-align: right;
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
