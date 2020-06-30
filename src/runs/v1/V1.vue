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
import SectionViewer from './ChartSelector.vue'

@Component({
  components: {
    SectionViewer,
  },
})
export default class App extends Vue {
  private state: any = {
    measures: {},
    runLookup: {},
    publicPath: '/',
  }

  private readme = require('@/assets/v1-notes.md')

  public async mounted() {
    const parsed = await this.loadIndexData()
    const matrix = await this.generateScenarioMatrix(parsed)
  }

  private async loadIndexData() {
    console.log('fetching data')
    const response = await fetch('/v1-info.txt')
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
        if (run[measure]) measures[measure].add(run[measure])
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

<style scoped lang="scss">
#app {
  color: #222;
  display: flex;
  flex-direction: column;
  margin: 0rem 0rem;
  padding: 0px 0px;
  font-family: Roboto, Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

.nav-bar {
  position: fixed;
  width: 100%;
  top: 0px;
  background-color: white;
  box-shadow: 0px 5px 10px #44444440;
  padding: 0rem 0rem 0rem 1rem;
  z-index: 5;
}

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
  padding: 0rem 3rem;
  margin: 0rem 0rem;
  width: 100%;
  display: flex;
  flex-direction: column;
}

.footer {
  text-align: center;
  padding: 2rem 0.5rem;
  background-color: #627785;
}

.footer p {
  color: white;
}

.footer a {
  color: #334;
}

.footer img {
  margin: 1rem auto;
  padding: 0 1rem;
}

@media only screen and (max-width: 640px) {
  .content {
    padding: 0rem 1rem;
    margin-top: 2rem;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto auto;
    row-gap: 1rem;
  }

  .address-header {
    padding-left: 2rem;
  }
}
</style>
