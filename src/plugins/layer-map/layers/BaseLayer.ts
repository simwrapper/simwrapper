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

import DashboardDataManager, { FilterDefinition, checkFilterValue } from '@/js/DashboardDataManager'

export default abstract class BaseLayer {
  key: number
  datamanager: DashboardDataManager
  root: string
  subfolder: string

  constructor(props: {
    configFromDashboard: any
    datamanager: DashboardDataManager
    root: string
    subfolder: string
    thumbnail: boolean
    yamlConfig: string
  }) {
    this.key = Math.random() * 1e12
    this.datamanager = props.datamanager
    this.root = props.root
    this.subfolder = props.subfolder
  }

  public getKey() {
    return this.key
  }

  // public getRoot() {
  //   return this.root
  // }

  // public getSubfolder() {
  //   return this.subfolder
  // }

  // public dataManager() {
  //   return this.datamanager
  // }

  abstract deckLayer(): any
  abstract assembleData(): any
  abstract configPanel(): any
  abstract updateConfig(options: any): any
}
