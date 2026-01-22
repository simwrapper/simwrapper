<template lang="pug">
.mycomponent(:class="{'is-thumbnail': thumbnail}")

  VuePlotly.myplot(
    :data="traces"
    :layout="layout"
    :options="options"
  )

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { total: 'total', showChanges: 'Only show changes' },
    de: { total: 'Insgesamt', showChanges: 'Nur Änderungen zeigen' },
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import yaml from 'yaml'

import globalStore from '@/store'
import VuePlotly from '@/components/VuePlotly.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import { getColorRampHexCodes } from '@/js/ColorsAndWidths'
import { mergeTypedArrays } from '@/js/util'
import {
  FileSystemConfig,
  UI_FONT,
  BG_COLOR_DASHBOARD,
  BG_COLOR_PLOTLY_FACETS,
  DataTable,
  DataSet,
  DataTableColumn,
} from '@/Globals'

interface Layout {
  [key: string]: any
}

const MyComponent = defineComponent({
  name: 'PlotlyPlugin',
  components: { VuePlotly },
  i18n,
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    config: { type: Object as any },
    datamanager: { type: Object as PropType<DashboardDataManager> },
    resize: Object as any,
    thumbnail: Boolean,
    yamlConfig: String,
  },

  data() {
    return {
      globalState: globalStore.state,
      vizDetails: { title: '', description: '' } as any,
      loadingText: '',
      jsonChart: {} as any,
      id: `plotly-id-${Math.floor(1e12 * Math.random())}` as any,
      traces: [] as any[],
      prevWidth: -1,
      prevHeight: -1,
      attributeColorMap: new Map(),
      colorway: [
        '#1f77b4', // muted blue
        '#ff7f0e', // safety orange
        '#2ca02c', // cooked asparagus green
        '#d62728', // brick red
        '#9467bd', // muted purple
        '#8c564b', // chestnut brown
        '#e377c2', // raspberry yogurt pink
        '#7f7f7f', // middle gray
        '#bcbd22', // curry yellow-green
        '#17becf',
      ],
      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),
      // Plotly layout
      layout: {
        margin: { t: 8, b: 0, l: 50, r: 0, pad: 2 },
        font: {
          color: '#444444',
          family: UI_FONT,
        },
        xaxis: {
          automargin: true,
          autorange: true,
          range: [0, 100], // Just some default values. The correct values are calculated later in the code (in setFixedAxis()). Only used for interactive plotly plots with a slider
          title: { text: '', standoff: 12 },
          animate: true,
        },
        yaxis: {
          automargin: true,
          autorange: true,
          range: [0, 100], // see this.layout.xaxis.range...
          title: { text: '', standoff: 16 },
          animate: true,
          rangemode: 'tozero',
        },
        yaxis2: {
          automargin: true,
          autorange: true,
          range: [0, 100], // see this.layout.xaxis.range...
          title: { text: '', standoff: 16 },
          animate: true,
          rangemode: 'tozero',
          matches: 'y',
          anchor: 'x2',
        },
        legend: {
          orientation: 'v',
          x: 1,
          y: 1,
        },
        grid: { rows: 1, columns: 1 },
      } as Layout,
      // Plotly options
      options: {
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
          format: 'png', // one of png, svg, jpeg, webp
          filename: 'chart',
          width: null,
          height: null,
        },
      },
      minXValue: Number.POSITIVE_INFINITY,
      minYValue: Number.POSITIVE_INFINITY,
      maxXValue: Number.NEGATIVE_INFINITY,
      maxYValue: Number.NEGATIVE_INFINITY,
      isUsingFacets: false,
    }
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },
  },

  watch: {
    'globalState.resizeEvents'() {
      this.changeDimensions({})
    },
    resize(event: any) {
      this.changeDimensions(event)
    },
    'globalState.isDarkMode'() {
      this.updateTheme()
    },
  },

  async mounted() {
    this.updateTheme()
    await this.getVizDetails()
    // only continue if we are on a real page and not the file browser
    if (this.thumbnail) return

    try {
      if (this.vizDetails.datasets) await this.prepareData()
      if (this.vizDetails.traces) this.traces = this.vizDetails.traces

      // merge user-supplied layout with SimWrapper layout defaults
      if (this.vizDetails.layout) this.mergeLayouts()

      if (this.vizDetails.fixedRatio) {
        this.vizDetails.layout.xaxis = Object.assign(this.vizDetails.layout.xaxis, {
          constrain: 'domain',
        })
        this.vizDetails.layout.yaxis = Object.assign(this.vizDetails.layout.yaxis, {
          constrain: 'domain',
          scaleanchor: 'x',
          scaleration: 1,
        })
      }

      // Backwards compatiblity with the older "dropdownMenu" option
      if (this.vizDetails.dropdownMenu) this.vizDetails.interactive = 'dropdown'
      // create interactive elements
      if (this.vizDetails.interactive) this.createMenus(this.vizDetails.interactive)
      // calculates the axis if the plot is interactive and has a slider
      if (this.vizDetails.interactive && this.config.interactive === 'slider') this.setFixedAxis()
    } catch (err) {
      const e = err as any
      console.error({ e })
      this.$emit('error', '' + e)
      this.loadingText = '' + e
    }
    this.updateTheme()
    window.addEventListener('resize', this.changeDimensions)
    this.layout.margin = { r: 0, t: 8, b: 0, l: 50, pad: 2 }
    this.createFacets()

    // Fix: If two x axes are used, the x-axis labels are not displayed correctly.
    if (Array.isArray(this.traces[0].x[0])) {
      this.layout.xaxis.autotickangles = [0, 90]
    }
  },

  beforeDestroy() {
    window.removeEventListener('resize', this.changeDimensions)
  },

  methods: {
    /**
     * Calculates the axis ranges for the x-axis and y-axis based on the data in the 'traces' array.
     * It iterates through each trace and updates the 'maxXValue', 'maxYValue', 'minYValue', and 'minXValue'
     * based on the maximum and minimum values found in the 'x' and 'y' arrays of each trace.
     */
    setFixedAxis() {
      for (let i = 0; i < this.traces.length; i++) {
        // Calculated the min and max value for the x- any y-axis for each trace
        const yAxisMin = Math.min(...this.traces[i].y)
        const yAxisMax = Math.max(...this.traces[i].y)
        const xAxisMin = Math.min(...this.traces[i].x)
        const xAxisMax = Math.max(...this.traces[i].x)

        // Update the 'maxXValue' if the maximum value in the 'x' array of the current trace is greater than the current 'maxXValue'.
        if (xAxisMax >= this.maxXValue) this.maxXValue = xAxisMax

        // Update the 'maxYValue' if the maximum value in the 'y' array of the current trace is greater than the current 'maxYValue'.
        if (yAxisMax >= this.maxYValue) this.maxYValue = yAxisMax

        // Update the 'minYValue' if the minimum value in the 'y' array of the current trace is less than the current 'minYValue'.
        if (yAxisMin <= this.minYValue) this.minYValue = yAxisMin

        // Update the 'minXValue' if the minimum value in the 'x' array of the current trace is less than the current 'minXValue'.
        if (xAxisMin <= this.minXValue) this.minXValue = xAxisMin
      }

      // Set the x-axis and y-axis ranges in the layout based on the calculated 'minXValue', 'maxXValue', 'minYValue', and 'maxYValue'.
      this.layout.xaxis.range = [this.minXValue, this.maxXValue]
      this.layout.yaxis.range = [this.minYValue, this.maxYValue]

      // Set the autorange option to false, range is now calculated and fix
      this.layout.xaxis.autorange = false
      this.layout.yaxis.autorange = false

      // Uncomment the following lines to log the chart title and axis ranges to the console for debugging purposes.
      // console.log(this.$props.config.title)
      // console.log(
      //   this.vizDetails.description +
      //     ': x-axis: [' +
      //     this.minXValue +
      //     ',' +
      //     this.maxXValue +
      //     '], y-axis: [' +
      //     this.minYValue +
      //     ',' +
      //     this.maxYValue +
      //     ']'
      // )
    },
    changeDimensions(dim: any) {
      if (dim?.height && dim?.width) {
        if (dim.height !== this.prevHeight || dim.width !== this.prevWidth) {
          this.prevHeight = dim.height
          this.prevWidth = dim.width
          this.layout = Object.assign({}, this.layout, dim)
        }
      }
    },

    mergeLayouts() {
      const mergedLayout = { ...this.vizDetails.layout }

      // TODO: only if the y axis title is set, the margin to the left needs to be little bit larger

      // we always want to use SimWrapper defaults for these:
      mergedLayout.margin = this.layout.margin
      mergedLayout.font = this.layout.font
      mergedLayout.legend = this.layout.legend

      // we never want these:
      delete mergedLayout.height
      delete mergedLayout.width

      // be selective about these:
      if (mergedLayout.xaxis) {
        mergedLayout.xaxis.automargin = true
        mergedLayout.xaxis.autorange = true
        mergedLayout.xaxis.animate = true
        if (!mergedLayout.xaxis.title) mergedLayout.xaxis.title = this.layout.xaxis.title
      } else {
        mergedLayout.xaxis = this.layout.xaxis
      }

      if (mergedLayout.yaxis) {
        mergedLayout.yaxis.automargin = true
        mergedLayout.yaxis.autorange = true
        mergedLayout.yaxis.animate = true

        // bug #357: scatterplots fail if rangemode is set
        if (!this.traces.find(a => a?.type == 'scatter')) {
          if (!mergedLayout.yaxis.rangemode) mergedLayout.yaxis.rangemode = 'tozero'
        }
        if (!mergedLayout.yaxis.title) mergedLayout.yaxis.title = this.layout.yaxis.title
      } else {
        mergedLayout.yaxis = this.layout.yaxis
      }

      if (mergedLayout.yaxis2) {
        mergedLayout.yaxis2.automargin = true
        mergedLayout.yaxis2.autorange = true
        mergedLayout.yaxis2.animate = true
        if (!mergedLayout.yaxis2.rangemode) mergedLayout.yaxis2.rangemode = 'tozero'
        if (!mergedLayout.yaxis2.title) mergedLayout.yaxis2.title = this.layout.yaxis2.title
      } else {
        mergedLayout.yaxis2 = this.layout.yaxis2
      }

      this.layout = mergedLayout
    },

    // This method checks if facet_col and/or facet_row are defined in the traces
    createFacets() {
      if (this.traces[0].facet_col == undefined && this.traces[0].facet_row == undefined) return

      // Set different bg colors for facet plots to seperate them from each other
      this.isUsingFacets = true
      this.updateTheme()

      let facet_col = [] as any[]
      let facet_row = [] as any[]

      if (this.traces[0].facet_col != undefined)
        facet_col = this.traces[0].facet_col.filter(
          (element: any, index: any) => this.traces[0].facet_col.indexOf(element) === index
        )
      if (this.traces[0].facet_row != undefined)
        facet_row = this.traces[0].facet_row.filter(
          (element: any, index: any) => this.traces[0].facet_row.indexOf(element) === index
        )

      this.groupTracesByFacets(facet_col, facet_row)

      // If the plot is interactive, the traces are displayed in one plot so the grid is set to 1x1
      if (this.vizDetails.interactive == 'dropdown') {
        this.layout.grid = { rows: 1, columns: 1 }
        this.createMenus(this.vizDetails.interactive)
      }
    },
    // If facet_col and/or facet_row are defined in the traces, this method groups the traces by the facets
    groupTracesByFacets(facet_col: any[], facet_row: any[]) {
      const yAxisTitle = this.layout.yaxis.title
      const xAxisTitle = this.layout.xaxis.title
      const result = []
      let numRows = facet_row.length
      let numCols = facet_col.length

      if (numRows == 0) numRows = 1
      if (numCols == 0) numCols = 1

      // Create facet traces if there are multiple rows but only one column
      if (facet_col.length == 0) {
        result.push(
          ...this.groupTracesByFacetsForOneColumnOrRow(
            numRows,
            yAxisTitle,
            facet_row,
            'y',
            'facet_row'
          )
        )
      } else if (facet_row.length == 0) {
        result.push(
          ...this.groupTracesByFacetsForOneColumnOrRow(
            numCols,
            xAxisTitle,
            facet_col,
            'x',
            'facet_col'
          )
        )
      } else {
        result.push(
          ...this.groupTracesByFacetsColumnsAndRows(
            numCols,
            numRows,
            facet_col,
            facet_row,
            xAxisTitle,
            yAxisTitle
          )
        )
      }

      this.layout.margin = { t: 10, b: 20, l: 60, r: 60, pad: 2 }
      this.layout.grid = { rows: numRows, columns: numCols }
      this.traces = result
    },

    assignColor(filterTrace: any) {
      if (this.attributeColorMap.has(filterTrace.legendgroup)) {
        return this.attributeColorMap.get(filterTrace.legendgroup)
      } else {
        const colorIndex = this.attributeColorMap.size % this.colorway.length
        const color = this.colorway[colorIndex]
        this.attributeColorMap.set(filterTrace.legendgroup, color)
        return color
      }
    },

    // If only one column or one row is defined in the traces, this method groups the traces by the facet
    groupTracesByFacetsColumnsAndRows(
      numberOfColumns: number,
      numberOfRows: number,
      facet_col: any[],
      facet_row: any[],
      xAxisTitle: string,
      yAxisTitle: string
    ) {
      const result = []
      for (let i = 0; i < numberOfRows; i++) {
        for (let j = 0; j < numberOfColumns; j++) {
          const row = facet_row[i]
          const col = facet_col[j]
          const filteredTraces = []

          for (const trace of this.traces) {
            const filteredX = []
            const filteredY = []

            for (let l = 0; l < trace.facet_row.length; l++) {
              if (trace.facet_row[l] === row && trace.facet_col[l] === col) {
                filteredX.push(trace.x[l])
                filteredY.push(trace.y[l])
              }
            }

            const filterTrace = {
              ...trace,
              x: filteredX,
              y: filteredY,
              xaxis: i > 0 ? 'x' + (i + 1) : 'x',
              yaxis: j > 0 ? 'y' + (j + 1) : 'y',
            }

            delete filterTrace.facet_row
            delete filterTrace.facet_col

            // showlegend
            filterTrace.showlegend = i === 0 && j === 0

            // legendgroup
            filterTrace.legendgroup = filterTrace.group_name
            delete filterTrace.group_name

            // filterTrace.marker.color = '#123456'
            const color = this.assignColor(filterTrace)
            filterTrace.marker = {
              color: color,
            }

            filteredTraces.push(filterTrace)
          }

          let xAxisIndex = i === 0 ? 'xaxis' : 'xaxis' + (i + 1)
          let yAxisIndex = j === 0 ? 'yaxis' : 'yaxis' + (j + 1)

          // Left: Axis Text
          if (this.layout[yAxisIndex] == undefined) {
            this.layout[yAxisIndex] = {
              title: {
                text:
                  yAxisTitle +
                  '<br>' +
                  this.config.traces[0].facet_row.split('.')[1] +
                  ' = ' +
                  facet_row[i],
              },
              anchor: 'y',
              autorange: true,
            }
          } else {
            this.layout[yAxisIndex].title = ''
            this.layout[yAxisIndex].title = {
              text:
                yAxisTitle +
                '<br>' +
                this.config.traces[0].facet_row.split('.')[1] +
                ' = ' +
                facet_row[i],
            }
            this.layout[yAxisIndex].anchor = 'y'
          }

          // Bottom: Axis Text
          if (this.layout[xAxisIndex] == undefined) {
            this.layout[xAxisIndex] = {
              title: {
                text:
                  xAxisTitle +
                  '<br>' +
                  this.config.traces[0].facet_col.split('.')[1] +
                  ' = ' +
                  facet_col[j],
              },
              anchor: 'x',
              autorange: true,
            }
          } else {
            this.layout[xAxisIndex].title = ''
            this.layout[xAxisIndex].title = {
              text:
                xAxisTitle +
                '<br>' +
                this.config.traces[0].facet_col.split('.')[1] +
                ' = ' +
                facet_col[j],
            }
            this.layout[xAxisIndex].anchor = 'x'
          }
          result.push(...filteredTraces)
        }
      }
      return result
    },

    // THis method groups the traces by the facet if more than one column and one row is defined in the traces
    groupTracesByFacetsForOneColumnOrRow(
      numberOfFacets: number,
      axisTitle: any,
      facets: any[],
      axis: string,
      facetObjectKey: string
    ) {
      // Extract text from the axis title
      if (axisTitle instanceof Object && 'text' in axisTitle) axisTitle = axisTitle.text

      const result = []
      for (let j = 0; j < numberOfFacets; j++) {
        const row = facets[j]
        const filteredTraces = []

        for (const trace of this.traces) {
          const filteredX = []

          for (let l = 0; l < trace[facetObjectKey].length; l++) {
            if (trace[facetObjectKey][l] === row) {
              filteredX.push(trace[axis == 'x' ? 'y' : 'x'][l])
            }
          }

          let filterTrace = { ...trace }

          // If the the plot is interactive (e. g. dropdown menu), the traces are displayed in one plot
          if (this.vizDetails.interactive == 'dropdown' && this.isUsingFacets) {
            filterTrace = {
              ...trace,
              x: axis == 'y' ? filteredX : trace.x,
              y: axis == 'x' ? filteredX : trace.y,
              xaxis: axis == 'y',
              yaxis: axis == 'y',
            }
          } else {
            filterTrace = {
              ...trace,
              x: axis == 'y' ? filteredX : trace.x,
              y: axis == 'x' ? filteredX : trace.y,
              xaxis: axis == 'y' ? 'x' : j > 0 ? 'x' + (j + 1) : 'x',
              yaxis: axis == 'y' ? (j > 0 ? 'y' + (j + 1) : 'y') : 'y',
            }
          }

          delete filterTrace.facet_row
          delete filterTrace.facet_col

          // showlegend
          if (this.vizDetails.interactive == 'dropdown' && this.isUsingFacets) {
            filterTrace.showlegend = true
          } else {
            filterTrace.showlegend = j === 0
          }

          // legendgroup
          filterTrace.legendgroup = filterTrace.group_name
          delete filterTrace.group_name
          filterTrace.facet_name = row

          const color = this.assignColor(filterTrace)
          filterTrace.marker = {
            color: color,
          }

          filteredTraces.push(filterTrace)
        }

        let label = this.config.traces[0][facetObjectKey].split('.')[1] + ' = ' + facets[j]

        // Insert an additional line break if the label is presumably too long
        // This does not known about the actual width of the plot
        if (numberOfFacets * label.length > 150 && axis == 'x') {
          const idx = label.indexOf(' = ')
          label = label.substring(0, idx) + '<br>' + label.substring(idx)
        }

        // Left: Axis Text
        const axisIndex = j === 0 ? axis + 'axis' : axis + 'axis' + (j + 1)
        if (this.layout[axisIndex] == undefined) {
          this.layout[axisIndex] = {
            title: {
              text: axisTitle + (axisTitle ? '<br>' : '') + label,
            },
          }
        } else {
          if (!this.vizDetails.interactive) {
            this.layout[axisIndex].title = ''
            this.layout[axisIndex].title = {
              text: axisTitle + (axisTitle ? '<br>' : '') + label,
            }
            this.layout[axisIndex].anchor = 'y'
          }
        }

        result.push(...filteredTraces)
      }
      return result
    },

    createMenus(mode: string) {
      if (mode == 'none') return

      const buttons: any[] = []

      // index of traces for each group
      const groups: { [key: string]: number[] } = {}

      const n = Object.values(this.traces).length

      // If the plot is a facetplot the dropdown menu should be created based on the facet_name. otherwise based on the group_name
      let dropdownLabel = 'group_name'
      if (this.vizDetails.interactive == 'dropdown' && this.isUsingFacets) {
        dropdownLabel = 'facet_name'
      }

      Object.values(this.traces).forEach((tr, idx) => {
        // restore the indended legend label
        if ('original_name' in tr) {
          tr.name = tr.original_name
        }

        if (!(tr[dropdownLabel] in groups)) groups[tr[dropdownLabel]] = []

        groups[tr[dropdownLabel]].push(idx)

        tr.visible = false
      })

      Object.entries(groups).forEach(kv => {
        const [group, ids] = kv

        const arr = new Array(n)
        arr.fill(false)

        for (const idx of ids as any[]) {
          arr[idx] = true
        }

        buttons.push({
          method: 'update',
          args: [{ visible: arr }],
          label: group,
        })
      })

      const first = Object.values(groups)[0]
      for (const idx of first) {
        this.traces[idx].visible = true
      }

      const layout: any = this.layout

      if (mode == 'dropdown') {
        const updatemenus = [
          {
            buttons: buttons,
            y: 1,
            yanchor: 'top',
          },
        ]
        layout.updatemenus = updatemenus
      } else if (mode == 'slider') {
        const sliders = [
          {
            pad: { t: 10 },
            currentvalue: {
              visible: false,
              xanchor: 'left',
              prefix: '',
            },
            steps: buttons,
          },
        ]
        layout.sliders = sliders
      }
    },

    updateTheme() {
      const colors = {
        paper_bgcolor: BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        plot_bgcolor: this.isUsingFacets
          ? BG_COLOR_PLOTLY_FACETS[this.globalState.colorScheme]
          : BG_COLOR_DASHBOARD[this.globalState.colorScheme],
        font: { color: this.globalState.isDarkMode ? '#cccccc' : '#444444' },
      }
      this.layout = Object.assign({}, this.layout, colors)
    },

    async getVizDetails() {
      if (this.config) {
        this.vizDetails = JSON.parse(JSON.stringify(this.config))

        this.$emit('title', this.vizDetails.title || 'Chart')
        if (this.vizDetails.traces) this.traces = this.vizDetails.traces
        return
      }

      // might be a project config:
      this.loadingText = 'Loading config...'
      const config = this.yamlConfig ?? ''
      const filename = config.indexOf('/') > -1 ? config : this.subfolder + '/' + config

      try {
        const text = await this.fileApi.getFileText(filename)
        const parsed = yaml.parse(text)
        this.vizDetails = parsed
        if (!this.vizDetails.title) this.vizDetails.title = 'Chart'
        this.$emit('title', this.vizDetails.title)
      } catch (e) {
        this.$emit('error', '' + e)
      }
    },

    async prepareData(): Promise<any> {
      await Promise.all(
        Object.entries(this.vizDetails.datasets).map(kv => {
          let [key, value] = kv

          // Dataset can be single string or full object
          if (typeof value === 'string') {
            value = {
              file: value,
            }
          }

          return this.loadDataset(key, value as DataSet)
        })
      )

      if (this.vizDetails.mergeDatasets && Object.values(this.vizDetails.datasets).length > 1) {
        this.vizDetails.datasets = {
          dataset: {
            name: 'dataset',
            file: 'none',
            data: this.mergeDatasets(Object.values(this.vizDetails.datasets)),
          },
        }
      }

      const datasets = Object.values(this.vizDetails.datasets) as DataSet[]
      const traces = [] as any[]
      const color = this.getColors(this.vizDetails, this.vizDetails.traces.length)

      this.vizDetails.traces.forEach((tr: any, trIdx: number) => {
        // Grouped traces won't be added without its group
        let grouped = false

        datasets.forEach((ds: DataSet) => {
          // This data uses array as name and needs to be split into multiple traces.
          const name = '$' + ds.name

          if (tr.name?.startsWith(name)) {
            const ref = tr.name.replace(name + '.', '')
            const groups = this.groupDataTable(ds.data as DataTable, ref)

            const n = Object.keys(groups).length
            const c = this.getColors(tr, n)

            Object.keys(groups).forEach((group, idx) => {
              const copy = JSON.parse(JSON.stringify(tr))

              copy.name = group
              copy.group_name = group
              this.recursiveCheckForTemplate(groups[group], copy, name)

              if (c) {
                if (!('marker' in tr)) copy.marker = {}
                copy.marker.color = c[idx]
              }
              traces.push(copy)
            })

            grouped = true
          } else {
            this.recursiveCheckForTemplate(ds.data as DataTable, tr, name)
          }
        })

        if (!grouped) {
          if (color) {
            // Assign marker
            if (!('marker' in tr)) tr.marker = {}

            tr.marker.color = color[trIdx]
          }
          traces.push(tr)
        }
      })

      this.vizDetails.traces = traces
    },

    async loadDataset(name: string, ds: DataSet): Promise<DataSet> {
      this.loadingText = 'Loading datasets...'

      try {
        const csvData = await this.myDataManager.getDataset(
          { dataset: ds.file },
          { highPrecision: true, subfolder: this.subfolder }
        )

        ds.data = csvData.allRows
        ds.name = name

        this.vizDetails.datasets[name] = ds
        this.transformData(ds)

        return ds
      } catch {
        this.$emit('error', 'Error loading ' + ds.file)
        return { file: name }
      }
    },

    getColors(conf: any, n: number): null | string[] {
      if ('colorRamp' in conf) {
        const ramp = typeof conf.colorRamp === 'string' ? { ramp: conf.colorRamp } : conf.colorRamp
        // Produce at least two color or strange effects happen
        return getColorRampHexCodes(ramp, n >= 2 ? n : 2)
      }

      return null
    },

    // Transform dataset if requested
    transformData(ds: DataSet) {
      if ('pivot' in ds) {
        this.pivot(
          ds.name as string,
          ds.data as DataTable,
          ds.pivot.exclude,
          ds.pivot.valuesTo,
          ds.pivot.namesTo
        )
      }

      // Rename values in pivot names column when pivot is used
      if ('rename' in ds && ds.pivot) {
        this.renameColumns(ds.data as DataTable, ds.rename, ds.pivot.namesTo || 'names')
      }

      if ('normalize' in ds) {
        this.normalizeColumns(ds.data as DataTable, ds.normalize)
      }

      if ('aggregate' in ds) {
        this.aggregateColumns(ds.data as DataTable, ds.aggregate.groupBy, ds.aggregate.target)
      }

      // Rename column headers when no pivot is used
      if ('rename' in ds && !ds.pivot) {
        this.renameHeaders(ds.data as DataTable, ds.rename)
      }

      if ('constant' in ds) {
        Object.entries(ds.constant!).forEach(kv => {
          const [column, value] = kv

          const values = new Array(Object.values(ds.data!)[0].values.length)
          values.fill(value)

          ds.data![column] = {
            name: column,
            values: values,
            type: 1,
          }
        })
      }
    },

    countOccurrences(array: Float64Array | Float32Array | any[]): { [key: string]: number } {
      let counts = {} as { [key: string]: number }
      array.forEach((el: any) => {
        counts[el] = counts[el] ? counts[el] + 1 : 1
      })

      return counts
    },

    // Group data table by values in columnName and generate multiple tables
    groupDataTable(dataTable: DataTable, columnName: string): { [key: string]: DataTable } {
      let obj = {} as { [key: string]: DataTable }

      let column = dataTable[columnName]

      let occ = this.countOccurrences(column.values)

      // Copy all columns and initialize as empty
      Object.entries(occ).forEach(kv => {
        const [group, n] = kv

        let dt = {} as DataTable

        // Shallow copy each column
        Object.entries(dataTable).forEach(kv => {
          const [key, column] = kv
          dt[key] = { ...column }

          let c = Object.getPrototypeOf(column.values).constructor

          // Construct array of same type
          dt[key].values = new c(n)
        })

        obj[group] = dt
      })

      for (var i = 0; i < dataTable[columnName].values.length; i++) {
        var group = dataTable[columnName].values[i]
        let target = obj[group]

        // determine index by subtracting the total for each group
        let idx = target[columnName].values.length - occ[group]--

        // Copy columns
        Object.entries(dataTable).forEach(kv => {
          const [key, column] = kv

          target[key].values[idx] = column.values[i]
        })
      }

      return obj
    },

    // Aggregate columns, currently only sum
    aggregateColumns(dataTable: DataTable, groupBy: any[], target: string) {
      const aggr = {} as any

      const n = dataTable[Object.keys(dataTable)[0]].values.length

      for (let i = 0; i < n; i++) {
        const k = groupBy.reduce((acc, column) => (acc += dataTable[column].values[i]), '')

        if (k in aggr) {
          aggr[k][target] += dataTable[target].values[i]
        } else {
          aggr[k] = Object.fromEntries(groupBy.map(column => [column, dataTable[column].values[i]]))
          aggr[k][target] = dataTable[target].values[i]
        }
      }

      // Remove the unneeded columns
      Object.keys(dataTable).forEach(column => {
        if (groupBy.indexOf(column) == -1 && column != target) delete dataTable[column]
      })

      // Initial empty arrays for final columns
      const values = Object.fromEntries([...groupBy, target].map(c => [c, []])) as any

      Object.values(aggr).forEach((a: any) => {
        Object.entries(a).forEach(cv => {
          values[cv[0]].push(cv[1])
        })
      })

      Object.entries(values).forEach(kv => {
        dataTable[kv[0]].values = kv[1] as any[]
      })
    },

    // Rename column headers by changing keys in the data table
    renameHeaders(dataTable: DataTable, rename: any) {
      if (!rename) return

      Object.entries(rename).forEach(([oldName, newName]) => {
        if (oldName in dataTable) {
          const column = dataTable[oldName]
          dataTable[newName as string] = { ...column, name: newName as string }
          delete dataTable[oldName]
        }
      })
    },

    renameColumns(dataTable: DataTable, rename: any, column: string) {
      // Rename values in one column
      if (rename && column in dataTable) {
        const values = dataTable[column].values
        for (let i = 0; i < values.length; i++) {
          if (values[i] in rename) {
            values[i] = rename[values[i]]
          }
        }
      }
    },

    normalizeColumns(dataTable: DataTable, normalize: any) {
      // normalize values
      if (normalize) {
        const { groupBy, target } = normalize

        const sumMap: { [key: string]: number } = {}

        for (let i = 0; i < dataTable[target].values.length; i++) {
          let key = ''
          for (let j = 0; j < groupBy.length; j++) {
            key += dataTable[groupBy[j]].values[i]
          }

          if (sumMap[key] === undefined) {
            sumMap[key] = dataTable[target].values[i]
          } else {
            sumMap[key] += dataTable[target].values[i]
          }
        }

        for (let i = 0; i < dataTable[target].values.length; i++) {
          let key = ''
          for (let j = 0; j < groupBy.length; j++) {
            key += dataTable[groupBy[j]].values[i]
          }

          dataTable[target].values[i] /= sumMap[key]
        }
      }
    },

    // Pivot wide to long format
    pivot(name: string, dataTable: DataTable, exclude: any[], valuesTo: string, namesTo: string) {
      // Columns to pivot
      const pivot = Object.keys(dataTable).filter(k => exclude.indexOf(k) == -1)

      exclude.forEach(column => {
        if (!(column in dataTable)) {
          this.$emit('error', `Pivot column ${column} not in ${name}`)
        }
      })

      // New data entries
      const columns = Object.fromEntries(exclude.map(c => [c, []]))

      // Pivot target arrays
      const values = [] as any[]
      const names = [] as any[]

      const n = dataTable[Object.keys(dataTable)[0]].values.length

      for (let i = 0; i < n; i++) {
        pivot.forEach(c => {
          exclude.forEach(c => columns[c].push(dataTable[c].values[i]))
          names.push(c)
          values.push(dataTable[c].values[i])
        })
      }

      exclude.forEach(c => {
        dataTable[c].values = columns[c]
      })
      dataTable[valuesTo] = { name: valuesTo, values: values } as DataTableColumn
      dataTable[namesTo] = { name: namesTo, values: names } as DataTableColumn
    },

    mergeDatasets(datasets: DataSet[]): DataTable {
      const data = {} as DataTable
      const first = datasets[0].data!

      Object.keys(first).forEach((column: string) => {
        const mapped = datasets.map(ds => {
          if (!(column in ds.data!)) {
            this.$emit('error', `Merged dataset ${ds.name} does not contain column ${column}`)
          }

          return ds.data![column].values
        })

        // Need to distinguish primitive arrays and standard ones
        let values
        if (
          first[column].values instanceof Float32Array ||
          first[column].values instanceof Float64Array
        )
          values = mergeTypedArrays(mapped as Array<any>[])
        else values = mapped.flat()

        data[column] = {
          name: column,
          type: first[column].type,
          values: values,
        }
      })

      return data
    },

    recursiveCheckForTemplate(dataTable: DataTable, object: any, template: string) {
      Object.entries(object).forEach(kv => {
        const [key, value] = kv
        if (typeof value === 'string') {
          // string stuff
          if (value.includes(template)) {
            const column = value.substring(value.indexOf('.') + 1)
            if (column in dataTable) {
              // Merge two columns into a multi index
              if (this.vizDetails.multiIndex && column in this.vizDetails.multiIndex) {
                // This creates a tuples of two arrays that has special handling in plotly
                object[key] = [
                  dataTable[column].values,
                  dataTable[this.vizDetails.multiIndex[column]].values,
                ]
              }
              // Normal way to add values into the column
              else object[key] = dataTable[column].values
            } else {
              this.$emit('error', `Column "${column}" not in ${Object.keys(dataTable)}`)
            }
          }
        } else if (Array.isArray(value)) {
          // array stuff
          if (typeof value[0] == 'object') {
            value.forEach(v => this.recursiveCheckForTemplate(dataTable, v, template))
          }
        } else if (typeof value == 'object') {
          this.recursiveCheckForTemplate(dataTable, value, template)
        }
      })
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.mycomponent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  // margin: 1rem;
}

.mycomponent.is-thumbnail {
  padding-top: 0;
  height: $thumbnailHeight;
}

.myplot {
  height: 100%;
  width: 100%;
  flex: 1;
  margin: 0 auto;
}

.myplot.is-thumbnail {
  padding: 0rem 0rem;
  margin: 0 0;
}
</style>
