<template lang="pug">
VuePlotly.myplot(
  :data="data"
  :layout="layout"
  :options="options"
  :id="id"
  :class="className"
)
  //- @click="handlePlotlyClick"

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import { FileSystemConfig, Status, UI_FONT } from '@/Globals'
import DashboardDataManager from '@/js/DashboardDataManager'
import VuePlotly from '@/components/VuePlotly.vue'
import { buildCleanTitle } from '@/charts/allCharts'

import globalStore from '@/store'

@Component({ components: { VuePlotly } })
export default class VueComponent extends Vue {
  @Prop() fileSystemConfig!: FileSystemConfig
  @Prop() subfolder!: string
  @Prop() config!: any
  @Prop() files!: string[]
  @Prop() datamanager!: DashboardDataManager
  @Prop() cardId!: string
  @Prop({ required: true }) cardTitle!: string

  private globalState = globalStore.state

  private id = 'bar-' + Math.random()
  private plotID = this.getRandomInt(100000)

  private className = ''

  // dataSet is either x,y or allRows[]
  private dataSet: { x?: any[]; y?: any[]; allRows?: any[] } = {}

  private YAMLrequirementsBar = {
    dataset: '',
    x: '',
    columns: '',
  }

  private async mounted() {
    this.updateLayout()
    this.updateTheme()
    this.dataSet = await this.loadData()
    this.updateChart()

    this.options.toImageButtonOptions.filename = buildCleanTitle(this.cardTitle, this.subfolder)

    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')

    this.checkWarningsAndErrors()
  }

  private changeDimensions(dimensions: { width: number; height: number }) {
    this.layout = Object.assign({}, this.layout, dimensions)
  }

  private beforeDestroy() {
    try {
      this.datamanager.removeFilterListener(this.config, this.handleFilterChanged)
    } catch (e) {}
  }

  // Check this plot for warnings and errors
  private checkWarningsAndErrors() {
    var plotTitle = this.cardTitle
    // warnings
    // missing title
    if (plotTitle.length == 0) {
      this.$store.commit('setStatus', {
        type: Status.WARNING,
        msg: `The plot title is missing!`,
        desc: "Please add a plot title in the .yaml-file (title: 'Example title')",
      })
    }
    // errors
  }

  @Watch('globalState.isDarkMode')
  updateTheme() {
    const colors = {
      paper_bgcolor: this.globalState.isDarkMode ? '#242627' : '#fff',
      plot_bgcolor: this.globalState.isDarkMode ? '#242627' : '#fff',
      font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
    }
    this.layout = Object.assign({}, this.layout, colors)
  }

  private updateLayout() {
    this.layout.xaxis.title.text = this.config.xAxisTitle || this.config.xAxisName || ''
    this.layout.yaxis.title.text = this.config.yAxisTitle || this.config.yAxisName || ''
  }

  private async handlePlotlyClick(click: any) {
    try {
      const { x, y, data } = click.points[0]

      const filter = this.config.groupBy
      const value = x

      // TODO this.datamanager.setFilter(this.config.dataset, filter, value)
    } catch (e) {
      console.error(e)
    }
  }

  private async handleFilterChanged() {
    try {
      const { filteredRows } = (await this.datamanager.getFilteredDataset(this.config)) as any

      // is filter UN-selected?
      if (!filteredRows) {
        this.data = [this.data[0]]
        this.data[0].opacity = 1.0
        return
      }

      const fullDataCopy = Object.assign({}, this.data[0])

      fullDataCopy.x = filteredRows.x
      fullDataCopy.y = filteredRows.y
      fullDataCopy.opacity = 1.0
      fullDataCopy.name = 'Filtered'
      //@ts-ignore - let plotly manage bar colors EXCEPT the filter
      fullDataCopy.marker = { color: '#ffaf00' } // 3c6' }

      this.data = [this.data[0], fullDataCopy]
      this.data[0].opacity = 0.3
      this.data[0].name = 'All'
    } catch (e) {
      const message = '' + e
      console.log(message)
      this.dataSet = {}
    }
  }

  private async loadData() {
    if (!this.files.length) return {}

    try {
      this.validateYAML()
      const allRows = await this.datamanager.getDataset(this.config)
      // this.datamanager.addFilterListener(this.config, this.handleFilterChanged)
      return allRows
    } catch (e) {
      const message = '' + e
      console.log(message)
      // this.$store.commit('setStatus', { type: Status.ERROR, message })
    }
    return {}
  }

  private validateYAML() {
    console.log('in bars validation')

    for (const key in this.YAMLrequirementsBar) {
      if (key in this.config === false) {
        this.$store.commit('setStatus', {
          type: Status.ERROR,
          msg: `YAML file missing required key: ${key}`,
          desc: 'Check this.YAMLrequirementsXY for required keys',
        })
      }
    }
  }

  private getRandomInt(max: number) {
    return Math.floor(Math.random() * max).toString()
  }

  private updateChart() {
    try {
      if (this.config.groupBy) this.updateChartWithGroupBy()
      else this.updateChartSimple()
    } catch (e) {
      const msg = '' + e
      this.$store.commit('setStatus', { type: Status.ERROR, msg })
    }
  }

  private updateChartWithGroupBy() {
    this.className = this.plotID // stacked bug-fix hack

    // TODO: re-implement grouping

    // const { x, y } = this.dataRows

    // this.data = [
    //   {
    //     x,
    //     y,
    //     name: this.config.groupBy,
    //     type: 'bar',
    //     textinfo: 'label+percent',
    //     textposition: 'inside',
    //     automargin: true,
    //     opacity: 1.0,
    //   },
    // ]
  }

  private updateChartSimple() {
    let x: any[] = []

    var useOwnNames = false

    const allRows = this.dataSet.allRows || ({} as any)
    const columnNames = Object.keys(allRows)

    if (!columnNames.length) {
      this.data = []
      return
    }

    // old configs called it "usedCol" --> now "columns"
    let columns = this.config.columns || this.config.usedCol

    // Or maybe user didn't specify: then use all the columns!
    if (!columns && columnNames.length) {
      columns = columnNames.filter(col => col !== this.config.x).sort()
    }

    // old legendname field
    if (this.config.legendName) this.config.legendTitles = this.config.legendName
    if (this.config.legendTitles !== undefined) {
      if (this.config.legendTitles.length === columns.length) {
        useOwnNames = true
      }
    }

    if (this.config.stacked) {
      this.layout.barmode = 'stack'
    } else {
      this.layout.barmode = 'group'
    }

    if (this.config.stacked) this.className = this.plotID

    const xColumn = allRows[this.config.x]

    if (!xColumn) {
      throw Error(`File ${this.config.dataset}: Could not find column ${this.config.x}`)
    }

    x = xColumn.values
    if (this.config.skipFirstRow) x = x.slice(1)

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i]
      const legendName = useOwnNames ? this.config.legendTitles[i] : col

      let values = allRows[col].values
      if (this.config.skipFirstRow) values = values.slice(1)

      // are durations in 00:00:00 format?
      if (this.config.convertToSeconds) values = this.convertToSeconds(values)

      this.data.push({
        x: x,
        y: values,
        name: legendName,
        type: 'bar',
        textinfo: 'label+percent',
        textposition: 'inside',
        automargin: true,
        opacity: 1.0,
      })
    }
  }

  private convertToSeconds(values: any[]) {
    values = values.map((v: string) => {
      try {
        const pieces = v.split(':')
        const seconds = pieces.reduce((prev: any, curr: any) => parseInt(curr, 10) + prev * 60, 0)
        return seconds
      } catch (e) {
        return 0
      }
    })
  }

  private layout: any = {
    barmode: 'overlay',
    bargap: 0.08,
    height: 300,
    margin: { t: 8, b: 0, l: 0, r: 0, pad: 2 },
    font: {
      color: '#444444',
      family: UI_FONT,
    },
    xaxis: {
      automargin: true,
      autorange: true,
      title: { text: '', standoff: 12 },
      animate: true,
    },
    yaxis: {
      automargin: true,
      autorange: true,
      title: { text: '', standoff: 16 },
      animate: true,
    },
    legend: {
      orientation: 'v',
      x: 1,
      y: 1,
    },
  }

  private data = [] as any[]

  private options = {
    responsive: true,
    displaylogo: false,
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
      filename: 'bar-chart',
      width: null,
      height: null,
    },
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.myplot {
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  bottom: 0;
}

@media only screen and (max-width: 640px) {
}
</style>
