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

import { FileSystemConfig } from '@/Globals'
import globalStore from '@/store'
import HTTPFileSystem from './HTTPFileSystem'

import DataFetcherWorker from '@/workers/DataFetcher.worker.ts?worker'

export default class DashboardDataManager {
  constructor(...args: string[]) {
    // hello
    this.root = args.length ? args[0] : ''
    this.subfolder = args.length ? args[1] : ''
    this.fileApi = this.getFileSystem(this.root)
  }

  public async getFilteredDataset(config: { dataset: string; groupBy?: string; value?: string }) {
    const rows = this.datasets[config.dataset].filteredRows
    if (!rows) return { filteredRows: null }

    // group the rows as needed
    let bars: any = {}

    if (config.value && config.groupBy) {
      const columnValues = config.value
      const columnGroups = config.groupBy
      bars = rollup(
        rows,
        (v) => v.reduce((a, b) => a + b[columnValues], 0),
        (d: any) => d[columnGroups] // group-by
      )
    } else {
      // TODO need to handle non-value, non-group here
    }
    const x = Array.from(bars.keys())
    const y = Array.from(bars.values())

    // filter the rows, too

    return { filteredRows: { x, y } }
  }

  public async getDataset(config: { dataset: string; groupBy?: string; value?: string }) {
    // first, get the dataset
    if (!this.datasets[config.dataset]) {
      console.log('load:', config.dataset)

      // allRows immediately returns a Promise<any[], which we wait on so that
      // multiple charts don't all try to fetch the dataset individually
      this.datasets[config.dataset] = {
        rows: this.fetchDataset(config),
        filteredRows: null,
        activeFilters: {},
        filterListeners: new Set(),
      }
    }
    const allRows = await this.datasets[config.dataset].rows

    // group the rows as needed
    let bars: any = {}

    if (config.value && config.groupBy) {
      const columnValues = config.value
      const columnGroups = config.groupBy
      bars = rollup(
        allRows,
        (v) => v.reduce((a, b) => a + b[columnValues], 0),
        (d: any) => d[columnGroups] // group-by
      )
    } else {
      // TODO need to handle non-value, non-group here
    }
    const x = Array.from(bars.keys())
    const y = Array.from(bars.values())

    return { allRows: { x, y } }
  }

  public setFilter(dataset: string, column: string, value: any) {
    console.log('Filtering dataset:', dataset)

    const allFilters = this.datasets[dataset].activeFilters
    if (allFilters[column] !== undefined && allFilters[column] === value) {
      delete allFilters[column]
    } else {
      allFilters[column] = value
    }
    this.datasets[dataset].activeFilters = allFilters

    this.updateFilters(dataset) // this is async
  }

  public addFilterListener(config: { dataset: string }, listener: any) {
    this.datasets[config.dataset].filterListeners.add(listener)
  }

  public removeFilterListener(config: { dataset: string }, listener: any) {
    this.datasets[config.dataset].filterListeners.delete(listener)
  }

  public clearCache() {
    this.datasets = {}
  }

  // ---- PRIVATE STUFFS -----------------------

  private async updateFilters(datasetId: string) {
    const dataset = this.datasets[datasetId]

    if (!Object.keys(dataset.activeFilters).length) {
      dataset.filteredRows = null
    } else {
      const allRows = await dataset.rows

      let filteredRows = allRows
      for (const [column, value] of Object.entries(dataset.activeFilters)) {
        console.log('filtering:', column, value)
        filteredRows = filteredRows.filter((row) => row[column] === value)
      }
      dataset.filteredRows = filteredRows
    }
    this.notifyListeners(datasetId)
  }

  private notifyListeners(datasetId: string) {
    const dataset = this.datasets[datasetId]
    for (const notifyListener of dataset.filterListeners) {
      notifyListener()
    }
  }

  // private thread!: any
  private files: any[] = []

  private async fetchDataset(config: { dataset: string }) {
    if (!this.files.length) {
      const { files } = await new HTTPFileSystem(this.fileApi).getDirectory(this.subfolder)
      this.files = files
    }

    return new Promise<any[]>((resolve, reject) => {
      try {
        const thread = new DataFetcherWorker()
        thread.postMessage({
          fileSystemConfig: this.fileApi,
          subfolder: this.subfolder,
          files: this.files,
          config: config,
        })

        thread.onmessage = (e) => {
          resolve(e.data)
        }
      } catch (err) {
        reject(err)
      }
    })
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

  private subfolder = ''
  private root = ''
  private fileApi: FileSystemConfig

  private datasets: {
    [id: string]: {
      rows: Promise<any[]>
      filteredRows: any[] | null
      activeFilters: { [column: string]: any }
      filterListeners: Set<any>
    }
  } = {}
}
