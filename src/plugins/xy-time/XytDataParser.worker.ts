/**
 * Load a *.xyt.csv file, parse it, and return a set of ArrayBuffers for display.
 */
import pako from 'pako'
import Papaparse from 'papaparse'

import { FileSystemConfig } from '@/Globals'
import { findMatchingGlobInFiles } from '@/js/util'
import Coords from '@/js/Coords'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const LAYER_SIZE = 0.5 * 1024 * 1024

const NUM_BUCKETS = 12

let _proj = 'EPSG:4326'
let _rangeOfValues = [Infinity, -Infinity]

// -----------------------------------------------------------
onmessage = function (e) {
  startLoading(e.data)
}
// -----------------------------------------------------------

async function startLoading(props: {
  filepath: string
  fileSystem: FileSystemConfig
  projection: string
}) {
  _proj = props.projection

  const url = await step1PrepareFetch(props.filepath, props.fileSystem)
  step2fetchCSVdata(url)
  postMessage({ finished: true, range: _rangeOfValues })
}

interface PointData {
  time: Float32Array
  value: Float32Array
  color: Uint8Array
  coordinates: Float32Array
  timeRange: number[]
}

// --- helper functions ------------------------------------------------

// Return a chunk of results after processing is complete.
function postResults(layerData: PointData) {
  postMessage(layerData, [
    layerData.coordinates.buffer,
    layerData.time.buffer,
    layerData.color.buffer,
    layerData.value.buffer,
  ])
}

async function step1PrepareFetch(filepath: string, fileSystem: FileSystemConfig) {
  postMessage({ status: `Loading ${filepath}...` })

  try {
    const httpFileSystem = new HTTPFileSystem(fileSystem)

    // figure out which file to load with *? wildcards
    let expandedFilename = filepath

    if (filepath.indexOf('*') > -1 || filepath.indexOf('?') > -1) {
      const zDataset = filepath.substring(1 + filepath.lastIndexOf('/'))
      const zSubfolder = filepath.substring(0, filepath.lastIndexOf('/'))

      // fetch list of files in this folder
      const { files } = await httpFileSystem.getDirectory(zSubfolder)
      const matchingFiles = findMatchingGlobInFiles(files, zDataset)
      if (matchingFiles.length == 0) throw Error(`No files matched "${zDataset}"`)
      if (matchingFiles.length > 1)
        throw Error(`More than one file matched "${zDataset}": ${matchingFiles}`)
      expandedFilename = `${zSubfolder}/${matchingFiles[0]}`
    }

    // got true filename, add prefixes and away we go

    const url = `${fileSystem.baseURL}/${expandedFilename}`
    console.log(url)
    return url
  } catch (e) {
    console.error('' + e)
    postMessage({ error: 'Error loading: ' + filepath })
    throw Error('LOAD FAIL! ' + filepath)
  }
}

let layerData: PointData = {
  time: new Float32Array(LAYER_SIZE),
  value: new Float32Array(LAYER_SIZE),
  coordinates: new Float32Array(LAYER_SIZE * 2),
  color: new Uint8Array(LAYER_SIZE * 3),
  timeRange: [Infinity, -Infinity],
}

layerData.color.fill(128)

let offset = 0
let totalRowsRead = 0

function appendResults(results: { data: any[] }) {
  const numRows = results.data.length

  const rowsToFill = Math.min(numRows, LAYER_SIZE - offset)

  const xy = [0, 0]

  // Fill the array as much as we can
  for (let i = 0; i < rowsToFill; i++) {
    const row = results.data[i] as any
    xy[0] = row.x
    xy[1] = row.y
    const wgs84 = Coords.toLngLat(_proj, xy)
    layerData.coordinates[(offset + i) * 2] = wgs84[0]
    layerData.coordinates[(offset + i) * 2 + 1] = wgs84[1]
    layerData.time[offset + i] = row.time || row.t || 0
    layerData.value[offset + i] = row.value
  }

  layerData.timeRange[0] = Math.min(layerData.time[0], layerData.timeRange[0])
  layerData.timeRange[1] = Math.max(layerData.time[offset + rowsToFill - 1], layerData.timeRange[1])

  _rangeOfValues = layerData.value.reduce((prev, value) => {
    prev[0] = Math.min(prev[0], value)
    prev[1] = Math.max(prev[1], value)
    return prev
  }, _rangeOfValues)

  offset += rowsToFill
  totalRowsRead += rowsToFill

  // Are we full?
  if (offset === LAYER_SIZE) {
    postResults(layerData)
    offset = 0

    layerData = {
      coordinates: new Float32Array(LAYER_SIZE * 2),
      time: new Float32Array(LAYER_SIZE),
      color: new Uint8Array(LAYER_SIZE * 3),
      value: new Float32Array(LAYER_SIZE),
      timeRange: [Infinity, -Infinity],
    }
    layerData.color.fill(128)
  }

  // is there more to load?
  if (rowsToFill < numRows) {
    const remainingData = { data: results.data.slice(rowsToFill) }
    appendResults(remainingData)
  } else {
    postMessage({ status: `Loading rows: ${totalRowsRead}...` })
  }
}

function step2fetchCSVdata(url: any) {
  console.log('fetching chunks from:', url)
  try {
    Papaparse.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      chunk: appendResults,
    } as any)
    // }
  } catch (e) {
    console.log('' + e)
    postMessage({ error: 'ERROR projection coordinates' })
    return
  }

  // all done? post final arrays
  if (offset) {
    const subarray: PointData = {
      time: layerData.time.subarray(0, offset),
      coordinates: layerData.coordinates.subarray(0, offset * 2),
      color: layerData.color.subarray(0, offset * 3),
      value: layerData.value.subarray(0, offset),
      timeRange: layerData.timeRange,
    }
    // console.log('FINAL: Posting', offset)
    postResults(subarray)
  }
}

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
