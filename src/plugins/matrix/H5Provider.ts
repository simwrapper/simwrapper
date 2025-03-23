import { Blosc } from 'numcodecs'

import { FileSystemConfig } from '@/Globals'

export interface Matrix {
  path: string
  table: string
  data: Float32Array | Float64Array | number[]
}

export interface H5Catalog {
  catalog: string[]
  shape: number[]
}

class H5Provider {
  public catalog
  public shape
  public size
  private tableKeys
  private fileSystem
  // private subfolder
  // private filename
  private path

  constructor(props: { fileSystem: FileSystemConfig; subfolder: string; filename: string }) {
    this.fileSystem = props.fileSystem
    this.path = `${props.subfolder}/${props.filename}`
    this.catalog = [] as string[]
    this.shape = [0, 0]
    this.size = 0
    this.tableKeys = [] as { key: string; name: string }[]
  }

  /**
   * fetches the shape and catalog of matrices
   */
  public async init() {
    if (this.fileSystem.omx) {
      const props = await this._getOmxPropsFromOmxAPI()
      if (props) {
        this.catalog = props.catalog
        this.shape = props.shape
        this.size = props.shape[0]
        this.tableKeys = this.catalog.map(key => {
          return { key, name: key }
        })
      }
      console.log({ catalog: this.catalog, size: this.size })
    }
  }

  private async _getOmxPropsFromOmxAPI() {
    console.log('OMX')

    let url = `${this.fileSystem.baseURL}/omx/${this.fileSystem.slug}?prefix=${this.path}`

    const headers = {} as any
    const zkey = `auth-token-${this.fileSystem.slug}`
    const token = localStorage.getItem(zkey) || ''
    headers['AZURETOKEN'] = token

    console.log(url)
    const response = await fetch(url, { headers })
    console.log(response.status, response.statusText)
    if (response.status !== 200) {
      console.error(await response.text())
      return null
    }
    const omxHeader: H5Catalog = await response.json()
    console.log(omxHeader)
    return omxHeader
  }

  public async getDataArray(table: string) {
    if (this.fileSystem.omx) return this._getMatrixFromOMXApi(table)
  }

  // OMX API - fetch raw data from API instead of from HDF5 file
  private async _getMatrixFromOMXApi(table: string): Promise<Matrix> {
    console.log(123)
    // if (this.currentKey !== this.activeTable?.key) {
    //   const key = this.activeTable?.key || (this.blob as H5Catalog).catalog[0]
    let url = `${this.fileSystem.baseURL}/omx/${this.fileSystem.slug}?prefix=${this.path}&table=${table}`

    const headers = {} as any
    const zkey = `auth-token-${this.fileSystem.slug}`
    const token = localStorage.getItem(zkey) || ''
    headers['AZURETOKEN'] = token

    // MAIN MATRIX - fetch the individual matrix from API
    const response = await fetch(url, { headers })
    const buffer = await response.blob().then(async b => await b.arrayBuffer())
    const codec = new Blosc() // buffer is blosc-compressed
    const data = new Float64Array(new Uint8Array(await codec.decode(buffer)).buffer)

    return { data, table, path: this.path }
    // }
  }

  private async _getMatrixFromH5File(h5api: H5WasmLocalFileApi) {
    if (!h5api || this.activeZone == null) return []
    const key = this.activeTable?.key || ''
    let dataset = await h5api.getEntity(key)
    let data = (await h5api.getValue({ dataset } as any)) as Float32Array
    return data
  }

  public async zextractH5ArrayData() {
    if (this.activeZone == null) return

    this.isLoading = true
    await this.$nextTick()

    if (this.currentKey !== this.activeTable?.key) {
      if (this.isOmxApi) {
        // console.log(155, this.currentData)

        // BASE MATRIX - if we are in diffmode
        console.log(234, this.baseBlob)
        if (this.baseBlob && this.filenameBase) {
          //@ts-ignore
          url = `${this.fileSystem.baseURL}/omx/${this.fileSystem.slug}?prefix=${this.filenameBase}&table=${key}`
          const response = await fetch(url, { headers })
          const buffer = await response.blob().then(async b => await b.arrayBuffer())
          const codec = new Blosc() // buffer is blosc-compressed
          const data = new Float64Array(new Uint8Array(await codec.decode(buffer)).buffer)
          this.currentBaseData = data
          // console.log('BASE DATA', this.currentBaseData)
        }
      }
    } else {
      // HDF5: async get the matrix itself first
      if (!this.h5fileApi) return
      this.currentData = await this.fetchMatrix(this.h5fileApi as any)
      this.currentKey = this.activeTable?.key || ''
      // also get base matrix if we're in diffmode
      if (this.h5baseApi) this.currentBaseData = await this.fetchMatrix(this.h5baseApi as any)
    }

    //TODO FIX THIS
    let offset = this.activeZone - 1
    // try {
    let values = [] as any
    if (this.currentData) {
      if (this.mapConfig.isRowWise) {
        values = this.currentData.slice(this.matrixSize * offset, this.matrixSize * (1 + offset))
      } else {
        for (let i = 0; i < this.matrixSize; i++) {
          values.push(this.currentData[i * this.matrixSize + offset])
        }
      }
    }

    // DIFF MODE

    console.log(919, this.h5baseApi)

    if (this.h5baseApi || (this.filenameBase && this.currentBaseData)) {
      console.log('DO THE DIFF!')
      let baseValues = [] as any

      if (this.mapConfig.isRowWise) {
        baseValues = this.currentBaseData.slice(
          this.matrixSize * offset,
          this.matrixSize * (1 + offset)
        )
      } else {
        for (let i = 0; i < this.matrixSize; i++) {
          baseValues.push(this.currentBaseData[i * this.matrixSize + offset])
        }
      }

      // console.log('6666', 'BASEVALUES', baseValues)
      // do the diff
      values = values.map((v: any, i: any) => v - baseValues[i])
    }

    this.dataArray = values
    this.setColorsForArray()
    this.prettyDataArray = this.setPrettyValuesForArray(this.dataArray)
    console.log({ prettyValues: this.prettyDataArray })

    // } catch (e) {
    //   console.warn('Offset not found in HDF5 file:', offset)
    // }
    this.isLoading = false
  }
}

export default H5Provider
