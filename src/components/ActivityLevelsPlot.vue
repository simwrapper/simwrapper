<template lang="pug">
#vue-component
  vue-plotly.activity-plot(:data="dataLines" :layout="layout" :options="options")

  .row-labels
    p(v-for="row in dataLines" :key="row.name") {{ row.name}}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import moment from 'moment'
import Papa from 'papaparse'
import SVNFileSystem from '@/util/SVNFileSystem'
import VuePlotly from '@statnett/vue-plotly'
import ZipLoader from 'zip-loader'

@Component({ components: { VuePlotly }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private city!: string
  @Prop({ required: true }) private battery!: string
  @Prop({ required: true }) private currentRun!: any
  @Prop({ required: true }) private startDate!: string
  @Prop({ required: true }) private endDate!: string
  @Prop({ required: true }) private plusminus!: number
  @Prop({ required: true }) private zipContent!: any

  private dataLines: any[] = []

  private zipCache: any = {}
  private zipLoader: any
  private isZipLoaded = false

  private PUBLIC_SVN =
    'https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/episim/'
  private BATTERY_URL = this.PUBLIC_SVN + 'battery/'

  private MAX_DAYS = 500

  private mounted() {
    // if results were passed in, then we don't need to unzip.
    if (this.zipContent.extractAsText) {
      this.zipLoader = this.zipContent
      this.zipCache[this.city] = this.zipLoader
      this.isZipLoaded = true
      this.runChanged()
    }
  }

  @Watch('battery') private updateModelData() {
    // this.buildActivityLevels()
  }

  @Watch('currentRun') private runWasSwitched() {
    this.runChanged()
  }

  @Watch('city') private changedCity() {
    console.log('CITY CHANGED')
    this.zipLoader = this.zipContent
    this.zipCache[this.city] = this.zipLoader
    this.isZipLoaded = true
    this.runChanged()
  }

  @Watch('zipContent') private zipContentChanged() {
    console.log('ZIP CONTENT CHANGED', this.zipContent)
    this.changedCity()
  }

  private async loadCSV(currentRun: any) {
    if (!currentRun.RunId) return []
    if (!this.zipLoader) return []
    if (this.zipLoader === {}) return []

    const filename = currentRun.RunId + '.restrictions.txt.csv'
    console.log('Extracting', filename)

    let text = this.zipLoader.extractAsText(filename)
    const z = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true })
    console.log('Got it!', filename)

    return z.data
  }

  private async runChanged() {
    // load run dataset
    const csv: any[] = await this.loadCSV(this.currentRun)

    // zip might not yet be loaded
    if (csv.length === 0) return

    const timeSerieses = this.generateSeriesFromCSVData(csv)

    // cache the result
    // this.loadedSeriesData[this.currentRun.RunId] = timeSerieses

    console.log({ timeSerieses })

    // populate the data where we need it
    this.dataLines = timeSerieses

    this.layout.grid.rows = this.dataLines.length

    // set end date
    this.layout.xaxis.range = ['2020-02-09', this.endDate]

    for (let i = 2; i <= this.dataLines.length; i++) {
      const key = 'yaxis' + i
      this.layout[key] = {
        zeroline: false,
        showgrid: false,
        showline: false,
        type: 'linear',
        autorange: true,
        autotick: true,
        showticklabels: false,
        ticks: '',
        title: '', // i == 1 + Math.floor(this.dataLines.length / 2) ? 'Activity Level,  0-100%' : '',
      }
    }
  }

  private fields: any[] = [
    { col: 'work', title: 'Work' },
    { col: 'leisure', title: 'Leisure' },
    { col: 'shopping', title: 'Other Activities' },
    { col: 'educ_kiga', title: 'Kindergarten' },
    { col: 'educ_primary', title: 'Primary Education' },
    { col: 'educ_secondary', title: 'Secondary Education' },

    // { col: 'educ_tertiary', title: 'Educ: Tertiary' },
    // { col: 'educ_higher', title: 'Educ: Higher' },
    { col: 'educ_other', title: 'Other Education' },
    { col: 'shop_daily', title: 'Other Non-Home' },
    // { col: 'shop_other', title: 'Shopping: Other' },
    // { col: 'visit', title: 'Visits' },
    // { col: 'errands', title: 'Errands' },
    // { col: 'business', title: 'Pers. Business' },
  ]

  private generateSeriesFromCSVData(data: any[]) {
    const serieses = []

    const days: number[] = this.unpack(data, 'day')
    const x = days.map(d => this.calculateDatefromSimulationDay(d))

    let yaxis = 0
    for (const field of this.fields) {
      const name = field.title
      try {
        const y: number[] = this.unpack(data, field.col)
        yaxis++
        const trace: any = { x, y, name, type: 'scatter', fill: 'tozeroy' }
        if (yaxis > 1) trace.yaxis = 'y' + yaxis
        serieses.push(trace)
      } catch {
        // skip columns that don't exist
      }
    }

    return serieses
  }

  private calculateDatefromSimulationDay(day: number) {
    const date = moment(this.startDate)
      .add(this.plusminus, 'days')
      .add(day - 1, 'days') // Day ONE is first day, so add days BEYOND day one
      .format('YYYY-MM-DD')
    return date
  }

  private unpack(rows: any[], key: any) {
    let v = rows.map(function(row) {
      if (key === 'day') return row[key]

      const v = 100.0 * parseFloat(row[key].split('_')[0])
      return v
    })

    v = v.slice(0, this.MAX_DAYS)

    // maybe the sim ended early - go out to 150 anyway
    if (v.length < this.MAX_DAYS) {
      v.push(key === 'day' ? this.MAX_DAYS : v[v.length - 1])
    }
    return v
  }

  private reformatDate(day: string) {
    const pieces = day.split('.')
    const date = pieces[2] + '-' + pieces[1] + '-' + pieces[0]
    return date
  }

  private layout: any = {
    grid: {
      rows: this.dataLines.length,
      columns: 1,
      pattern: 'coupled',
      roworder: 'top to bottom',
    },
    height: 250,
    autosize: true,
    showlegend: false,
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
      zeroline: true,
      range: ['2020-02-09', '2020-12-31'],
      type: 'date',
      showgrid: false,
      showline: false,
    },
    yaxis: {
      type: 'linear',
      zeroline: false,
      showgrid: false,
      showline: false,
      autorange: true,
      autotick: true,
      showticklabels: false,
      title: '',
      ticks: '',
    },
    plot_bgcolor: '#f8f8f800',
    paper_bgcolor: '#f8f8f800',
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
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#vue-component {
  display: grid;
  grid-template-columns: auto 1fr;
  grid-template-rows: 1fr;
}

.activity-plot {
  grid-column: 1 / 3;
  grid-row: 1 / 1;
}

.row-labels {
  grid-column: 1 / 2;
  grid-row: 1 / 1;
  text-align: right;
  display: flex;
  flex-direction: column;
  margin-left: -1rem;
  margin-top: 0.6rem;
}

.row-labels p {
  font-size: 0.8rem;
  text-align: right;
  margin: auto 0 auto auto;
  line-height: 0.8rem;
  width: min-content;
  height: 1.6rem;
}

@media only screen and (max-width: 640px) {
}
</style>
