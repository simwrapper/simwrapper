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

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default abstract class BaseLayer {
  data: any[]

  constructor(props: {
    configFromDashboard: any
    datamanager: DashboardDataManager
    root: string
    subfolder: string
    thumbnail: boolean
    yamlConfig: string
  }) {
    this.data = []
  }

  abstract deckLayer(): any
}
