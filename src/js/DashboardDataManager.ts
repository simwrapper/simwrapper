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

import { DataTable, DataTableColumn, FileSystemConfig, Status } from '@/Globals'
import globalStore from '@/store'
import { findMatchingGlobInFiles } from '@/js/util'
import HTTPFileSystem from './HTTPFileSystem'

import DataFetcherWorker from '@/workers/DataFetcher.worker.ts?worker'
import RoadNetworkLoader from '@/workers/RoadNetworkLoader.worker.ts?worker'

interface configuration {
  dataset: string
  groupBy?: string
  value?: string
  usedCol?: string[]
  columns?: string[]
  ignoreColumns?: any[]
  skipFirstRow?: boolean
  useLastRow?: boolean
  x?: string
}

export interface FilterDefinition {
  dataset: string
  column: string
  invert: boolean
  value: any
}

export interface NetworkLinks {
  source: Float32Array
  dest: Float32Array
  linkIds: any[]
}

export default class DashboardDataManager {
  constructor(...args: string[]) {
    // hello
    this.root = args.length ? args[0] : ''
    this.subfolder = args.length ? args[1] : ''
    this.fileApi = this.getFileSystem(this.root)
  }

  public kill() {
    for (const worker of this.threads) worker.terminate()
  }

  public async getFilteredDataset(config: { dataset: string }) {
    const filteredRows = this.datasets[config.dataset].filteredRows
    return { filteredRows }
  }

  public async OLDgetFiltered(config: { dataset: string; groupBy?: string; value?: string }) {
    const rows = this.datasets[config.dataset].filteredRows
    if (!rows) return { filteredRows: null }

    // group the rows as needed
    let bars: any = {}

    if (config.value && config.groupBy) {
      const columnValues = config.value
      const columnGroups = config.groupBy
      bars = rollup(
        rows,
        v => v.reduce((a, b) => a + b[columnValues], 0),
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

  /**
   *
   * @param config the configuration params from the YAML file. Must include dataset, and other optional parameters as needed by the viz
   * @returns object with {x,y} or {allRows[]}
   */
  public async getDataset(config: configuration) {
    try {
      // first, get the dataset
      if (!this.datasets[config.dataset]) {
        console.log('load:', config.dataset)

        // allRows immediately returns a Promise<>, which we wait on so that
        // multiple charts don't all try to fetch the dataset individually
        this.datasets[config.dataset] = {
          dataset: this.fetchDataset(config),
          activeFilters: {},
          filteredRows: null,
          filterListeners: new Set(),
        }
      }

      let myDataset = await this.datasets[config.dataset].dataset

      let allRows = { ...myDataset }

      // remove ignored columns
      if (config.ignoreColumns) {
        config.ignoreColumns.forEach(column => {
          delete allRows[column]
        })
      }

      // if useLastRow, do that
      if (config.useLastRow) {
        Object.keys(allRows).forEach(colName => {
          const values = myDataset[colName].values
          allRows[colName] = values[values.length - 1]
        })
      }

      return { allRows }
    } catch (e) {
      // const message = '' + e
      return { allRows: {} }
    }
  }

  /**
   * Convert features array from GeoJSONs and Shapefiles into DataTable
   * @param filename
   * @param featureProperties array of feature objects
   */
  public setFeatureProperties(fullpath: string, featureProperties: any[], config: any) {
    const key = fullpath.substring(fullpath.lastIndexOf('/') + 1)

    // merge key with keep/drop params (etc)
    let fullConfig = { dataset: key }
    if ('string' !== typeof config) fullConfig = Object.assign(fullConfig, config)

    this.datasets[key] = {
      activeFilters: {},
      filteredRows: null,
      filterListeners: new Set(),
      dataset: new Promise<DataTable>((resolve, reject) => {
        const thread = new DataFetcherWorker()
        this.threads.push(thread)
        try {
          thread.postMessage({ config: fullConfig, featureProperties })

          thread.onmessage = e => {
            thread.terminate()
            if (e.data.error) {
              console.log(e.data.error)
              globalStore.commit('setStatus', {
                type: Status.ERROR,
                msg: `Problem loading properties in ${fullpath}`,
                desc: 'File loaded from storage, but properties table could not be parsed',
              })
              reject()
            }
            resolve(e.data)
          }
        } catch (err) {
          thread.terminate()
          console.error(err)
          reject(err)
        }
      }),
    }
    // this is a promise:
    return this.datasets[key].dataset
  }

  public setPreloadedDataset(props: { key: string; dataTable: DataTable; filename: string }) {
    this.datasets[props.filename] = {
      dataset: new Promise<DataTable>((resolve, reject) => {
        resolve(props.dataTable)
      }),
      activeFilters: {},
      filteredRows: null,
      filterListeners: new Set(),
    }
  }

  /**
   *
   * @param path Full path/filename to the network file
   * @returns network (format TBA)
   */
  public async getRoadNetwork(filename: string, subfolder: string, vizDetails: any) {
    const path = `/${subfolder}/${filename}`

    // Get the dataset the first time it is requested
    if (!this.networks[path]) {
      console.log('load network:', path)

      // get folder
      let folder =
        path.indexOf('/') > -1 ? path.substring(0, path.lastIndexOf('/')) : this.subfolder

      // get file path search pattern
      const { files } = await new HTTPFileSystem(this.fileApi).getDirectory(folder)
      let pattern = path.indexOf('/') === -1 ? path : path.substring(path.lastIndexOf('/') + 1)
      const match = findMatchingGlobInFiles(files, pattern)

      if (match.length === 1) {
        // fetchNetwork immediately returns a Promise<>, which we wait on so that
        // multiple views don't all try to fetch the network individually
        this.networks[path] = this.fetchNetwork(`${folder}/${match[0]}`, vizDetails)
      } else {
        throw Error('File not found: ' + path)
      }
    }

    // wait for the worker to provide the network
    let network = await this.networks[path]
    return network
  }

  // /**
  //  * Load simple dataset without grouping/filtering
  //  * @param allRows Each row
  //  * @returns TBD
  //  */
  // public loadSimple(config: configuration, allRows: any[]) {
  //   // Simple requires x and columns/usedCol
  //   if (!config.x || (!config.columns && !config.usedCol)) {
  //     throw Error('Config requires "x" and "columns" parameters')
  //   }

  //   var useOwnNames = false

  //   const x = [] as any[]

  //   for (var i = 0; i < allRows.length; i++) {
  //     if (i == 0 && config.skipFirstRow) {
  //     } else {
  //       x.push(allRows[i][config.x])
  //     }
  //   }

  //   const columns = config.columns || config.usedCol || []

  //   for (let i = 0; i < columns.length; i++) {
  //     const name = columns[i]
  //     let legendName = ''
  //     if (columns[i] !== 'undefined') {
  //       if (useOwnNames) {
  //         legendName = this.config.legendTitles[i]
  //       } else {
  //         legendName = name
  //       }
  //       const value = []
  //       for (var j = 0; j < this.dataRows.length; j++) {
  //         if (j == 0 && this.config.skipFirstRow) {
  //         } else {
  //           value.push(this.dataRows[j][name])
  //         }
  //       }
  //       this.data.push({
  //         x: x,
  //         y: value,
  //         name: legendName,
  //         type: 'bar',
  //         textinfo: 'label+percent',
  //         textposition: 'inside',
  //         automargin: true,
  //       })
  //     }
  //   }
  // }

  public setFilter(filter: FilterDefinition) {
    const { dataset, column, value, invert } = filter

    console.log('> setFilter', dataset, column, value)
    // Filter might be single or an array; make it an array.
    const values = Array.isArray(value) ? value : [value]
    const allFilters = this.datasets[dataset].activeFilters
    // a second click on a filter means REMOVE this filter.
    // if (allFilters[column] !== undefined && allFilters[column] === values) {
    //   console.log('A1', allFilters[column])
    //   delete allFilters[column]
    // } else
    if (!values.length) {
      delete allFilters[column]
    } else {
      allFilters[column] = { values, invert }
    }
    this.updateFilters(dataset) // this is async
  }

  public addFilterListener(config: { dataset: string }, listener: any) {
    const selectedDataset = this.datasets[config.dataset]
    if (!selectedDataset) throw Error('No dataset named: ' + config.dataset)

    console.log(22, config.dataset, this.datasets[config.dataset])
    this.datasets[config.dataset].filterListeners.add(listener)
  }

  public removeFilterListener(config: { dataset: string }, listener: any) {
    try {
      if (this.datasets[config.dataset].filterListeners) {
        this.datasets[config.dataset].filterListeners.delete(listener)
      }
    } catch (e) {
      // doesn't matter
    }
  }

  public clearCache() {
    this.kill() // any stragglers must die
    this.datasets = {}
  }

  // ---- PRIVATE STUFFS -----------------------

  private async updateFilters(datasetId: string) {
    console.log('> updateFilters ', datasetId)
    const metaData = this.datasets[datasetId]
    console.log({ metaData })

    if (!Object.keys(metaData.activeFilters).length) {
      console.log('no keys')
      metaData.filteredRows = null
      this.notifyListeners(datasetId)
      return
    }

    // Let's do this the stupid way first, and make it better once we get it working.
    const dataset = await metaData.dataset
    const allColumns = Object.keys(dataset)
    let filteredRows: any[] = []

    const numberOfRowsInFullDataset = dataset[allColumns[0]].values.length
    console.log('FILTERS', metaData.activeFilters)
    console.log('NROWS', numberOfRowsInFullDataset)

    const ltgt = /^(<|>)/ // starts with < or >

    for (const [column, spec] of Object.entries(metaData.activeFilters)) {
      const dataColumn = dataset[column]
      if (spec.values[0] === undefined || spec.values[0] === '') {
        globalStore.commit('error', datasetId + ': filter error')
      }

      // prep LT/GT
      if (ltgt.test(spec.values[0])) {
        if (spec.values[0].startsWith('<=')) {
          spec.conditional = '<='
          spec.values[0] = spec.values[0].substring(2).trim()
        } else if (spec.values[0].startsWith('>=')) {
          spec.conditional = '>='
          spec.values[0] = spec.values[0].substring(2).trim()
        } else if (spec.values[0].startsWith('<')) {
          spec.conditional = '<'
          spec.values[0] = spec.values[0].substring(1).trim()
        } else if (spec.values[0].startsWith('>')) {
          spec.conditional = '>'
          spec.values[0] = spec.values[0].substring(1).trim()
        }
      }

      // update every row
      for (let i = 0; i < numberOfRowsInFullDataset; i++) {
        if (this.checkFilterValue(spec, dataColumn.values[i])) {
          const row = {} as any
          allColumns.forEach(col => (row[col] = dataset[col].values[i]))
          filteredRows.push(row)
        }
      }
    }

    console.log('FROWS', filteredRows)
    metaData.filteredRows = filteredRows
    this.notifyListeners(datasetId)
  }

  private checkFilterValue(
    spec: { conditional: string; invert: boolean; values: any[] },
    elementValue: any
  ) {
    // lookup closure functions for < > <= >=
    const conditionals: any = {
      '<': () => {
        return elementValue < spec.values[0]
      },
      '<=': () => {
        return elementValue <= spec.values[0]
      },
      '>': () => {
        return elementValue > spec.values[0]
      },
      '>=': () => {
        return elementValue >= spec.values[0]
      },
    }

    let isValueInFilterSpec: boolean

    if (spec.conditional) {
      isValueInFilterSpec = conditionals[spec.conditional]()
    } else {
      isValueInFilterSpec = spec.values.includes(elementValue)
    }

    if (spec.invert) return !isValueInFilterSpec
    return isValueInFilterSpec
  }

  private notifyListeners(datasetId: string) {
    const dataset = this.datasets[datasetId]
    for (const notifyListener of dataset.filterListeners) {
      notifyListener(datasetId)
    }
  }

  private files: any[] = []
  private threads: Worker[] = []

  private async fetchDataset(config: { dataset: string }) {
    if (!this.files.length) {
      const { files } = await new HTTPFileSystem(this.fileApi).getDirectory(this.subfolder)
      this.files = files
    }

    return new Promise<DataTable>((resolve, reject) => {
      const thread = new DataFetcherWorker()
      this.threads.push(thread)
      try {
        thread.postMessage({
          fileSystemConfig: this.fileApi,
          subfolder: this.subfolder,
          files: this.files,
          config: config,
        })

        thread.onmessage = e => {
          thread.terminate()
          if (e.data.error) {
            console.log(e.data.error)
            // var msg = '' + e.data.error
            //globalStore.commit('error', e.data.error)
            globalStore.commit('setStatus', {
              type: Status.ERROR,
              msg: `File not found: ${this.subfolder}/${config.dataset}`,
              desc: 'Check filename and path.',
            })
            reject()
          }
          resolve(e.data)
        }
      } catch (err) {
        thread.terminate()
        console.error(err)
        reject(err)
      }
    })
  }

  private async fetchNetwork(path: string, vizDetails: any) {
    return new Promise<NetworkLinks>((resolve, reject) => {
      const thread = new RoadNetworkLoader()
      try {
        thread.postMessage({
          filePath: path,
          fileSystem: this.fileApi,
          vizDetails,
        })

        thread.onmessage = e => {
          // perhaps network has no CRS and we need to ask user
          if (e.data.promptUserForCRS) {
            let crs =
              prompt('Enter the coordinate reference system, e.g. EPSG:25832') || 'EPSG:31468'
            if (!isNaN(parseInt(crs))) crs = `EPSG:${crs}`

            thread.postMessage({ crs })
            return
          }

          // normal exit
          thread.terminate()
          if (e.data.error) {
            console.error(e.data.error)
            reject(e.data.error)
          }
          resolve(e.data.links)
        }
      } catch (err) {
        thread.terminate()
        console.error(err)
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
      dataset: Promise<DataTable>
      filteredRows: any[] | null
      activeFilters: { [column: string]: any }
      filterListeners: Set<any>
    }
  } = {}

  private networks: { [id: string]: Promise<NetworkLinks> } = {}
}
