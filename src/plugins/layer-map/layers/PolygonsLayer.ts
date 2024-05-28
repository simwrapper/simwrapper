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
import { CircleRadiusDefinition } from '@/components/viz-configurator/CircleRadius.vue'
import { FillColorDefinition } from '@/components/viz-configurator/FillColors.vue'
import { DatasetDefinition } from '@/components/viz-configurator/AddDatasets.vue'
import LegendStore from '@/js/LegendStore'
import Coords from '@/js/Coords'

import BaseLayer from './BaseLayer'
import LayerConfig from './PolygonsLayerConfig.vue'

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default class PolygonsLayer extends BaseLayer {
  features: any[]
  datamanager: DashboardDataManager
  datasets: { [id: string]: DataTable }
  error: string
  layerOptions: any
  key: number

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
    this.key = Math.random() * 1e12
    this.datamanager = systemProps.datamanager
    this.datasets = systemProps.datasets
    this.features = []
    this.layerOptions = layerOptions
    this.error = ''
    this.assembleData()
  }

  getKey() {
    return this.key
  }

  configPanel() {
    return LayerConfig
  }

  updateConfig(options: any) {
    console.log('I GOT IT!', options)
    this.layerOptions = options

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
      const dataset = this.datasets[key]
      console.log('found dataset', dataset)
      if (dataset.features) {
        const df = dataset.features as unknown
        this.features = df as any[]
        break
      }
    }
  }

  assembleData() {
    // data should already be loaded before this layer is mounted

    this.error = ''

    this.guessInitialParameters()

    console.log({ features: this.features })
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
      id: 'polygonLayer-' + Math.random() * 1e12,
      data: this.features,
      getFillColor: [40, 90, 170, 255], // (d: any) => d.properties.color,
      getLineColor: [255, 255, 255, 255],
      stroked: true,
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
