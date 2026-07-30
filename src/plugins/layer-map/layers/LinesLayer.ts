import GeojsonOffsetLayer from '@/layers/GeojsonOffsetLayer'
import ColorString from 'color-string'
import * as Comlink from 'comlink'

import globalStore from '@/store'
import {
  DataTable,
  DataTableColumn,
  DataType,
  FileSystemConfig,
  VisualizationPlugin,
  DEFAULT_PROJECTION,
  REACT_VIEW_HANDLES,
  Status,
} from '@/Globals'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import LegendStore from '@/js/LegendStore'
import Coords from '@/js/Coords'
import { getColorRampHexCodes, Ramp, Style } from '@/js/ColorsAndWidths'

import BaseLayer from './BaseLayer'
import LayerConfig from './LinesLayerConfig.vue'
import ColorWorker from './PolygonsLayer.worker?worker'
import ColorWidthSymbologizer from '@/js/ColorsAndWidths'

// -----------------------------------------------
export interface LinesDefinition {
  shapes: string
  width: string
  color: string
  normalize: string
  diff?: string
  diffDatasets?: string[]
  relative?: boolean
  join?: string
  colorRamp?: Ramp
  fixedColors: string[]
  scaleFactor: number
}
// -----------------------------------------------

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default class LinesLayer extends BaseLayer {
  features: any[]
  datasets: { [id: string]: DataTable }
  error: string
  layerOptions: LinesDefinition
  worker: any
  deckData: {
    colors: Uint8ClampedArray | string | number[]
    widths: Float32Array | string
  }

  constructor(
    systemProps: {
      configFromDashboard: any
      datamanager: DashboardDataManager
      datasets: { [id: string]: DataTable }
      root: string
      subfolder: string
      thumbnail: boolean
      yamlConfig: string
      emitter: any
    },
    layerOptions: any
  ) {
    super(systemProps)

    this.datasets = systemProps.datasets
    this.features = []
    this.layerOptions = layerOptions
    this.error = ''
    this.deckData = { colors: '', widths: '' }
  }

  configPanel() {
    return LayerConfig
  }

  async updateConfig(options: any) {
    console.log('NEW OPTIONS!', options)
    this.layerOptions = { ...options }

    // we're done if options set to 'delete'
    // system will remove this panel automatically
    if (options === 'delete') return

    try {
      await this.assembleData()
    } catch (e) {
      console.error(e)
      this.features = []
      this.error = '' + e
    }
  }

  guessInitialParameters() {
    const keys = Object.keys(this.datasets)

    for (const key of keys) {
      const features = this.datamanager.getFeatureCollection(key)
      if (features) {
        this.layerOptions.shapes = key
        break
      }
    }
  }

  async assembleData() {
    // data should already be loaded before this layer is mounted
    this.error = ''

    // if we already have shapes, then the user has tried to give us something.
    if (!this.layerOptions.shapes) this.guessInitialParameters()

    // no features? We're done
    // if (!this.layerOptions.shapes) {
    //   this.features = []
    //   return
    // }

    if (this.layerOptions.shapes) {
      this.features = this.datamanager.getFeatureCollection(this.layerOptions.shapes) || []
    }

    const numFeatures = this.features.length

    // width
    let width = new Float32Array(numFeatures).fill(1)

    try {
      // simple constant width
      const simpleWidth = parseInt(this.layerOptions?.width, 10)
      if (Number.isFinite(simpleWidth)) {
        width.fill(simpleWidth)
      }

      // data based width
      const key = this.layerOptions.width?.substring(0, this.layerOptions.width?.indexOf(':'))
      const spec = this.layerOptions.width?.substring(1 + this.layerOptions.width?.indexOf(':'))
      const joinKey = this.layerOptions.join?.substring(1 + this.layerOptions.join?.indexOf(':'))

      await this.buildLookup(key)

      if (key && spec in this.datasets[key]) {
        const { array, legend, calculatedValues } = ColorWidthSymbologizer.getWidthsForDataColumn({
          numFeatures: this.features.length,
          data: this.datasets[key][spec],
          lookup: this.datasets[key][`@@${joinKey}`],
          options: this.layerOptions,
        })

        if (calculatedValues) width = calculatedValues

        // width.forEach((_: any, i: number) => (width[i] = 10 * this.datasets[key][spec].values[i]))
      }
    } catch (e) {
      console.error(e)
    }

    this.deckData.widths = width

    // simple fill color
    if (this.layerOptions.color == '@1') {
      this.deckData.colors = ''
    } else if (this.layerOptions.color?.startsWith('#')) {
      this.deckData.colors = ColorString.get.rgb(this.layerOptions.color).slice(0, 3)
    }

    // Generate colors from data
    if (this.layerOptions.color.indexOf(':') > -1) {
      this.deckData.colors = await this.generateColors()
    }
  }

  updateStatus(text: string) {
    console.log('NEED TO SEND STATUS:', text)
  }

  async buildLookup(m1key: string) {
    if (!this.worker) this.worker = Comlink.wrap(new ColorWorker()) as any

    let featureLookupValues

    if (this.layerOptions?.join && this.layerOptions?.join.indexOf(':') > -1) {
      const [join1, join2] = this.layerOptions.join.split(':')
      // shapes
      const shapeValues = this.datasets[this.layerOptions.shapes][join1].values
      featureLookupValues = await this.worker.buildFeatureLookup(join1, shapeValues)

      const dset = this.datasets[m1key]
      const datasetCol = dset[join2] // datasetname:joincolumn

      const dataLookupColumn: DataTableColumn = await this.worker.buildDatasetLookup({
        joinColumns: this.layerOptions.join,
        dataColumn: datasetCol,
      })

      // dataLookupValues = dataLookupColumn.values

      // add/replace this dataset in the datamanager, with the new lookup column
      const dataTable = this.datasets[m1key]
      dataTable[`@@${join2}`] = dataLookupColumn
      this.datamanager.setPreloadedDataset({
        key: m1key,
        dataTable,
      })
    }
  }

  async generateColors() {
    if (!this.worker) this.worker = Comlink.wrap(new ColorWorker()) as any

    let featureLookupValues
    let dataLookupValues

    const [m1, m2] = this.layerOptions.color.split(':') || []
    const [n1, n2] = this.layerOptions.normalize?.split(':') || []
    const [d1, d2] = this.layerOptions.diff?.split(':') || []

    // Build joins if we need them
    if (this.layerOptions?.join && this.layerOptions?.join.indexOf(':') > -1) {
      const [join1, join2] = this.layerOptions.join.split(':')
      // shapes
      const shapeValues = this.datasets[this.layerOptions.shapes][join1].values
      featureLookupValues = await this.worker.buildFeatureLookup(join1, shapeValues)

      const datasetCol = this.datasets[m1][join2] // datasetname:joincolumn

      const dataLookupColumn: DataTableColumn = await this.worker.buildDatasetLookup({
        joinColumns: this.layerOptions.join,
        dataColumn: datasetCol,
      })

      // dataLookupValues = dataLookupColumn.values
      console.log({ dataLookupColumn })

      // add/replace this dataset in the datamanager, with the new lookup column
      const dataTable = this.datasets[m1]
      dataTable[`@@${join2}`] = dataLookupColumn
      this.datamanager.setPreloadedDataset({
        key: m1,
        dataTable,
      })
    }

    const dataColumn = this.datasets[m1][m2]
    const normalColumn = n1 && n2 ? this.datasets[n1][n2] : null
    const diffColumn = d1 && d2 ? this.datasets[d1][d2] : null

    console.log('ABOUT TO COLOR', { dataColumn, options: this.layerOptions })
    const colors: string | Uint8ClampedArray = await this.worker.buildColorArray(
      {
        numFeatures: this.features.length,
        dataColumn,
        diffColumn,
        normalColumn,
        options: this.layerOptions,
        datasetIds: Object.keys(this.datasets),
      },
      Comlink.proxy(this.updateStatus)
    )
    return colors
  }

  deckLayer() {
    const getMapBounds = (viewport: any) => {
      const bounds = viewport.getBounds()
      return {
        west: bounds[0][0],
        south: bounds[0][1],
        east: bounds[1][0],
        north: bounds[1][1],
      }
    }

    if (this.error) throw Error(this.error)

    let widthScale =
      this.layerOptions.scaleFactor == 0
        ? 1e-6
        : 1 / Math.pow(2, (100 - this.layerOptions.scaleFactor) / 5 - 7.0)
    if (Number.isNaN(widthScale)) widthScale = 1

    let lineWidths = (_: any, o: DeckObject) => {
      return this.deckData.widths[o.index]
    }

    // COLORS

    let lineColors = [78, 121, 167, 255] as any // default blue
    if (Array.isArray(this.deckData.colors)) lineColors = this.deckData.colors
    if (ArrayBuffer.isView(this.deckData.colors)) {
      lineColors = (feature: any, o: DeckObject) => {
        return [
          this.deckData.colors[o.index * 3 + 0], // r
          this.deckData.colors[o.index * 3 + 1], // g
          this.deckData.colors[o.index * 3 + 2], // b
          255, // no opacity, for now
        ]
      }
    }

    return new GeojsonOffsetLayer({
      id: 'lineLayer-' + this.getKey(),
      // data: this.features,

      data: this.features, // this.deckData.radius.length,

      getLineColor: lineColors,
      getLineWidth: lineWidths, // this.deckData.widths,
      lineWidthScale: widthScale,
      // lineWidthUnits: 'pixels',
      highlightColor: [255, 255, 255, 128],
      autoHighlight: true,
      opacity: 1,
      pickable: true,
      updateTriggers: {
        getLineColor: lineColors,
        getLineWidth: lineWidths,
      },
      transitions: {
        getLineColor: 300,
        getLineWidth: 300,
      },
      parameters: { depthTest: false },
      glOptions: {
        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
        preserveDrawingBuffer: false,
        fp64: false,
      },
      // filter shapes
      // extensions: [new DataFilterExtension({ filterSize: 1 })],
      // filterRange: [0, 1], // set filter to -1 to filter element out
      // getFilterValue: (_: any, o: DeckObject) => {
      //   return featureFilter[o.index]
      // },
    }) as any
  }
}
