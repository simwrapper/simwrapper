<template lang="pug">
#app
  .content
    .readme(v-html="readme")

  section-viewer.viewer(:state="state")

</template>

<script lang="ts">
// ###########################################################################
import YAML from 'yaml'
import Papa from 'papaparse'

import { Component, Vue } from 'vue-property-decorator'
import SectionViewer from '@/runs/v5/ChartSelector.vue'

@Component({
  components: {
    SectionViewer,
  },
})
export default class App extends Vue {
  private state: any = {
    measures: {},
    runLookup: {},
    cumulativeInfected: 0,
    berlinCases: [],
    publicPath: '/',
  }

  private readme = require('@/assets/v5-notes.md')
  private berlinCSV = require('@/assets/berlin-cases.csv').default

  public async mounted() {
    await this.loadDataInBackground()
  }

  private async loadDataInBackground() {
    this.state.berlinCases = this.prepareBerlinData()

    const parsed = await this.loadCSVData(this.state.publicPath + 'v5-info.txt')
    const matrix = await this.generateScenarioMatrix(parsed)
  }

  private prepareBerlinData() {
    const data = Papa.parse(this.berlinCSV, { header: true, dynamicTyping: true }).data

    // 14 days of zero cases in Berlin before the RKI data begins
    const zeroDays = 14
    const cases = new Array(zeroDays).fill(0)

    // pull the cases field out of the CSV
    let cumulative = 0
    for (let i = 0; i < data.length; i++) {
      cumulative += data[i].cases
      cases.push(cumulative)
    }

    const series = {
      name: 'Berlin Reported (Cumul.)',
      x: [...Array(cases.length).keys()].slice(1), // range
      y: cases,
      line: {
        dash: 'dot',
        width: 3,
        color: 'rgb(0,200,150)',
      },
    }

    console.log({ berlinSeries: series })
    return series
  }

  private async loadCSVData(filepath: string) {
    console.log('fetching data')
    const response = await fetch(filepath)
    const text = await response.text()
    const parsed: any = Papa.parse(text, { header: true, dynamicTyping: true })
    console.log({ parsed: parsed.data })

    return parsed.data
  }

  private async generateScenarioMatrix(parsed: any[]) {
    console.log('generating lookups')
    const measures: any = {}
    const runLookup: any = {}

    // first get column names for the measures that have been tested
    const ignore = ['Config', 'Output', 'RunId', 'RunScript']

    for (const label of Object.keys(parsed[0])) {
      if (ignore.indexOf(label) > -1) continue
      measures[label] = new Set()
    }

    // get all possible values
    for (const run of parsed) {
      if (!run.RunId) continue

      // note this particular value, for every value
      for (const measure of Object.keys(measures)) {
        if (run[measure] === 0 || run[measure]) measures[measure].add(run[measure])
      }

      // store the run in a lookup using all values as the key
      let lookupKey = ''
      for (const measure of Object.keys(measures)) lookupKey += run[measure] + '-'
      runLookup[lookupKey] = run
    }

    for (const measure of Object.keys(measures)) {
      measures[measure] = Array.from(measures[measure].keys()).sort((a: any, b: any) => a - b)
    }

    console.log({ measures, runLookup })
    this.state.measures = measures
    this.state.runLookup = runLookup
  }
}

// ###########################################################################
</script>

<style scoped>
.address-header {
  margin-top: 4rem;
  background-color: #d3e1ee;
  padding: 3rem 10rem;
}

.address-header h2 {
  font-size: 2.5rem;
  font-weight: bold;
}

.address-header h3 {
  font-size: 1rem;
  font-weight: normal;
  margin-top: -0.5rem;
}

.content {
  padding: 0rem 3rem;
  margin: 2rem 0rem;
  padding-bottom: 1rem;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.viewer {
  padding: 0rem 2rem;
  margin: 0rem 0rem;
  width: 100%;
  display: flex;
  flex-direction: column;
}

h2 {
  padding-top: 1rem;
}

@media only screen and (max-width: 640px) {
  .content {
    padding: 1rem 1rem;
    margin-top: 1rem;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    row-gap: 1rem;
  }

  .address-header {
    padding-left: 2rem;
  }
}
</style>
