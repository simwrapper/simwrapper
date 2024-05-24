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

import BaseLayer from './BaseLayer'
import LayerConfig from './PointsLayerConfig.vue'

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default class PointsLayer extends BaseLayer {
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

  assembleData() {
    // data should already be loaded before this layer is mounted

    this.error = ''

    // position
    const datasetKey = this.layerOptions.lon?.substring(0, this.layerOptions.lon.indexOf(':'))
    const lonCol = this.layerOptions.lon?.substring(1 + this.layerOptions.lon.indexOf(':'))
    const latCol = this.layerOptions.lat?.substring(1 + this.layerOptions.lat.indexOf(':'))
    const dataset = this.datasets[datasetKey]

    try {
      if (!dataset) throw Error(`Point layer cannot load data, are columns correct?`)

      if (!(lonCol in dataset))
        throw Error(`Dataset '${datasetKey}' does not contain column '${lonCol}'`)

      if (!(latCol in dataset))
        throw Error(`Dataset '${datasetKey}' does not contain column '${latCol}'`)
    } catch (e) {
      this.features = []
      return
    }

    const lon = dataset[lonCol].values
    const lat = dataset[latCol].values

    // radius
    const radiusKey = this.layerOptions.radius?.substring(0, this.layerOptions.radius.indexOf(':'))
    const radiusSpec = this.layerOptions.radius?.substring(
      1 + this.layerOptions.radius.indexOf(':')
    )
    let radius = 3 as any
    if (radiusKey && radiusSpec in this.datasets[radiusKey]) {
      radius = this.datasets[radiusKey][radiusSpec].values
    }

    // color
    let color = 'blue' as any
    if (typeof this.layerOptions.color == 'string') {
      const colorKey = this.layerOptions.color.substring(0, this.layerOptions.color.indexOf(':'))
      const colorCol = this.layerOptions.color.substring(1 + this.layerOptions.color.indexOf(':'))
      if (colorKey && colorCol in this.datasets[colorKey]) {
        color = this.datasets[colorKey][colorCol].values
      }
    }

    // build geojson
    this.features = []

    for (let i = 0; i < lon.length; i++) {
      const c = ColorString.get.rgb(color[i])
      this.features.push({
        geometry: { type: 'Point', coordinates: [lon[i], lat[i]] },
        properties: { radius: radius[i], color: c ? c.slice(0, 3) : [64, 64, 64, 64] },
      })
    }
    console.log({ features: this.features })
  }

  deckLayer() {
    if (this.error) throw Error(this.error)

    return new GeoJsonLayer({
      id: 'pointLayer-' + Math.random() * 1e12,
      data: this.features,
      getFillColor: (d: any) => d.properties.color,
      getPointRadius: (d: any) => d.properties.radius,
      autoHighlight: true,
      highlightColor: [255, 0, 224],
      opacity: 1.0,
      pickable: true,
      pointRadiusUnits: 'pixels',
      // pointRadiusMinPixels: 2,
      // pointRadiusMaxPixels: 50,
      // useDevicePixels: isTakingScreenshot,

      // updateTriggers: {
      //   getFillColor: fillColors,
      //   getPointRadius: pointRadii,
      // },
      transitions: {
        getFillColor: 300,
        getPointRadius: 300,
      },
      parameters: { depthTest: false },
      glOptions: {
        // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
        preserveDrawingBuffer: true,
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
