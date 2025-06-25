import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'
import LegendStore from '@/js/LegendStore'
import Coords from '@/js/Coords'

import BaseLayer from './BaseLayer'
import LayerConfig from './PointsLayerConfig.vue'

export default class DataStore {
  deckData: null | {
    coordinates: Float32Array
    radius: Float32Array
    colors: Uint8ClampedArray
  }
  error: string
  layerOptions: any

  constructor(
    systemProps: {
      configFromDashboard: any
      datamanager: DashboardDataManager
      root: string
      subfolder: string
      thumbnail: boolean
      yamlConfig: string
    },
    layerOptions: any
  ) {
    this.layerOptions = layerOptions
    this.error = ''
    this.deckData = null
  }
}
