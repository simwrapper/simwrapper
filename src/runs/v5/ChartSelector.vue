<template lang="pug">
#main-section
  .pieces
    .sliders
      h5 Select Scenario
      .button-choices.buttons.has-addons
        button.button.is-small(
          :class="{'is-link': !isBase, 'is-selected': !isBase}"
          :key="'do-something'" @click='setBase(false)') Alternatives
        button.button.is-small(
          :class="{'is-link': isBase, 'is-selected': isBase}"
          :key="'base'" @click='setBase(true)') What would have happened w/o restrictions

      .selection-widgets(:class="{'totally-disabled': isBase}")
        .g1
          h5.title Percentage of out-of-home activities still occuring after day 35
          p.subhead By type (%)

          .myslider(v-for="measure in Object.keys(state.measures).slice(4)" :key="measure")
            my-slider(:measure="measure" :state="state" @changed="sliderChanged")

        .g1
          h5.title Reopening of educational facilities at day 63
          p.subhead Students Returning (%):

          .myslider(v-for="measure in Object.keys(state.measures).slice(0,4)" :key="measure")
            my-slider(:measure="measure" :state="state" @changed="sliderChanged")

      h5.cumulative Cumulative Infected
      p.infected {{ prettyInfected }}

    .linear-plot
      h5 Simulated Population Health Outcomes Over Time
      p Linear scale
      vue-plotly.plotsize(:data="data" :layout="layout" :options="options")

    .log-plot
      h5 Simulated Population Health Outcomes Over Time
      p Log scale
      vue-plotly.plotsize(:data="data" :layout="loglayout" :options="options")

</template>

<script lang="ts">
// ###########################################################################
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import Papa from 'papaparse'
import VuePlotly from '@statnett/vue-plotly'
import ZipLoader from 'zip-loader'

import MySlider from './SelectWidget.vue'

@Component({
  components: {
    MySlider,
    VuePlotly,
  },
})
export default class SectionViewer extends Vue {
  @Prop() private state!: any

  private currentRun: any = {}

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
      autorange: true,
    },
    xaxis: {},
  }

  private loglayout = {
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
      type: 'log',
      autorange: true,
    },
  }

  private options = {
    displayModeBar: false,
    responsive: true,
  }

  private setBase(value: boolean) {
    this.isBase = value
    this.showPlotForCurrentSituation()
    // this.runChanged()
  }

  private currentSituation: any = {}
  private loadedSeriesData: any = {}
  private zipLoader: any

  private labels: any = {
    nSusceptible: 'Susceptible',
    nInfectedButNotContagious: 'Infected, not contagious',
    nContagious: 'Contagious',
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

  private get prettyInfected() {
    if (!this.state.cumulativeInfected) return ''

    const rounded = 100 * Math.round(this.state.cumulativeInfected * 0.01)
    return Number(rounded).toLocaleString()
  }

  private async loadZipData() {
    this.zipLoader = new ZipLoader(this.state.publicPath + 'v5-data.zip')

    await this.zipLoader.load()

    console.log('zip loaded!')
    this.runChanged()
  }

  private async runChanged() {
    if (this.loadedSeriesData[this.currentRun.RunId]) {
      this.data = this.loadedSeriesData[this.currentRun.RunId]
      this.updateTotalInfected()
      return
    }

    const csv: any[] = await this.loadCSV(this.currentRun)
    const timeSerieses = this.generateSeriesFromCSVData(csv)

    // cache the result
    this.loadedSeriesData[this.currentRun.RunId] = timeSerieses

    this.data = timeSerieses
    this.updateTotalInfected()
  }

  private updateTotalInfected() {
    const infectedCumulative = this.data.filter(a => a.name === 'Infected Cumulative')[0]
    this.state.cumulativeInfected = infectedCumulative.y[infectedCumulative.y.length - 1]
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

    console.log(lookupKey)
    this.currentRun = this.state.runLookup[lookupKey]
    if (!this.currentRun) return

    this.runChanged()
  }

  private unpack(rows: any[], key: any) {
    let v = rows.map(function(row) {
      if (key === 'day') return row[key]
      return row[key] // * 4
    })

    v = v.slice(0, 150)

    // maybe the sim ended early - go out to 150 anyway
    if (v.length < 150) {
      v.push(key === 'day' ? 150 : v[v.length - 1])
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

  private generateSeriesFromCSVData(data: any[]) {
    const serieses = []

    const x: number[] = this.unpack(data, 'day')

    for (const column of Object.keys(this.labels)) {
      const name = this.labels[column]

      if (name === 'In Quarantine') continue

      const y: number[] = this.unpack(data, column)
      serieses.push({ x, y, name })
    }

    // Add Berlin "Reported Cases"
    serieses.push(this.state.berlinCases)

    return serieses
  }
}

// ###########################################################################
</script>

<style scoped>
#main-section {
  background-color: white;
  display: flex;
  flex-direction: row;
}

h5 {
  font-weight: bold;
  font-size: 18px;
}

.pieces {
  padding: 2rem 0rem;
  display: grid;
  width: 100%;
  grid-gap: 1rem;
  grid-template-columns: 17rem 1fr;
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
  grid-row: 1 / 3;
  margin-right: 1rem;
  display: flex;
  flex-direction: column;
}

.linear-plot {
  text-align: center;
  height: 30rem;
  grid-column: 2 / 3;
  grid-row: 2 / 3;
  display: flex;
  flex-direction: column;
}

.log-plot {
  margin-top: 2rem;
  text-align: center;
  grid-column: 2 / 3;
  grid-row: 1 / 2;
  display: flex;
  flex-direction: column;
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
  margin-top: -0.5rem;
  color: rgb(151, 71, 34);
}

.button-choices button {
  margin-right: 0.5rem;
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
  border: 1px solid #ccf;
  border-radius: 4px;
}

.cumulative {
  margin-top: 2rem;
}

@media only screen and (max-width: 640px) {
  #main-section {
    flex-direction: column;
    padding: 0 0;
    margin: 0 0rem;
  }

  .pieces {
    padding: 1rem 1rem;
    display: flex;
    flex-direction: column;
  }

  .linear-plot {
    margin-top: 2rem;
  }
  .sliders {
    width: 15rem;
  }
}
</style>
