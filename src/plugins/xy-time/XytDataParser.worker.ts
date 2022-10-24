/**
 * Load a gzip file, parse its contents and return a set of ArrayBuffers for display.
 */
import pako from 'pako'
import Papaparse from 'papaparse'
import colormap from 'colormap'

import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import Coords from '@/js/Coords'
import { findMatchingGlobInFiles } from '@/js/util'

// -----------------------------------------------------------
onmessage = function (e) {
  startLoading(e.data)
}
// -----------------------------------------------------------

const LAYER_SIZE = 25 * 1024 * 1024

interface RowCache {
  [id: string]: { raw: Float32Array; length: number; coordColumns: number[] }
}

interface Aggregations {
  [heading: string]: {
    title: string
    x: string
    y: string
  }[]
}

let totalLines = 0
let proj = 'EPSG:4326'

const rowCache: RowCache = {}
const columnLookup: number[] = []

/**
 * Begin loading the file, and return status updates
 * as observables. When observable is complete, the
 * processing is finished and results can be obtained
 * by calling results().
 */
async function startLoading(props: {
  filepath: string
  fileSystem: FileSystemConfig
  aggregations: Aggregations
  projection: string
}) {
  proj = props.projection

  const url = await step1PrepareFetch(props.filepath, props.fileSystem)
  step2fetchCSVdata(url)
  // postMessage({ status: 'Drawing...' })
  postMessage({ finished: true })
}

// --- helper functions ------------------------------------------------

// Return a chunk of results after processing is complete.
function postResults(layerData: {
  coordinates: Float32Array
  time: Float32Array
  color: Uint8Array
}) {
  postMessage(layerData, [
    layerData.coordinates.buffer,
    layerData.time.buffer,
    layerData.color.buffer,
  ])
}

async function step1PrepareFetch(filepath: string, fileSystem: FileSystemConfig) {
  let unzipped

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

let layerData = {
  time: new Float32Array(LAYER_SIZE),
  coordinates: new Float32Array(LAYER_SIZE * 2),
  color: new Uint8Array(LAYER_SIZE * 3),
}

let offset = 0
let totalRowsRead = 0

const NUM_BUCKETS = 12
const colors = colormap({
  colormap: 'greens', // colorRamp,
  nshades: NUM_BUCKETS,
  format: 'rba',
  alpha: 1,
}).map((c: number[]) => [c[0], c[1], c[2]])

function appendResults(results: { data: any[] }) {
  const numRows = results.data.length

  const rowsToFill = Math.min(numRows, LAYER_SIZE - offset)

  // Fill the array as much as we can
  for (let i = 0; i < rowsToFill; i++) {
    const row = results.data[i] as any

    const wgs84 = Coords.toLngLat(proj, [row.x, row.y])
    layerData.coordinates[(offset + i) * 2] = wgs84[0]
    layerData.coordinates[(offset + i) * 2 + 1] = wgs84[1]
    layerData.time[offset + i] = row.time || row.t || 0
    // choose color buckets
    const bucket = Math.min(NUM_BUCKETS - 1, Math.floor((NUM_BUCKETS * row.value) / 0.05))
    layerData.color.set(colors[bucket], 3 * (offset + i))
  }

  offset += rowsToFill
  totalRowsRead += rowsToFill
  postMessage({ status: `Loading rows: ${totalRowsRead}...` })
  // console.log('new offset', offset)

  // Are we full?
  if (offset === LAYER_SIZE) {
    // console.log('FULL! Posting')
    postResults(layerData)
    offset = 0
    layerData = {
      coordinates: new Float32Array(LAYER_SIZE * 2),
      time: new Float32Array(LAYER_SIZE),
      color: new Uint8Array(LAYER_SIZE * 3),
    }
  }

  // is there more to load?
  // console.log(rowsToFill, numRows)
  if (rowsToFill < numRows) {
    const remainingData = { data: results.data.slice(rowsToFill) }
    // console.log('calling again', remainingData)
    appendResults(remainingData)
    // } else {
    //   console.log(numRows)
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
    const subarray = {
      time: layerData.time.subarray(0, offset),
      coordinates: layerData.coordinates.subarray(0, offset * 2),
      color: layerData.color.subarray(0, offset * 3),
    }
    postResults(subarray)
  }

  // postMessage({ status: 'Trimming results...' })
  // // now filter zero-cells out: some rows don't have coordinates, and they
  // // will mess up the total calculations
  // for (const key of Object.keys(rowCache)) {
  //   // this is dangerous: only works if BOTH the x and the y are zero; otherwise
  //   // it will get out of sync and things will look crazy or crash HAHahahAHHAA

  //   // rowCache[key].raw = rowCache[key].raw.filter(elem => elem !== 0) // filter zeroes
  //   rowCache[key].length = rowCache[key].raw.length / 2
  // }

  // postResults(coordinates, time)
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
