import { Deck } from '@deck.gl/core'
import { GeoJsonLayer } from '@deck.gl/layers'
import ColorString from 'color-string'

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

export default class PolygonsLayer extends BaseLayer {
  features: any[]
  datasets: { [id: string]: DataTable }
  error: string
  layerOptions: PolygonsDefinition
  deckData: {
    colors: Float32Array | String | Number[]
    outline: String | Number[]
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

  updateConfig(options: any) {
    console.log('NEW OPTIONS!', options)
    this.layerOptions = { ...options }

    // we're done if options set to 'delete'
    // system will remove this panel automatically
    if (options === 'delete') return

    try {
      this.assembleData()
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

  assembleData() {
    // data should already be loaded before this layer is mounted
    this.error = ''

    // if we already have shapes, then the user has tried to give us something.
    // if (!this.layerOptions.shapes) this.guessInitialParameters()

    // no features? We're done
    // if (!this.layerOptions.shapes) {
    //   this.features = []
    //   return
    // }

    if (this.layerOptions.shapes) {
      this.features = this.datamanager.getFeatureCollection(this.layerOptions.shapes)
    }

    if (this.layerOptions.metric?.startsWith('#')) {
      this.deckData.colors = ColorString.get.rgb(this.layerOptions.metric).slice(0, 3)
    }

    if (this.layerOptions.outline) {
      this.deckData.outline = ColorString.get.rgb(this.layerOptions.outline).slice(0, 3)
    }

    const numFeatures = this.features.length
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

    return new GeoJsonLayer({
      id: 'polygonLayer-' + this.getKey(),
      data: this.features,
      getFillColor: this.deckData.colors || [78, 121, 167, 255],
      getLineColor: this.deckData.outline,
      stroked: !!this.deckData.outline,
      filled: true,
      getLineWidth: 15,
      // lineWidthUnits: 'pixels',
      highlightColor: [255, 255, 255, 128],
      autoHighlight: true,
      opacity: 1,
      pickable: true,
      updateTriggers: {
        // getFillColor: fillColors,
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
