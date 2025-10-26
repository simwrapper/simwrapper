// H5Provider now as a Worker, so we can terminate to kill h5wasm background process
import * as Comlink from 'comlink'

import { Blosc } from 'numcodecs'
import naturalSort from 'javascript-natural-sort'
import H5Wasm from 'h5wasm'

import { FileSystemConfig } from '@/Globals'
import { H5WasmLocalFileApi } from './local/h5wasm-local-file-api'
import { getPlugin } from './plugin-utils'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import globalStore from '@/store'
import { Matrix } from './MatrixViewer.vue'

export interface H5Catalog {
  catalog: string[]
  shape: number[]
  lookups: string[]
}

const H5Provider = {
  catalog: [] as string[],
  file: null as null | File,
  fileSystem: null as null | FileSystemConfig,
  h5fileApi: null as null | H5WasmLocalFileApi,
  path: '',
  shape: [0, 0],
  size: 0,
  tableKeys: [] as { key: string; name: string }[],
  token: '',
  lookupKeys: [] as string[],

  /**
   * Sets up the path, shape, and catalog of matrices
   */
  async open(props: {
    fileSystem?: FileSystemConfig
    subfolder: string
    file?: File
    filename: string
    token?: string
  }) {
    // tada
    this.path = `${props.subfolder}/${props.filename}`
    this.fileSystem = props.fileSystem || ({} as FileSystemConfig)
    this.file = props.file || null
    if (props.token) this.token = props.token

    if (this.file) {
      await this._initLocalFile()
    } else if (this.fileSystem.flask) {
      await this._initFlaskAPI()
    } else {
      await this._initFileAPI()
    }
    return { status: 'ok' }
  },

  async getCatalog() {
    return this.catalog
  },

  async getSize() {
    return this.size
  },

  async getLookups(): Promise<string[]> {
    return this.lookupKeys
  },

  async getLookup(key: string) {
    if (this.fileSystem?.flask) {
      const simpleKey = key.substring(key.lastIndexOf('/') + 1)
      const lookup = await this._getLookupFromOMXApi(simpleKey)
      return lookup
    } else {
      if (!this.h5fileApi) return null
      let dataset = await this.h5fileApi.getEntity(key)
      let data = await this.h5fileApi.getValue({ dataset } as any)
      return { data }
    }
  },

  async getDataArray(tableName: string) {
    if (this.fileSystem?.flask) {
      return this._getMatrixFromOMXApi(tableName)
    } else {
      return this._getMatrixFromH5File(tableName)
    }
  },

  // Fabricate an HDF5 file with the current matrix content
  async buildH5Buffer(props: { size: number; main: any; base?: any; diff?: any }) {
    const { FS } = await H5Wasm.ready
    let f = new H5Wasm.File('matrix', 'w')

    f.create_dataset({ name: `A:Values`, data: props.main, shape: [props.size, props.size] })
    if (props.diff) {
      f.create_dataset({ name: `B:Compare`, data: props.base, shape: [props.size, props.size] })
      f.create_dataset({ name: `C:Diff A-B`, data: props.diff, shape: [props.size, props.size] })
    }

    f.flush()
    f.close()

    const fileData = FS.readFile('matrix')
    return Comlink.transfer(fileData.buffer, [fileData.buffer])
  },

  async _initLocalFile() {
    if (!this.file) return
    // we received the entire blob (drag/drop etc) so just use it as-is
    this.h5fileApi = new H5WasmLocalFileApi(this.file, undefined, getPlugin)
    await this._setFileProps()
  },

  async _initFileAPI() {
    if (!this.fileSystem) throw Error('H5Provider needs FileAPI FileSystem')

    // fetch the entire blob
    const fileApi = new HTTPFileSystem(this.fileSystem, globalStore)
    console.log('---INIT FETCH', this.path)
    const blob = await fileApi.getFileBlob(this.path)

    // create a local H5Wasm from it
    this.h5fileApi = new H5WasmLocalFileApi(blob as File, undefined, getPlugin)

    await this._setFileProps()
  },

  async _initFlaskAPI() {
    const props = await this._getOmxPropsFromOmxAPI()
    if (props) {
      this.catalog = props.catalog
      this.shape = props.shape
      this.size = props.shape[0]
      this.tableKeys = this.catalog.map(key => {
        return { key, name: key }
      })
      this.lookupKeys = props.lookups.map(key => `/lookup/${key}`)
    }
  },

  async _setFileProps() {
    if (!this.h5fileApi) return

    // first get the table keys
    let keys = [] as any[]
    try {
      keys = await this.h5fileApi.getSearchablePaths('/')
    } catch (e) {
      throw Error('Not an OMX File? Cannot parse matrix list')
    }

    // pretty sort them the way humans like them
    keys.sort((a: any, b: any) => naturalSort(a, b))

    // hang onto lookups
    this.lookupKeys = keys.filter(k => k.startsWith('/lookup/'))

    // remove lookups and folder prefixes
    let tableKeys = keys
      .filter(key => !key.startsWith('/lookup/'))
      .map(key => {
        const name = key.indexOf('/') > -1 ? key.substring(1 + key.lastIndexOf('/')) : key
        return { key, name }
      })

    // if there are "name" properties, use them
    for (const table of tableKeys) {
      const element = await this.h5fileApi.getEntity(table.key)
      // mark non-datasets so they can be filtered out next
      if (element.kind !== 'dataset') {
        table.key = ''
        continue
      }
      const attrValues = await this.h5fileApi.getAttrValues(element)
      if (attrValues.name) {
        table.name = `${table.key.substring(1)}&nbsp;•&nbsp;${attrValues?.name || ''}`
      }
    }

    // filter out non-datasets; key will be empty if it's not a dataset
    tableKeys = tableKeys.filter(t => !!t.key)
    this.tableKeys = tableKeys
    this.catalog = tableKeys.map(t => t.name)

    // Get first matrix dimension, for guessing a useful/correct shapefile
    if (tableKeys.length) {
      for (const entity of this.tableKeys) {
        const element: any = await this.h5fileApi.getEntity(entity.key)
        if (element.kind === 'dataset') {
          // const element: any = await this.h5fileApi.getEntity(this.activeTable.key)
          const shape = element.shape
          if (shape) {
            this.shape = shape
            this.size = shape[0]
          } else {
            this.shape = [4947, 4947]
            this.size = 4947
          }
          break
        }
      }
    }
  },

  async _getOmxPropsFromOmxAPI() {
    if (!this.fileSystem) throw Error('H5Provider needs FileAPI FileSystem')

    let url = `${this.fileSystem.baseURL}/omx/${this.fileSystem.slug}?prefix=${this.path}`

    const headers = {} as any
    headers['AZURETOKEN'] = this.token

    const response = await fetch(url, { headers })
    console.log(response.status, response.statusText)
    if (response.status !== 200) {
      console.error(await response.text())
      return null
    }
    const omxHeader: H5Catalog = await response.json()
    return omxHeader
  },

  async _getLookupFromOMXApi(key: string) {
    if (!key) return { data: [] as number[] }
    if (!this.fileSystem) throw Error('H5Provider needs FileAPI FileSystem')

    let cleanKey = key.substring(key.lastIndexOf('/') + 1)
    let url = `${this.fileSystem.baseURL}/omx/${this.fileSystem.slug}?prefix=${this.path}&lookup=${cleanKey}`
    const headers = {} as any
    headers['AZURETOKEN'] = this.token

    const response = await fetch(url, { headers })
    const json = await response.json()
    return { data: json }
  },

  // OMX API - fetch raw data from API instead of from HDF5 file
  async _getMatrixFromOMXApi(table: string, lookup = false): Promise<Matrix> {
    if (!table) return { data: [] as number[], table, path: this.path }
    if (!this.fileSystem) throw Error('H5Provider needs FileAPI FileSystem')

    let which = lookup ? 'lookup' : 'table'
    let url = `${this.fileSystem.baseURL}/omx/${this.fileSystem.slug}?prefix=${this.path}&${which}=${table}`

    const headers = {} as any
    headers['AZURETOKEN'] = this.token

    // MAIN MATRIX - fetch the individual matrix from API
    const response = await fetch(url, { headers })
    const buffer = await response.blob().then(async b => await b.arrayBuffer())
    const codec = new Blosc() // buffer is blosc-compressed

    // We should support any data type really, but let's start with Float64/32,Int8
    let data = null as any
    try {
      data = new Float64Array(new Uint8Array(await codec.decode(buffer)).buffer)
    } catch {}
    if (!data) {
      try {
        data = new Float32Array(new Uint8Array(await codec.decode(buffer)).buffer)
      } catch {}
    }
    if (!data) {
      try {
        data = new Uint8Array(await codec.decode(buffer))
      } catch {}
    }

    return { data, table, path: this.path }
    // }
  },

  async _getMatrixFromH5File(tableName: string) {
    if (!this.h5fileApi) return { data: [], table: tableName, path: this.path }

    const t = this.tableKeys.filter(t => t.name === tableName)
    if (!t.length) return { data: [], table: tableName, path: this.path }

    const key = t[0].key

    let dataset = await this.h5fileApi.getEntity(key)
    let data = await this.h5fileApi.getValue({ dataset } as any)

    return { data, table: tableName, path: this.path }
  },
}

Comlink.expose(H5Provider)
