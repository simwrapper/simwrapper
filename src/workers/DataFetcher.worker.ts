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
}) {
  _config = props.config
  _dataset = _config.dataset

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

  const columnNames: string[] = []

  const csv = Papaparse.parse(text, {
    // preview: 10000,
    delimitersToGuess: ['\t', ';', ','],
    comments: '#',
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
    step: (results: any, parser) => {
      const row = results.data
      // console.log(row)
      for (const key in row) {
        if (!dataTable[key]) {
          dataTable[key] = { name: key, values: [], type: DataType.NUMBER } // DONT KNOW TYPE YET
        }
        ;(dataTable[key].values as any[]).push(row[key])
      }
    },
    complete: results => {
      let firstColumnName = ''
      for (const columnName in dataTable) {
        // first column is special: it contains the linkID
        // TODO: This is obviously wrong; we need a way to specify this from User
        if (!firstColumnName) {
          firstColumnName = columnName
          continue
        }

        // figure out types
        const column = dataTable[columnName]
        if (typeof column.values[0] == 'string') column.type = DataType.STRING
        if (typeof column.values[0] == 'boolean') column.type = DataType.BOOLEAN

        // convert numbers to Float32Arrays
        if (column.type === DataType.NUMBER) {
          const fArray = new Float32Array(column.values)
          column.values = fArray

          // calculate max for numeric columns
          let max = -Infinity
          for (const value of column.values) max = Math.max(max, value)
          column.max = max
        }
      }

      // and save it
      _fileData[fileKey] = dataTable
    },
  })
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
