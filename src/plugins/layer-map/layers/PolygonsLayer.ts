import { GeoJsonLayer } from '@deck.gl/layers'
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
import LayerConfig from './PolygonsLayerConfig.vue'

import ColorWorker from './PolygonsLayer.worker?worker'

// -----------------------------------------------
export interface PolygonsDefinition {
  shapes: string
  metric: string
  outline: string
  normalize: string
  diff?: string
  diffDatasets?: string[]
  relative?: boolean
  join?: string
  colorRamp?: Ramp
  fixedColors: string[]
}
// -----------------------------------------------

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default class PolygonsLayer extends BaseLayer {
  features: any[]
  datasets: { [id: string]: DataTable }
  error: string
  layerOptions: PolygonsDefinition
  deckData: {
    colors: Uint8ClampedArray | string | number[]
    outline: string | number[]
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
    this.deckData = { colors: '', outline: '' }
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
      this.features = this.datamanager.getFeatureCollection(this.layerOptions.shapes)
      // console.log(20, this.features)
    }

    if (this.layerOptions.metric == '@1') {
      this.deckData.colors = ''
    } else if (this.layerOptions.metric?.startsWith('#')) {
      this.deckData.colors = ColorString.get.rgb(this.layerOptions.metric).slice(0, 3)
    }

    if (this.layerOptions.outline) {
      this.deckData.outline = ColorString.get.rgb(this.layerOptions.outline).slice(0, 3)
    } else {
      this.deckData.outline = ''
    }

    // Generate colors from data
    if (this.layerOptions.metric.indexOf(':') > -1) {
      this.deckData.colors = await this.generateColors()
    }
  }

  updateStatus(text: string) {
    console.log('NEED TO SEND STATUS:', text)
  }

  async generateColors() {
    const colorWorker = Comlink.wrap(new ColorWorker()) as any

    let featureLookupValues
    let dataLookupValues

    const [m1, m2] = this.layerOptions.metric.split(':')
    const [n1, n2] = this.layerOptions.normalize.split(':')

    // Build joins if we need them
    if (this.layerOptions?.join && this.layerOptions?.join.indexOf(':') > -1) {
      const [join1, join2] = this.layerOptions.join.split(':')
      // shapes
      const shapeValues = this.datasets[this.layerOptions.shapes][join1].values
      featureLookupValues = await colorWorker.buildFeatureLookup(join1, shapeValues)

      const datasetCol = this.datasets[m1][join2] // datasetname:joincolumn

      const dataLookupColumn = await colorWorker.buildDatasetLookup({
        joinColumns: this.layerOptions.join,
        dataColumn: datasetCol,
      })

      dataLookupValues = dataLookupColumn.values

      // add/replace this dataset in the datamanager, with the new lookup column
      // this.datamanager.getDataset({dataset: })
      // dataTable[`@@${dataJoinColumn}`] = lookupColumn
      // this.myDataManager.setPreloadedDataset({
      //   key: this.datasetKeyToFilename[datasetId],
      //   dataTable,
      // })
    }

    const dataColumn = this.datasets[m1][m2]
    const normalColumn = n1 && n2 ? this.datasets[n1][n2] : null

    const colors: string | Uint8ClampedArray = await colorWorker.buildColorArray(
      {
        numFeatures: this.features.length,
        dataColumn,
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

    let fillColors = [78, 121, 167, 255] as any // default blue
    if (Array.isArray(this.deckData.colors)) fillColors = this.deckData.colors
    if (ArrayBuffer.isView(this.deckData.colors)) {
      fillColors = (feature: any, o: DeckObject) => {
        return [
          this.deckData.colors[o.index * 3 + 0], // r
          this.deckData.colors[o.index * 3 + 1], // g
          this.deckData.colors[o.index * 3 + 2], // b
          255, // no opacity, for now
        ]
      }
    }

    return new GeoJsonLayer({
      id: 'polygonLayer-' + this.getKey(),
      data: this.features,

      // data: {
      //   length: this.deckData.radius.length,
      //   attributes: {
      //     getPosition: { value: this.deckData.coordinates, size: 2 },
      //     getRadius: { value: this.deckData.radius, size: 1 },
      //     getFillColor: { value: this.deckData.colors, size: 3 },
      //   },
      // },

      getFillColor: fillColors,
      getLineColor: this.deckData.outline,
      stroked: !!this.deckData.outline,
      filled: !!this.deckData.colors,
      getLineWidth: 16,
      // lineWidthUnits: 'pixels',
      highlightColor: [255, 255, 255, 128],
      autoHighlight: true,
      opacity: 1,
      pickable: true,
      updateTriggers: {
        getFillColor: fillColors,
      },
      transitions: {
        getFillColor: 300,
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
