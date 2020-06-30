<template lang="pug">
#vue-component
  vue-plotly(:data="dataLines" :layout="layout" :options="options")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import VuePlotly from '@statnett/vue-plotly'

@Component({ components: { VuePlotly }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private data!: any[]
  @Prop({ required: true }) private logScale!: boolean
  @Prop({ required: true }) private observed!: any[]
  @Prop({ required: true }) private endDate!: any

  private color = ['#094', '#0c4']

  private lagDays = 1

  private dataLines: any[] = []

  private mounted() {
    this.calculateValues()
  }

  @Watch('data') private updateModelData() {
    this.calculateValues()
  }

  @Watch('logScale') updateScale() {
    this.layout.yaxis.type = this.logScale ? 'log' : 'linear'
  }

  private dunkelZifferFactor = 1.0

  private calculateObserved(factor100k: number) {
    console.log({ observed: this.observed })
    if (this.observed.length === 0) return

    // for each data source, let's draw some dots
    for (const source of this.observed) {
      const observedLine: any = {
        type: 'scatter',
        mode: 'markers',
        marker: { size: 4 },
      }
      observedLine.name = source.name
      observedLine.line = source.line
      observedLine.x = []
      observedLine.y = []

      for (let i = 0; i < source.x.length; i++) {
        const newInfections = source.y[i] - (i < this.lagDays ? 0 : source.y[i - this.lagDays])
        const infectionsWithDunkelZiffer = newInfections * this.dunkelZifferFactor
        const observedRatePer100k =
          Math.floor((10.0 * infectionsWithDunkelZiffer) / factor100k) / 10.0

        observedLine.x.push(source.x[i])
        observedLine.y.push(observedRatePer100k)
      }

      // done
      this.dataLines.push(observedLine)
      console.log({ observedLine })
    }
  }

  /**
   * We are calculating a seven day running infection rate.
   */
  private calculateValues() {
    console.log('------ CALCULATE VALUES')
    if (this.data.length === 0) return

    // set end date
    this.layout.xaxis.range = ['2020-02-09', this.endDate]

    const susceptible = this.data.filter(item => item.name === 'Susceptible')[0]

    const totalPopulation = susceptible.y[0]
    const factor100k = totalPopulation / 100000.0
    const scaleFactor100k = 1.0 // factor100k

    const infectionRate = []

    const averagingPeriod = 1

    let nShowSymptomsCum: any = this.data.filter(item => item.name === 'Showing Symptoms Cum.')[0]
    console.log({ nShowSymptomsCum })

    if (nShowSymptomsCum.y[0] !== undefined) {
      for (let i = averagingPeriod; i < nShowSymptomsCum.y.length; i++) {
        const diff = nShowSymptomsCum.y[i] - nShowSymptomsCum.y[i - averagingPeriod]
        // infections per 100,000 per seven days
        const rate = Math.round((10.0 * diff) / scaleFactor100k) / 10.0 / averagingPeriod
        infectionRate.push(rate)
      }
    } else {
      for (let i = this.lagDays; i < susceptible.y.length; i++) {
        const diffSusceptible = susceptible.y[i - this.lagDays] - susceptible.y[i]
        // infections per 100,000
        const rate = (7.0 * Math.round((10.0 * diffSusceptible) / scaleFactor100k)) / 10.0
        infectionRate.push(rate)
      }
    }

    console.log({ WEEKLY_INFECTIONS: infectionRate })

    const grenz = (50.0 * totalPopulation) / 100000.0 / 7.0
    console.log({ grenz })
    this.dataLines = [
      {
        name: 'Target: 50 per 100,000 (scaled)',
        x: [0, susceptible.x[susceptible.x.length - 1]],
        y: [grenz, grenz],
        fill: 'tozeroy',
        line: {
          width: 1.0,
          color: '#ddbbbb',
        },
      },
      {
        name: 'Simulated Infections',
        x: susceptible.x.slice(averagingPeriod),
        y: infectionRate,
        type: 'scatter',
        mode: 'markers',
        marker: { size: 4, color: '#329' },
        // line: {
        //   width: 1.5,
        //   color: '#329',
        //   shape: 'hvh',
        // },
      },
    ]

    this.calculateObserved(scaleFactor100k)
  }

  private reformatDate(day: string) {
    const pieces = day.split('.')
    const date = pieces[2] + '-' + pieces[1] + '-' + pieces[0]
    return date
  }

  private layout = {
    height: 225,
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
      autorange: true, // this.logScale ? false : true,
      // range: [0, 5],
      title: 'Daily Infections',
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
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

@media only screen and (max-width: 640px) {
}
</style>
