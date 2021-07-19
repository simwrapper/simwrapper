// named *thread* because *worker* gets processed by webpack already

/*eslint prefer-rest-params: "off"*/

import { expose } from 'threads/worker'
import pako from 'pako'
import Papaparse from 'papaparse'
import YAML from 'yaml'
import { parseNumbers } from 'xml2js/lib/processors'

import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { findMatchingGlobInFiles, parseXML } from '@/js/util'
import globalStore from '@/store'
import { config } from 'vue/types/umd'

// global variables
let _fileSystem: HTTPFileSystem
let _subfolder = ''
let _files: string[] = []
let _config: any = {}

const _fileData: any = {}

expose({
  async fetchData(props: {
    fileSystemConfig: FileSystemConfig
    subfolder: string
    files: string[]
    config: string
  }) {
    _fileSystem = new HTTPFileSystem(props.fileSystemConfig)
    _subfolder = props.subfolder
    _files = props.files
    _config = props.config

    // load all files
    await loadFiles()

    return _fileData[_config.dataset]
  },
})

// ----- helper functions ------------------------------------------------

async function loadFiles() {
  const datasetPattern = _config.dataset

  try {
    // figure out which file to load
    const matchingFiles = findMatchingGlobInFiles(_files, datasetPattern)

    if (matchingFiles.length == 0) throw Error(`No files matched pattern ${datasetPattern}`)
    if (matchingFiles.length > 1)
      throw Error(`More than one file matched pattern ${datasetPattern}: ${matchingFiles}`)

    const filename = matchingFiles[0]

    // load the file
    const text = await loadFileOrGzipFile(filename)

    // handle the various filetypes: csv, xml...
    await parseVariousFileTypes(datasetPattern, filename, text)
    cleanData()
  } catch (e) {
    console.error(e)
    throw e
  }
}

function cleanData() {
  const data = _fileData[_config.dataset]

  // remove extra columns
  if (_config.ignoreColumns) {
    if (Array.isArray(data)) {
      for (const row of data) {
        _config.ignoreColumns.forEach((column: string) => delete row[column])
      }
    } else {
      _config.ignoreColumns.forEach((column: string) => delete data[column])
    }
  }
}

async function parseVariousFileTypes(fileKey: string, filename: string, text: string) {
  // XML
  if (filename.indexOf('.xml') > -1) {
    const xml = (await parseXML(text, {
      mergeAttrs: true,
      explicitArray: false,
      attrValueProcessors: [parseNumbers],
    })) as any

    // Do a splitty lookup if the xmlElement is specified
    const details = _config
    if (details.xmlElements) {
      const subelements = details.xmlElements.split('.')
      const subXML = drillIntoXML(xml, subelements)
      _fileData[fileKey] = subXML
    } else {
      _fileData[fileKey] = xml
    }

    return

    function drillIntoXML(parent: any, tag: any): any {
      if (Array.isArray(tag) && tag.length > 0) return drillIntoXML(parent[tag[0]], tag.slice(1))
      return parent
    }
  }

  // if it isn't XML, then let's hope assume Papaparse can handle it
  const csv = Papaparse.parse(text, {
    // preview: 10000,
    delimitersToGuess: ['\t', ';', ','],
    comments: '#',
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  }).data

  // if useLastRow, do that
  if (_config.useLastRow) {
    const lastRow = csv[csv.length - 1]
    _fileData[fileKey] = lastRow
  } else {
    _fileData[fileKey] = csv
  }
}

async function loadFileOrGzipFile(filename: string) {
  const filepath = `${_subfolder}/${filename}`

  // fetch the file
  const blob = await _fileSystem.getFileBlob(filepath)
  if (!blob) throw Error('BLOB IS NULL')
  const buffer = await blob.arrayBuffer()

  // recursively gunzip until it can gunzip no more:
  const unzipped = gUnzip(buffer)

  // convert to utf-8
  const text = new TextDecoder().decode(unzipped)

  return text

  /**
   * This recursive function gunzips the buffer. It is recursive because
   * some combinations of subversion, nginx, and various web browsers
   * can single- or double-gzip .gz files on the wire. It's insane but true.
   */
  function gUnzip(buffer: any): Uint8Array {
    // GZIP always starts with a magic number, hex $1f8b
    const header = new Uint8Array(buffer.slice(0, 2))
    if (header[0] === 0x1f && header[1] === 0x8b) {
      return gUnzip(pako.inflate(buffer))
    }
    return buffer
  }
}
