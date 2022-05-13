/*eslint prefer-rest-params: "off"*/

import pako from 'pako'
import Papaparse from 'papaparse'
import DBF from '@/js/dbfReader'

import { DataTableColumn, DataTable, DataType, FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { findMatchingGlobInFiles } from '@/js/util'

// global variables
let _fileSystem: HTTPFileSystem
let _subfolder = ''
let _files: string[] = []
let _config: any = {}
let _dataset = ''
let _buffer: Uint8Array

const _fileData: { [key: string]: DataTable } = {}

onmessage = function (e) {
  fetchData(e.data)
}

async function fetchData(props: {
  fileSystemConfig: FileSystemConfig
  subfolder: string
  files: string[]
  config: string
  buffer: Uint8Array
  featureProperties?: any[]
}) {
  _config = props.config
  _dataset = _config.dataset

  // Did we get featureProperties array? Just need to convert it to DataTable
  if (props.featureProperties) {
    convertFeaturePropertiesToDataTable(props.featureProperties)
    postMessage(_fileData[_dataset])
    return
  }

  // Did we get a pre-filled buffer? Just need to parse it
  if (props.buffer) {
    _buffer = props.buffer
    parseData(_dataset, _buffer)
    postMessage(_fileData[_dataset])
    return
  }

  // Got details, need to fetch and then parse
  _fileSystem = new HTTPFileSystem(props.fileSystemConfig)
  _subfolder = props.subfolder
  _files = props.files
  _buffer = props.buffer

  // if dataset has a path in it, we need to fetch the correct subfolder contents
  const slash = _config.dataset.indexOf('/')
  if (slash > -1) {
    const mergedFolder = slash === 0 ? _config.dataset : `${_subfolder}/${_config.dataset}`
    _dataset = mergedFolder.substring(1 + mergedFolder.lastIndexOf('/'))
    _subfolder = mergedFolder.substring(0, mergedFolder.lastIndexOf('/'))

    // need to fetch new list of files
    const { files } = await _fileSystem.getDirectory(_subfolder)
    _files = files
  }

  // load all files
  try {
    await loadFile()
    postMessage(_fileData[_dataset])
  } catch (e) {
    const error = '' + e
    postMessage({ error })
  }
}

// ----- helper functions ------------------------------------------------

function convertFeaturePropertiesToDataTable(features: any[]) {
  const dataTable: DataTable = {}

  // 1. set up one array for each column
  const firstRow = features[0]
  const headers = Object.keys(firstRow).sort()

  // 2. Determine column types based on first row (scary but necessary?)
  for (const columnId of headers) {
    let values: any[] | Float32Array
    let columnType = DataType.NUMBER
    if (typeof firstRow[columnId] == 'number') {
      values = new Float32Array(features.length)
      values.fill(NaN)
    } else {
      values = []
      columnType = DataType.STRING // DONT REALLY KNOW TYPE YET; everything except number is STRING.
    }
    dataTable[columnId] = { name: columnId, values, type: columnType }
  }

  // 3. copy data to column-based arrays
  for (let rowCount = 0; rowCount < features.length; rowCount++) {
    const row = features[rowCount]

    for (const columnId of headers) {
      const value = row[columnId]
      dataTable[columnId].values[rowCount] = value
    }
  }

  calculateMaxValues(_dataset, dataTable)
  _fileData[_dataset] = dataTable
}

async function loadFile() {
  const datasetPattern = _dataset

  // figure out which file to load
  const matchingFiles = findMatchingGlobInFiles(_files, datasetPattern)

  if (matchingFiles.length == 0) throw Error(`No files matched "${datasetPattern}"`)
  if (matchingFiles.length > 1)
    throw Error(`More than one file matched "${datasetPattern}": ${matchingFiles}`)

  const filename = matchingFiles[0]

  // load the file
  const unzipped = await loadFileOrGzipFile(filename)

  // and parse it!
  parseData(filename, unzipped)
}

async function parseData(filename: string, buffer: Uint8Array) {
  if (filename.endsWith('.dbf') || filename.endsWith('.DBF')) {
    const dataTable = DBF(buffer, new TextDecoder('windows-1252')) // dbf has a weird default textcode
    calculateMaxValues(_dataset, dataTable)
    _fileData[_dataset] = dataTable
  } else {
    // convert text to utf-8
    const text = new TextDecoder().decode(buffer)

    // parse the text: we can handle CSV or XML
    await parseVariousFileTypes(_dataset, filename, text)
  }
}

function cleanData() {
  const dataset = _fileData[_dataset]

  // remove extra columns
  if (_config.ignoreColumns) {
    _config.ignoreColumns.forEach((column: string) => delete dataset[column])
  }
}

async function parseVariousFileTypes(fileKey: string, filename: string, text: string) {
  function drillIntoXML(parent: any, tag: any): any {
    if (Array.isArray(tag) && tag.length > 0) return drillIntoXML(parent[tag[0]], tag.slice(1))
    return parent
  }

  // XML
  if (filename.indexOf('.xml') > -1) {
    const xml = {} as any
    // const xml = (await parseXML(text, {
    //   mergeAttrs: true,
    //   explicitArray: false,
    //   attrValueProcessors: [parseNumbers],
    // })) as any

    // Do a splitty lookup if the xmlElement is specified
    const details = _config
    if (details.xmlElements) {
      const subelements = details.xmlElements.split('.')
      const subXML = drillIntoXML(xml, subelements)

      // TODO: Make this column-wise!
      _fileData[fileKey] = {} //  header: [], rows: subXML }
    } else {
      _fileData[fileKey] = {} //  header: [], rows: xml }
    }

    return
  }

  // if it isn't XML, well then let's hope assume Papaparse can deal with it
  parseCsvFile(fileKey, filename, text)
}

function parseCsvFile(fileKey: string, filename: string, text: string) {
  // prepare storage object -- figure out records and columns
  const dataTable: DataTable = {}

  let rowCount = 0

  const csv = Papaparse.parse(text, {
    // preview: 10000,
    delimitersToGuess: ['\t', ';', ',', ' '],
    comments: '#',
    dynamicTyping: false,
    header: false,
    skipEmptyLines: true,
  })

  // set up arrays
  // First we assume everything is a number. Then when we find out otherwise, we switch
  // to a regular JS array as necessary
  const headers = csv.data[0] as string[]
  const numColumns = headers.length

  // first column is always string lookup
  dataTable[headers[0]] = { name: headers[0], values: [], type: DataType.STRING }
  // other columns: start with numbers and switch if we have to
  for (let column = 1; column < numColumns; column++) {
    const values = new Float32Array(csv.data.length - 1)
    values.fill(NaN)
    dataTable[headers[column]] = { name: headers[column], values, type: DataType.NUMBER } // DONT KNOW TYPE YET
  }

  // copy data to column-based arrays
  for (let rowCount = 0; rowCount < csv.data.length - 1; rowCount++) {
    const row = csv.data[rowCount + 1] as any[]

    // if (rowCount % 65536 === 0) console.log(row)

    for (let column = 0; column < numColumns; column++) {
      const key = headers[column]
      const value = row[column] // always string

      if (column == 0) {
        // column 0 is always string
        dataTable[key].values[rowCount] = value
      } else {
        const float = parseFloat(value) // number or NaN
        if (!isNaN(float)) {
          // number:
          dataTable[key].values[rowCount] = value
        } else {
          // non-number:
          if (Array.isArray(dataTable[key].values)) {
            dataTable[key].values[rowCount] = value
          } else {
            // first, convert the Float32Array to a normal javascript array
            if (typeof value == 'string') dataTable[key].type = DataType.STRING
            if (typeof value == 'boolean') dataTable[key].type = DataType.BOOLEAN

            // convert to regular array
            const regularArray = Array.from(dataTable[key].values.slice(0, rowCount))
            regularArray[rowCount] = value
            // switch the array out
            dataTable[key].values = regularArray
          }
        }
      }
    }
  }
  calculateMaxValues(fileKey, dataTable)
  _fileData[fileKey] = dataTable
}

function calculateMaxValues(fileKey: string, dataTable: DataTable) {
  // calculate max for numeric columns
  for (const column of Object.values(dataTable)) {
    if (column.type !== DataType.NUMBER) continue

    let max = -Infinity
    for (const value of column.values) max = Math.max(max, value)
    column.max = max
  }
}

function badparseCsvFile(fileKey: string, filename: string, text: string) {
  // prepare storage object -- figure out records and columns
  // console.log('c1')
  const dataTable: DataTable = {}

  const csv = Papaparse.parse(text, {
    // preview: 10000,
    delimitersToGuess: ['\t', ';', ','],
    comments: '#',
    dynamicTyping: false,
    header: false,
    skipEmptyLines: true,
  })

  // step: (results: any, parser) => {
  //   rowCount++
  //   const row = results.data

  //   // if (rowCount % 8192 === 0) console.log(row)

  //   // console.log(row)
  //   const keys = Object.keys(row)
  //   for (let column = 0; column < keys.length; column++) {
  //     const key = keys[column]
  //     if (!dataTable[key]) {
  //       dataTable[key] = { name: key, values: [], type: DataType.NUMBER } // DONT KNOW TYPE YET
  //     }

  //     const v = row[key]
  //     const float = parseFloat(v)
  //     if (column === 0 || isNaN(float)) {
  //       dataTable[key].values[rowCount] = v
  //     } else {
  //       dataTable[key].values[rowCount] = float
  //     }
  //   }
  // },
  // complete: results => {
  //   console.log('finished parsing', fileKey)
  //   let firstColumnName = ''

  //   for (const columnName in dataTable) {
  //     // first column is special: it contains the linkID
  //     // TODO: This is obviously wrong; we need a way to specify this from User
  //     if (!firstColumnName) {
  //       firstColumnName = columnName
  //       continue
  //     }

  //     // figure out types
  //     const column = dataTable[columnName]
  //     if (typeof column.values[0] == 'string') column.type = DataType.STRING
  //     if (typeof column.values[0] == 'boolean') column.type = DataType.BOOLEAN

  //     // convert numbers to Float32Arrays
  //     if (column.type === DataType.NUMBER) {
  //       const fArray = new Float32Array(column.values)
  //       column.values = fArray

  //       // calculate max for numeric columns
  //       let max = -Infinity
  //       for (const value of column.values) max = Math.max(max, value)
  //       column.max = max
  //     }
  //   }

  // and save it
  _fileData[fileKey] = dataTable

  // })
}

async function loadFileOrGzipFile(filename: string) {
  /**
   * This recursive function gunzips the buffer. It is recursive because
   * some combinations of subversion, nginx, and various web browsers
   * can single- or double-gzip .gz files on the wire. It's insane but true.
   */
  function gUnzip(buffer: any): Uint8Array {
    // GZIP always starts with a magic number, hex $8b1f
    const header = new Uint8Array(buffer.slice(0, 2))
    if (header[0] === 0x1f && header[1] === 0x8b) {
      return gUnzip(pako.inflate(buffer))
    }
    return buffer
  }

  const filepath = `${_subfolder}/${filename}`

  // fetch the file
  const blob = await _fileSystem.getFileBlob(filepath)
  if (!blob) throw Error('BLOB IS NULL')
  const buffer = await blob.arrayBuffer()

  // recursively gunzip until it can gunzip no more:
  const unzipped = gUnzip(buffer)

  return unzipped
}
