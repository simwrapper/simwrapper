<template lang="pug">
#vue-component
  vue-plotly(:data="dataLines" :layout="layout" :options="options")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import Papa from 'papaparse'
import VuePlotly from '@statnett/vue-plotly'

interface City {
  fromModel: string[]
  fromCSV: string[]
  csvLineNames: string[]
  dateFormatter: Function
  dateColumn: string
}

@Component({ components: { VuePlotly }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private data!: any[]
  @Prop({ required: true }) private logScale!: boolean
  @Prop({ required: true }) private city!: string
  @Prop({ required: true }) private endDate!: string
  @Prop({ required: true }) private diviData!: any[]

  private csvData: any = {
    berlin: require('@/assets/berlin-hospital.csv').default,
    munich: require('@/assets/munich-hospital.csv').default,
  }

  private dataDetails: { [id: string]: City } = {
    berlin: {
      fromModel: ['Seriously Sick', 'Critical'],
      fromCSV: ['Stationäre Behandlung', 'Intensivmedizin'],
      csvLineNames: [
        'Reported: Berlin Hospitalized (Senate)',
        'Reported: Berlin Intensive Care (Senate)',
      ],
      dateFormatter: this.reformatDateBerlin,
      dateColumn: 'Datum',
    },
    munich: {
      fromModel: ['Cumulative Hospitalized'],
      fromCSV: ['Stationär'],
      csvLineNames: ['Reported: Munich Hospitalized'],
      dateFormatter: this.reformatDateMunich,
      dateColumn: 'Tag',
    },
  }

  private colors: any = {
    'Seriously Sick': '#44f',
    'Cumulative Hospitalized': '#707',
    Critical: '#707',
  }

  private dataLines: any[] = []
  private hospitalSeries: any[] = []
  private cityDetails: City = this.dataDetails.berlin

  private mounted() {
    this.buildPlot()
  }

  private buildPlot() {
    this.cityDetails = this.dataDetails[this.city]
    this.prepareHospitalData()
    this.updateModelData()
  }

  @Watch('city') private switchCity() {
    this.buildPlot()
  }

  @Watch('diviData') private switchDivi() {
    this.prepareHospitalData()
  }

  @Watch('logScale') updateScale() {
    this.layout.yaxis.type = this.logScale ? 'log' : 'linear'
  }

  @Watch('data') private updateModelData() {
    let modelData = this.data.filter(item => this.cityDetails.fromModel.indexOf(item.name) > -1)

    // set end date
    this.layout.xaxis.range = ['2020-02-09', this.endDate]

    // For Berlin we need to *combine* the seriouslySick and critical into one line.
    if (this.city === 'berlin') {
      for (let i = 0; i < modelData[0].y.length; i++) {
        modelData[0].y[i] += modelData[1].y[i]
      }
    }

    modelData = modelData.map(item => {
      // we are going to mutate the line color (!!!) to ensure all plots on the screen
      // have the same color for these metrics.
      const color = this.colors[item.name]
      item.line = {
        dash: 'solid',
        width: 2,
        color: color,
      }

      const trace = {
        name: 'Model: ' + item.name,
        x: item.x,
        y: item.y,
        line: item.line,
      }

      return trace
    })

    if (this.city === 'berlin') modelData[0].name = 'Model: Should be Hospitalized'

    this.dataLines = modelData
    this.dataLines.push(...this.hospitalSeries)

    // console.log({ dataLines: this.dataLines })
  }

  private prepareHospitalData() {
    const hospData = Papa.parse(this.csvData[this.city], {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data

    this.hospitalSeries = []

    for (let i = 0; i < this.cityDetails.fromModel.length; i++) {
      const column = this.cityDetails.fromCSV[i]

      this.hospitalSeries.push({
        name: this.cityDetails.csvLineNames[i],
        x: hospData.map(day => this.cityDetails.dateFormatter(day[this.cityDetails.dateColumn])),
        y: hospData.map(day => day[column]),
        line: {
          dash: 'dot',
          width: 2,
          color: this.colors[this.cityDetails.fromModel[i]],
        },
      })
    }

    console.log('DIVIDATA LENGITH IS', this.diviData.length)
    if (this.diviData.length > 0) {
      this.hospitalSeries.push(this.diviData[0])
    }

    console.log({ hHHHH_HOSP: this.hospitalSeries })
  }

  private reformatDateBerlin(day: string) {
    const pieces = day.split('.')
    const date = pieces[2] + '-' + pieces[1] + '-' + pieces[0]
    return date
  }

  private reformatDateMunich(day: string) {
    const pieces = day.split('-')
    const date = '20' + pieces[2] + '-' + pieces[1] + '-' + pieces[0]
    return date
  }

  private layout = {
    autosize: true,
    height: 225,
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
      title: 'Number of Hospitalizations',
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
