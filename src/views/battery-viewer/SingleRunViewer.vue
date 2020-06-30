<template lang="pug">
#charts
  .content
    .readme(v-html="topNotes")

  .preamble
    h3.select-scenario Select Scenario:

  #main-section
    .pieces(v-if="this.city")
      .option-groups
        .button-choices.buttons.has-addons
          button.button.is-small(
            :class="{'is-link': !isBase, 'is-selected': !isBase}"
            :key="'do-something'" @click='setBase(false)') Alternatives
          button.button.is-small(
            :class="{'is-link': isBase, 'is-selected': isBase}"
            :key="'base'" @click='setBase(true)') What would have happened w/o restrictions

        .option-group(:class="{'totally-disabled': isBase}"
                      v-for="group in yaml.optionGroups" :key="group.heading + group.day")
          .g1
            h6.title {{ calendarForSimDay(group.day) }}:
              br
              | {{ group.heading }}

            p.subhead(v-if="group.subheading") {{ group.subheading }}

            .myslider(v-for="m in group.measures" :key="m.measure")
              button-group(:measure="m" :options="measureOptions[m.measure]" @changed="sliderChanged")

        h5.cumulative Cumulative Infected by
          br
          | {{ this.endDate }}
        p.infected {{ prettyInfected }}

      .all-plots

        .linear-plot.activity(v-if="showActivityLevels")
          h5 Activity Levels by Type
          p 0-100% of normal
          .plotarea.compact
            activity-levels-plot.plotsize(:city="city" :battery="runId"
              :currentRun="currentRun" :startDate="startDate" :endDate="endDate" :plusminus="plusminus"
              :zipContent="zipLoader")

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

          .variation(v-if="offset.length")
            b Shift Start Date
            .variation-choices.buttons.has-addons( style="margin-left: auto;")
              button.button.is-small(v-for="offset in offset" :key="offset"
                :class="{'is-link': plusminus === offset, 'is-selected': plusminus === offset}"
                @click="setPlusMinus(offset)") {{ strOffset(offset)}}

        .linear-plot
          h5 {{ cityCap }} Simulated Health Outcomes Over Time
          p {{ this.logScale ? 'Log scale' : 'Linear scale' }}
          .plotarea
            p.plotsize(v-if="!isZipLoaded") Loading data...
            p.plotsize(v-if="isZipLoaded && isDataMissing") Results not found
            vue-plotly.plotsize(v-else
              :data="data" :layout="layout" :options="options")

        .linear-plot(v-if="city === 'berlin' || city === 'munich'")
          h5 {{ cityCap }} Hospitalization Rate Comparison
          p {{ this.logScale ? 'Log scale' : 'Linear scale' }}
          .plotarea.compact
            p.plotsize(v-if="!isZipLoaded") Loading data...
            p.plotsize(v-if="isZipLoaded && isDataMissing") Results not found
            hospitalization-plot.plotsize(v-else
              :data="hospitalData" :logScale="logScale" :city="city"
              :diviData="diviData" :endDate="endDate" )

        .linear-plot
          h5 {{ cityCap }} Infection Rate
          p Daily new infections
          .plotarea.compact
            p.plotsize(v-if="!isZipLoaded") Loading data...
            p.plotsize(v-if="isZipLoaded && isDataMissing") Results not found
            weekly-infections-plot.plotsize(v-else :data="data"  :endDate="endDate"
                                                   :observed="observedCases"
                                                   :logScale="logScale")

        .linear-plot
          h5 {{ cityCap }} Estimated R-Values
          p Based on four-day new infections
          .plotarea.compact
            p.plotsize(v-if="!isZipLoaded") Loading data...
            p.plotsize(v-if="isZipLoaded && isDataMissing") Results not found
            r-value-plot.plotsize(v-else :data="data" :endDate="endDate"  :logScale="false")

  .content(v-if="bottomNotes")
    .bottom
      h3 Further Notes
      .readme(v-html="bottomNotes")

</template>

<script lang="ts">
// ###########################################################################
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import MarkdownIt from 'markdown-it'
import Papa from 'papaparse'
import VuePlotly from '@statnett/vue-plotly'
import ZipLoader from 'zip-loader'
import moment from 'moment'

import ActivityLevelsPlot from '@/components/ActivityLevelsPlot.vue'
import ButtonGroup from './ButtonGroup.vue'
import HospitalizationPlot from '@/components/HospitalizationPlot.vue'
import WeeklyInfectionsPlot from '@/components/WeeklyInfectionsPlot.vue'
import RValuePlot from '@/components/RValuePlot.vue'
import SVNFileSystem from '@/util/SVNFileSystem'
import { RunYaml } from '@/Globals'

interface Measure {
  measure: string
  title: string
}

@Component({
  components: {
    ActivityLevelsPlot,
    HospitalizationPlot,
    ButtonGroup,
    WeeklyInfectionsPlot,
    RValuePlot,
    VuePlotly,
  },
})
export default class VueComponent extends Vue {
  @Prop({ required: true }) private yaml!: RunYaml
  @Prop({ required: true }) private runId!: string

  // convenience from yaml
  private startDate: string = ''
  private city: string = ''
  private offset: number[] = []

  private MAX_DAYS = 500
  private cumulativeInfected = 0

  private isZipLoaded = false
  private isDataMissing = false
  private plusminus = 0

  private logScale = true
  private cityMarkdownNotes: string = ''
  private plotTag = '{{PLOTS}}'

  private showActivityLevels = false
  private zipActivityLevelFileName = 'XX.zip'

  private publicPath = '/'

  private PUBLIC_SVN =
    'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/'

  private BATTERY_URL = this.PUBLIC_SVN + 'battery/'
  private RKI_URL = this.PUBLIC_SVN + 'original-data/Fallzahlen/RKI/'
  private DIVI_URL = this.PUBLIC_SVN + 'original-data/Fallzahlen/DIVI/'

  private isUsingRealDates = false
  private endDate = '2020-08-31'

  private cityCSV: any = {
    berlin: this.RKI_URL + 'berlin-cases.csv',
    munich: this.RKI_URL + 'munich-cases.csv',
    heinsberg: this.RKI_URL + 'heinsberg-cases.csv',
  }

  private cityDIVI: any = {
    berlin: this.DIVI_URL + 'berlin-divi-processed.csv',
    munich: this.DIVI_URL + 'munich-divi-processed.csv',
    // munich:
    // heinsberg:
  }

  @Watch('yaml') private async switchYaml() {
    console.log('GOT NEW YAML:', this.yaml.city)
    console.log({ yaml: this.yaml })

    if (!this.yaml.city) return

    this.isZipLoaded = false
    this.isUsingRealDates = false
    this.$nextTick()
    this.city = this.yaml.city
    this.offset = []

    // set start date
    if (this.yaml.startDate) this.startDate = this.yaml.startDate
    else if (this.yaml.defaultStartDate) this.startDate = this.yaml.defaultStartDate
    else {
      alert('Uh-oh, YAML file has no startDate AND no defaultStartDate!')
      return
    }

    // set end date
    this.endDate = this.yaml.endDate ? this.yaml.endDate : '2020-08-31'
    console.log({ endDate: this.endDate })
    this.layout.xaxis.range = ['2020-02-09', this.endDate]

    // build offsets
    if (!this.yaml.offset && !this.yaml.startDates) {
      alert('Uh-oh, YAML file has no offsets AND no startDates!')
      return
    }

    if (!this.yaml.offset) {
      if (!this.yaml.startDates) {
        alert("Need startDates in YAML if we don't have offsets")
        return
      }
      this.isUsingRealDates = true
      const defaultDate = moment(this.yaml.defaultStartDate)
      for (const d of this.yaml.startDates) {
        const date = moment(d)
        const diff = date.diff(defaultDate, 'days')
        this.offset.push(diff)
        if (date.isSame(d)) this.plusminus = diff
      }
    } else {
      this.offset = this.yaml.offset
      this.plusminus = this.yaml.offset[0]
      console.log({ newOffset: this.offset })
    }

    this.updateNotes()

    this.observedCases = await this.prepareObservedData(this.city)
    this.diviData = await this.prepareDiviData(this.city)

    await this.loadInfoTxt()
    await this.loadZipData()

    this.showPlotForCurrentSituation()
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

  private measureOptions: any = {}
  private runLookup: any = {}

  private observedCases: any[] = []
  private diviData: any[] = []

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
      range: ['2020-02-09', '2020-12-31'],
      type: 'date',
    },
    yaxis: {
      type: this.logScale ? 'log' : 'linear',
      autorange: true,
      title: 'Population',
    },
    plot_bgcolor: '#f8f8f8',
    paper_bgcolor: '#f8f8f8',
  }

  private strOffset(offset: number) {
    return (offset > 0 ? '+' : '') + offset
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
      filename: 'covid-plot',
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
    const shift = parseInt(value)
    console.log('SET PLUS MINUS:', shift)
    this.plusminus = shift
  }

  private get cityCap() {
    return this.city.slice(0, 1).toUpperCase() + this.city.slice(1)
  }

  private currentSituation: any = {}
  private loadedSeriesData: any = {}
  private zipLoader: any = {}

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
    nHospitalCumulative: 'Cumulative Hospitalized',
    nShowingSymptomsCumulative: 'Showing Symptoms Cum.',
  }

  private async mounted() {
    this.switchYaml()
  }

  private zipCache: any = {}

  private get prettyInfected() {
    if (!this.cumulativeInfected) return ''

    const rounded = 100 * Math.round(this.cumulativeInfected * 0.01)
    return Number(rounded).toLocaleString()
  }

  private async loadZipData() {
    this.isZipLoaded = false

    console.log('loadZipData:', this.city)

    const filepath = this.BATTERY_URL + this.runId + '/' + this.yaml.zip
    console.log(filepath)

    if (this.zipCache[this.city]) {
      // check cache first!
      console.log('using cached zip for!', this.city)
      this.zipLoader = this.zipCache[this.city]
    } else {
      // load the zip from file

      // console.log('---loading zip:', filepath)

      const zl = new ZipLoader(filepath)
      await zl.load()
      this.zipLoader = zl
      console.log('zip loaded!', this.runId, this.yaml.zip)
    }

    this.isZipLoaded = true
    this.zipCache[this.city] = this.zipLoader
    this.runChanged()

    this.showActivityLevelPlot()
  }

  private async showActivityLevelPlot() {
    this.showActivityLevels = true
  }

  private hospitalData: any[] = []

  private async runChanged() {
    const ignoreRow = 'Cumulative Hospitalized'
    // maybe we already did the calcs
    // if (this.loadedSeriesData[this.currentRun.RunId]) {
    //   const cache = this.loadedSeriesData[this.currentRun.RunId]
    //   this.hospitalData = cache
    //   this.data = cache.filter((row: any) => row.name !== ignoreRow)
    //   this.updateTotalInfected()
    //   return
    // }

    // load run dataset
    const csv: any[] = await this.loadCSV(this.currentRun)

    // zip might not yet be loaded
    if (csv.length === 0) return

    const timeSerieses = this.generateSeriesFromCSVData(csv)

    // cache the result
    this.loadedSeriesData[this.currentRun.RunId] = timeSerieses

    // populate the data where we need it
    this.hospitalData = timeSerieses
    this.data = timeSerieses.filter(row => row.name !== ignoreRow)
    this.updateTotalInfected()
  }

  private updateTotalInfected() {
    const infectedCumulative = this.data.filter(a => a.name === 'Infected Cumulative')[0]
    this.cumulativeInfected = Math.max(...infectedCumulative.y)
  }

  private sliderChanged(measure: any, value: any) {
    // console.log(measure, value)
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
    for (const measure of Object.keys(this.measureOptions))
      lookupKey += this.currentSituation[measure] + '-'

    // determine: use offset numeral, or offset date?
    if (this.isUsingRealDates) {
      const defaultDate = moment(this.yaml.defaultStartDate)
      const diff = defaultDate.add(this.plusminus, 'days')
      console.log(diff)
      lookupKey = lookupKey.replace('undefined', diff.format('YYYY-MM-DD'))
    } else {
      const offsetPrefix = '' + this.plusminus
      lookupKey = lookupKey.replace('undefined', offsetPrefix)
    }

    console.log(lookupKey)

    this.currentRun = this.runLookup[lookupKey]

    if (!this.currentRun) {
      this.isDataMissing = true
      console.log('Could not find this run in the zip:' + lookupKey)
      return
    }

    this.isDataMissing = false
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
    if (this.zipLoader === {}) return []

    const filename = currentRun.RunId + '.infections.txt.csv'
    console.log('Extracting', filename)

    let text = this.zipLoader.extractAsText(filename)
    const z = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true })

    return z.data
  }

  private calendarForSimDay(day: number) {
    if (day === -1) return 'General Options'

    const date = moment(this.startDate)
      .add(day - 1, 'days') // Day ONE is first day, so add days BEYOND day one
      .format('MMM DD')

    return date
  }

  private calculateDatefromSimulationDay(day: number) {
    const date = moment(this.startDate)
      .add(this.plusminus, 'days')
      .add(day - 1, 'days') // Day ONE is first day, so add days BEYOND day one
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

    // Add Observed Data!
    if (this.observedCases.length > 0) {
      // only add RKI line, because DIVI cumulative doesn't start at the beginning
      // of the epidemic.
      serieses.push(this.observedCases[0])
    }

    return serieses
  }

  private async prepareDiviData(newCity: string) {
    const serieses: any[] = []

    if (!this.cityDIVI[newCity]) return serieses

    const response = await fetch(this.cityDIVI[newCity])
    const csvContents = await response.text()
    const data = Papa.parse(csvContents, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data

    const dates: any = []
    const cases: any = []
    let cumulative = 0

    // pull the cases field out of the CSV
    for (const datapoint of data) {
      try {
        const datenstand = datapoint.daten_stand
        const day = datenstand.substring(0, 10)
        // cumulative += datapoint.faelle_covid_aktuell
        // cases.push(cumulative)
        if (datapoint.faelle_covid_aktuell) {
          dates.push(day)
          cases.push(datapoint.faelle_covid_aktuell)
        }
      } catch (e) {
        // well, some lines are badly formatted. ignore them
      }
    }

    serieses.push({
      name: 'Reported: ' + this.cityCap + ' Intensive Care (DIVI)',
      x: dates,
      y: cases,
      line: {
        dash: 'dot',
        width: 2,
        color: 'rgb(0,200,50)',
      },
    })

    console.log({ DIVI_DATA: serieses })
    return serieses
  }

  private async prepareObservedData(newCity: string) {
    // 1 - RKI DATA

    const response = await fetch(this.cityCSV[newCity])
    const csvContents = await response.text()
    const data = Papa.parse(csvContents, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data

    const xdates: any = []
    const xcases: any = []
    let cumulative = 0

    // pull the cases field out of the CSV
    for (const datapoint of data) {
      const day = datapoint.year + '-' + datapoint.month + '-' + datapoint.day
      xdates.push(day)
      cumulative += datapoint.cases
      xcases.push(cumulative)
    }

    const serieses = [
      {
        name: 'RKI ' + this.cityCap + ' Infections',
        x: xdates,
        y: xcases,
        line: {
          dash: 'dot',
          width: 3,
          color: 'rgb(0,200,150)',
        },
      },
    ]

    console.log({ observedData: serieses })
    return serieses
  }

  private async parseInfoTxt(city: string) {
    const filepath = this.BATTERY_URL + this.runId + '/_info.txt'
    console.log('fetching info:', this.runId)

    const response = await fetch(filepath)
    const text = await response.text()
    const parsed: any = Papa.parse(text, { header: true, dynamicTyping: false })
    // console.log({ parsed: parsed.data })

    return parsed.data
  }

  private async loadInfoTxt() {
    console.log('_info.txt: generating lookups')

    const infoTxt = await this.parseInfoTxt(this.city)

    const measures: any = {}
    const runLookup: any = {}

    // first get column names for the measures that have been tested
    const ignore = ['Config', 'Output', 'RunId', 'RunScript']

    for (const label of Object.keys(infoTxt[0])) {
      if (ignore.indexOf(label) > -1) continue
      measures[label] = new Set()
    }

    // get all possible values
    for (const row of infoTxt) {
      if (!row.RunId) continue

      // note this particular value, for every value
      for (const measure of Object.keys(measures)) {
        if (row[measure] === 0 || row[measure]) measures[measure].add('' + row[measure])
      }

      // store the run in a lookup using all values as the key
      let lookupKey = ''
      for (const measure of Object.keys(measures)) {
        lookupKey += row[measure] + '-'
      }
      runLookup[lookupKey] = row
    }

    console.log({ measures })
    let order = ''
    for (const measure of Object.keys(measures)) {
      order += measure + '-'
      measures[measure] = Array.from(measures[measure].keys()).sort((a: any, b: any) => a - b)
    }

    this.runLookup = runLookup
    this.measureOptions = measures
    console.log({ RUNLOOKUP: this.runLookup })
  }

  private mdParser = new MarkdownIt()

  private async updateNotes() {
    const url = this.BATTERY_URL + this.runId + '/' + this.yaml.readme

    const response = await fetch(url)

    if (response.status !== 200) return

    const text = await response.text()

    // bad url
    if (text.startsWith('<!DOCTYPE')) return

    this.cityMarkdownNotes = this.mdParser.render(text)
  }

  private get topNotes() {
    if (!this.cityMarkdownNotes) return ''

    const i = this.cityMarkdownNotes.indexOf(this.plotTag)

    if (i < 0) return this.cityMarkdownNotes
    return this.cityMarkdownNotes.substring(0, i)
  }

  private get bottomNotes() {
    if (!this.cityMarkdownNotes) return ''

    const i = this.cityMarkdownNotes.indexOf(this.plotTag)

    if (i < 0) return ''
    return this.cityMarkdownNotes.substring(i + this.plotTag.length)
  }
}

// ###########################################################################
</script>

<style scoped lang="scss">
#main-section {
  display: flex;
  flex-direction: row;
  background-color: white;
  padding: 0rem 3rem 1rem 3rem;
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

.content {
  margin-top: 2rem;
  padding: 0 3rem;
}

.option-groups {
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

.linear-plot {
  background-color: #f8f8f8;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  margin: 0rem 0 2rem 1rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  border: 1px solid #ccc;
}

.linear-plot.activity {
  background-color: #f8f8f800;
  padding: 0.5rem 0.75rem 0.5rem 0.5rem;
  margin: 0rem 0 2rem 1rem;
  text-align: center;
  display: flex;
  flex-direction: column;
  border: none;
}

h5 {
  margin-top: 0.5rem;
}

.plotarea {
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 25rem;
}

.plotarea.compact {
  grid-template-rows: 15rem;
}

.plotsize {
  grid-row: 1 / 2;
  grid-column: 1 / 2;
}

p.plotsize {
  z-index: 10;
  margin: auto auto;
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
}

.preamble {
  display: flex;
  flex-direction: row;
  margin-top: 1rem;
  padding: 1rem 3rem;
  background-color: white;
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

.bottom {
  margin-bottom: 3rem;
}

@media only screen and (max-width: 640px) {
  #main-section {
    flex-direction: column;
    padding: 0 1rem;
    margin: 0 0rem;
  }

  .preamble {
    padding: 1rem 1rem 0rem 1rem;
  }

  .content {
    padding: 0rem 1rem;
  }

  .all-plots {
    margin-left: 0;
  }

  .plot-options {
    margin-left: 0;
  }

  p.infected {
    margin-bottom: 1rem;
  }

  .pieces {
    margin: 0 0;
    padding: 1rem 0rem;
    display: flex;
    flex-direction: column;
  }

  .linear-plot {
    margin-top: 2rem;
    margin-left: 0;
  }

  .option-groups {
    width: 18rem;
  }
}
</style>
