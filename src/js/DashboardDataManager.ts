/**
 * DashboardDataManager: this class loads, caches, and filters CSV and XML datasets
 * for use by dashboard charts and maps. Loosely based on the VizWit system
 * (see http://vizwit.io/) but we don't have a Carto database so all of the data
 * is stored internally in this class.
 *
 * Each tabbed dashboard should instantiate this class once, and destroy it when the dashboard
 * is closed. Datasets can be big, we don't want them to stick around forever!
 *
 * Data queries will return -both- the full dataset AND a filtered dataset. That way
 * the filtered data can be visually layered on top of the full data.
 */

import { rollup } from 'd3-array'
import { Worker, spawn, Thread } from 'threads'

import { FileSystemConfig } from '@/Globals'
import globalStore from '@/store'
import HTTPFileSystem from './HTTPFileSystem'

export default class DashboardDataManager {
  constructor(...args: string[]) {
    // hello
    this.root = args.length ? args[0] : ''
    this.subfolder = args.length ? args[1] : ''
    this.fileApi = this.getFileSystem(this.root)
  }

  public async getDataset(config: { dataset: string; groupBy?: string; value?: string }) {
    console.log('getDataset', config)

    let dataframe: any[] = []

    // first, get the dataset
    if (!this.dataCache[config.dataset]) {
      console.log('fetch:', config.dataset)
      this.dataCache[config.dataset] = this.fetchDataset(config)
    }
    dataframe = await this.dataCache[config.dataset]

    // group the rows as needed
    let bars: any = {}

    if (config.value && config.groupBy) {
      const columnValues = config.value
      const columnGroups = config.groupBy
      bars = rollup(
        dataframe,
        v => v.reduce((a, b) => a + b[columnValues], 0),
        (d: any) => d[columnGroups] // group-by
      )
    } else {
      // TODO need to handle non-value, non-group here
    }
    const x = Array.from(bars.keys())
    const y = Array.from(bars.values())

    return { fullData: { x, y }, filteredData: {} }
  }

  public setFilter(filter: string) {}

  public clearCache() {
    this.dataCache = {}
  }

  // ---- PRIVATE STUFFS -----------------------
  private thread!: any
  private files: any[] = []

  private async fetchDataset(config: { dataset: string; groupBy?: string; value?: string }) {
    if (!this.files.length) {
      const { files } = await new HTTPFileSystem(this.fileApi).getDirectory(this.subfolder)
      this.files = files
    }

    if (this.thread) Thread.terminate(this.thread)
    this.thread = await spawn(new Worker('../workers/DataFetcher.thread'))

    try {
      const data = await this.thread.fetchData({
        fileSystemConfig: this.fileApi,
        subfolder: this.subfolder,
        files: this.files,
        config: config,
      })

      return data
    } catch (e) {
      const message = '' + e
      console.log(message)
    } finally {
      Thread.terminate(this.thread)
    }
    return []
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      console.error('DDM: no such project')
      throw Error
    }
    return svnProject[0]
  }

  private dataCache: { [dataset: string]: Promise<any> | any[] } = {}

  private filteredDataCache: { [id: string]: any[] } = {}
  private subfolder = ''
  private root = ''
  private fileApi: FileSystemConfig
}
