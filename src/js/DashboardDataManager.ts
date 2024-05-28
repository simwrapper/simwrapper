/**
 * DashboardDataManager: this class loads, caches, and filters CSV and XML datasets
 * for use by dashboard charts and maps. Loosely based on the VizWit system
 * (see http://vizwit.io/) but we don't have a Carto database so all of the data
 * is stored internally in this class.
 *
 * Each tabbed dashboard should instantiate this class once, and destroy it when the dashboard
 * is closed. Datasets can be big, we don't want them to stick around forever!
 *
 * Data queries always return -both- the full dataset AND a filtered dataset.
 * That way, the filtered data can be visually layered on top of the full data.
 */

import { rollup } from 'd3-array'

import globalStore from '@/store'
import HTTPFileSystem from './HTTPFileSystem'
import { DataTable, DataTableColumn, DataType, FileSystemConfig, Status } from '@/Globals'
import { findMatchingGlobInFiles } from '@/js/util'

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
  value: any
  operator?: string
  invert?: boolean
  range?: boolean
}

export interface NetworkLinks {
  source: Float32Array
  dest: Float32Array
  linkIds: any[]
  projection: String
}

// This tells us if our environment has the Chrome File System Access API, meaning we are in Chrome
//@ts-ignore
const isChrome = !!window.showDirectoryPicker
const isFirefox = !isChrome

export default class DashboardDataManager {
  constructor(...args: string[]) {
    // hello
    this.root = args.length ? args[0] : ''
    this.subfolder = args.length ? args[1] : ''
    this.fileApi = this._getFileSystem(this.root)
  }

  private files: any[] = []
  private threads: Worker[] = []
  private subfolder = ''
  private root = ''
  private fileApi: FileSystemConfig
  private networks: { [id: string]: Promise<NetworkLinks> } = {}
  private featureCollections: { [id: string]: any } = {}

  public kill() {
    for (const worker of this.threads) worker.terminate()
  }

  public getFilteredDataset(config: { dataset: string }): { filteredRows: any[] | null } {
    if (!(config.dataset in this.datasets)) return { filteredRows: null }

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
   * @param config the configuration params from the YAML file. Must include dataset,
   *               and may include other optional parameters as needed by the viz
   * @returns allRows object, containing a DataTableColumn for each column in this dataset
   */
  public async getDataset(config: configuration, options?: { highPrecision: boolean }) {
    try {
      // first, get the dataset
      if (!this.datasets[config.dataset]) {
        console.log('load:', config.dataset)

        // fetchDataset() immediately returns a Promise<>, which we await on
        // so that multiple charts don't all try to fetch the dataset individually
        this.datasets[config.dataset] = {
          dataset: this._fetchDataset(config, options),
          activeFilters: {},
          filteredRows: null,
          filterListeners: new Set(),
        }
      }

      // wait for dataset to load
      // (this will immediately return dataset if it is already loaded)
      let myDataset = await this.datasets[config.dataset].dataset

      // make a copy because each viz in a dashboard might be hacking it differently
      // TODO: be more "functional" and return the object itself, and let views create copies if they need to
      let allRows = { ...myDataset }

      // remove ignored columns
      if (config.ignoreColumns) {
        config.ignoreColumns.forEach(column => {
          delete allRows[column]
        })
      }

      // if useLastRow, drop all rows except the last row
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
   * Convert row-wise columns into a DataTable. This is intended for
   * columnar data formats such as avro networks
   * @param fullpath full file path
   * @param dataColumns map of column: data
   * @param config data config object
   */
  public setRowWisePropertyTable(fullpath: string, dataTable: DataTable, config: any) {
    const key = fullpath.substring(fullpath.lastIndexOf('/') + 1)

    // merge key with keep/drop params (etc)
    let fullConfig = { dataset: key }
    if ('string' !== typeof config) fullConfig = Object.assign(fullConfig, config)

    this.datasets[key] = {
      activeFilters: {},
      filteredRows: null,
      filterListeners: new Set(),
      dataset: new Promise<DataTable>(resolve => {
        resolve(dataTable)
      }),
    }
    // this is a promise:
    return this.datasets[key].dataset
  }

  public getFeatureCollection(id: string) {
    return this.featureCollections[id]
  }

  public registerFeatures(fullpath: string, featureCollection: any[], config: any) {
    this.featureCollections[fullpath] = featureCollection
    this.setFeatureProperties(fullpath, featureCollection, config)
  }

  /**
   * Convert features array from GeoJSONs and Shapefiles into DataTable
   * @param fullpath name of shape/geo file
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
        // console.log('NEW WORKER', thread)
        this.threads.push(thread)

        try {
          thread.postMessage({ config: fullConfig, featureProperties })

          thread.onmessage = e => {
            thread.terminate()
            if (e.data.error) {
              console.error(e.data.error)
              reject(`Problem loading properties in ${fullpath}`)
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

  /**
   *  Register an existing in-memory DataTable as a dataset in this Dashboard
   * @param props key, dataTable, and filename associated with this DataTable
   */
  public setPreloadedDataset(props: { key: string; dataTable: DataTable }) {
    // let filters = {}
    // if (this.datasets[props.key]) {
    //   filters = this.datasets[props.key].activeFilters
    // }

    this.datasets[props.key] = {
      dataset: new Promise<DataTable>((resolve, reject) => {
        resolve(props.dataTable)
      }),
      activeFilters: {}, // filters,
      filteredRows: null,
      filterListeners: new Set(),
    }
  }

  public async getRoadNetwork(
    filename: string,
    subfolder: string,
    vizDetails: any,
    cbStatus?: any
  ) {
    const path = `/${subfolder}/${filename}`
    // Get the dataset the first time it is requested
    if (!this.networks[path]) {
      this.networks[path] = this._fetchNetwork({ subfolder, filename, vizDetails, cbStatus })
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

  public async setFilter(filter: FilterDefinition) {
    const { dataset, column, value, invert, range } = filter

    if (!this.datasets[dataset]) {
      console.warn(`${dataset} doesn't exist yet`)
      console.warn(Object.keys(this.datasets))
      return
    }
    console.log('> setFilter', dataset, column, value)

    // Filter might be single or an array; make it an array.
    const values = Array.isArray(value) ? value : [value]
    if (this.datasets[dataset].activeFilters == null) {
      this.datasets[dataset].activeFilters = {}
    }
    const allFilters = this.datasets[dataset].activeFilters
    // a second click on a filter means REMOVE this filter.
    // if (allFilters[column] !== undefined && allFilters[column] === values) {
    //   console.log('A1', allFilters[column])
    //   delete allFilters[column]
    // } else
    if (!values.length) {
      delete allFilters[column]
    } else {
      allFilters[column] = { values, invert, range }
    }
    await this._updateFilters(dataset) // this is async
  }

  public addFilterListener(config: { dataset: string }, listener: any) {
    const selectedDataset = this.datasets[config.dataset]
    if (!selectedDataset) throw Error('No dataset named: ' + config.dataset)

    // console.log(22, config.dataset, this.datasets[config.dataset])
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
    this.networks = {}
  }

  // ---- PRIVATE STUFFS -----------------------

  private async _updateFilters(datasetId: string) {
    console.log('> updateFilters ', datasetId)
    const metaData = this.datasets[datasetId]
    console.log({ metaData })

    if (!Object.keys(metaData.activeFilters).length) {
      console.log('no keys')
      metaData.filteredRows = null
      this._notifyListeners(datasetId)
      return
    }

    // Let's do this the stupid way first, and make it better once we get it working.
    const dataset = await metaData.dataset
    const allColumns = Object.keys(dataset)
    let filteredRows: any[] = []

    const numberOfRowsInFullDataset = dataset[allColumns[0]].values.length
    console.log('FILTERS:', metaData.activeFilters)
    console.log('TOTLROWS', numberOfRowsInFullDataset)

    // we will go thru each filter for this dataset and set the elements
    // to false whenever a row fails a filter.
    // This implements "AND" logic.
    const hasMatchedFilters = new Array(numberOfRowsInFullDataset).fill(true)

    const ltgt = /^(<|>)/ // starts with < or >
    //            (╯° °)╯︵ ┻━┻

    for (const [column, spec] of Object.entries(metaData.activeFilters)) {
      const dataColumn = dataset[column]
      if (spec.values[0] === undefined || spec.values[0] === '') {
        throw Error(datasetId + ': filter error')
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
      } else {
        // handle case where we are testing equal/inequal and its a "numeric" string
        if (spec.values.length === 1 && typeof spec.values[0] === 'string') {
          const numericString = parseFloat(spec.values[0])
          if (Number.isFinite(numericString)) spec.values.push(numericString)
        }
      }

      // test every row: falsify if it fails the test.
      for (let i = 0; i < numberOfRowsInFullDataset; i++) {
        if (!checkFilterValue(spec, dataColumn.values[i])) {
          hasMatchedFilters[i] = false
        }
      }
    }

    // Build the final filtered dataset based on hasMatchedFilters
    for (let i = 0; i < numberOfRowsInFullDataset; i++) {
      if (hasMatchedFilters[i]) {
        const row = {} as any
        allColumns.forEach(col => (row[col] = dataset[col].values[i]))
        filteredRows.push(row)
      }
    }

    // For now let's leave the filtered rows as an array of data objects

    // // CONVERT array of objects to column-based DataTableColumns
    // const filteredDataTable: { [id: string]: DataTableColumn } = {}
    // allColumns.forEach(columnId => {
    //   const column = { name: columnId, values: [], type: DataType.UNKNOWN } as any
    //   for (const row of filteredRows) column.values.push(row[columnId])
    //   filteredDataTable[columnId] = column
    // })

    // metaData.filteredRows = filteredDataTable as any

    metaData.filteredRows = filteredRows
    this._notifyListeners(datasetId)
  }

  // private _checkFilterValue(
  //   spec: { conditional: string; invert: boolean; values: any[] },
  //   elementValue: any
  // ) {
  //   // lookup closure functions for < > <= >=
  //   const conditionals: any = {
  //     '<': () => {
  //       return elementValue < spec.values[0]
  //     },
  //     '<=': () => {
  //       return elementValue <= spec.values[0]
  //     },
  //     '>': () => {
  //       return elementValue > spec.values[0]
  //     },
  //     '>=': () => {
  //       return elementValue >= spec.values[0]
  //     },
  //   }

  //   let isValueInFilterSpec: boolean

  //   if (spec.conditional) {
  //     isValueInFilterSpec = conditionals[spec.conditional]()
  //   } else {
  //     isValueInFilterSpec = spec.values.includes(elementValue)
  //   }

  //   if (spec.invert) return !isValueInFilterSpec
  //   return isValueInFilterSpec
  // }

  private _notifyListeners(datasetId: string) {
    const dataset = this.datasets[datasetId]
    for (const notifyListener of dataset.filterListeners) {
      notifyListener(datasetId)
    }
  }

  private async _fetchDataset(config: { dataset: string }, options?: { highPrecision: boolean }) {
    if (!this.files.length) {
      const { files } = await new HTTPFileSystem(this.fileApi).getDirectory(this.subfolder)
      this.files = files
    }

    return new Promise<DataTable>((resolve, reject) => {
      const thread = new DataFetcherWorker()
      this.threads.push(thread)
      // console.log('NEW WORKER', thread)
      try {
        thread.postMessage({
          fileSystemConfig: this.fileApi,
          subfolder: this.subfolder,
          files: this.files,
          config: config,
          options,
        })

        thread.onmessage = e => {
          thread.terminate()
          if (e.data.error) {
            let msg = '' + e.data.error
            msg = msg.replace('[object Response]', 'Error loading file')

            if (config?.dataset && msg.indexOf(config.dataset) === -1) msg += `: ${config.dataset}`

            reject(msg)
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

  private async _fetchNetwork(props: {
    subfolder: string
    filename: string
    vizDetails: any
    cbStatus?: any
  }) {
    return new Promise<NetworkLinks>(async (resolve, reject) => {
      const { subfolder, filename, vizDetails, cbStatus } = props

      const path = `/${subfolder}/${filename}`
      console.log('load network:', path)

      // get folder
      let folder =
        path.indexOf('/') > -1 ? path.substring(0, path.lastIndexOf('/')) : this.subfolder

      // get file path search pattern
      try {
        const { files } = await new HTTPFileSystem(this.fileApi).getDirectory(folder)
        let pattern = path.indexOf('/') === -1 ? path : path.substring(path.lastIndexOf('/') + 1)
        const match = findMatchingGlobInFiles(files, pattern)
        if (match.length !== 1) reject('File not found: ' + path)
      } catch (e) {
        // Could not get directory listing!
        reject('Error reading folder: ' + folder)
      }

      const thread = new RoadNetworkLoader() as any
      try {
        thread.onmessage = (e: MessageEvent) => {
          // perhaps network has no CRS and we need to ask user
          if (e.data.promptUserForCRS) {
            let crs =
              prompt(
                'Enter the projection coordinate reference system, e.g. "EPSG:25832", or cancel if unknown'
              ) || 'Atlantis'
            if (Number.isInteger(parseInt(crs))) crs = `EPSG:${crs}`

            thread.postMessage({ crs })
            return
          }

          // notify client of status update messages
          if (e.data.status) {
            if (cbStatus) cbStatus(e.data.status)
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

        thread.postMessage({
          filePath: path,
          fileSystem: this.fileApi,
          vizDetails,
          isFirefox, // we need this for now, because Firefox bug #260
        })
      } catch (err) {
        thread.terminate()
        console.error(err)
        reject(err)
      }
    })
  }

  private _getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )
    if (svnProject.length === 0) {
      // console.log(globalStore.state.svnProjects)
      console.error(`DDM: no such project, is slug correct? (${name})`)
      throw Error
    }
    return svnProject[0]
  }

  private datasets: {
    [id: string]: {
      dataset: Promise<DataTable>
      filteredRows: any[] | null
      activeFilters: { [column: string]: any }
      filterListeners: Set<any>
    }
  } = {}
}

export function checkFilterValue(
  spec: { conditional: string; invert: boolean; values: any[]; range?: boolean },
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

  if (spec.range) {
    isValueInFilterSpec = elementValue >= spec.values[0] && elementValue <= spec.values[1]
  } else if (spec.conditional) {
    isValueInFilterSpec = conditionals[spec.conditional]()
  } else {
    isValueInFilterSpec = spec.values.includes(elementValue)
  }

  if (spec.invert) return !isValueInFilterSpec
  return isValueInFilterSpec
}
