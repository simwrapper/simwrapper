/**
 * Load a *.xyt.csv file, parse it, and return a set of ArrayBuffers for display.
 */
import Papaparse from 'papaparse'

import { FileSystemConfig } from '@/Globals'
import { findMatchingGlobInFiles } from '@/js/util'
import Coords from '@/js/Coords'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const LAYER_SIZE = 0.5 * 1024 * 1024

let _url = ''
let _proj = 'EPSG:4326'
let _rangeOfValues = [Infinity, -Infinity]
let _offset = 0
let _totalRowsRead = 0

// -----------------------------------------------------------
onmessage = function (e) {
  if (!e.data.userCRS) {
    // initial launch
    startLoading(e.data)
  } else {
    // restarting with a user-supplied CRS
    _proj = e.data.userCRS
    console.log('NEW CRS:', _proj)
    step2fetchCSVdata(_url)
  }
}
// -----------------------------------------------------------

async function startLoading(props: {
  filepath: string
  fileSystem: FileSystemConfig
  projection: string
}) {
  if (props.projection) _proj = props.projection

  _url = await step1PrepareFetch(props.filepath, props.fileSystem)
  step2fetchCSVdata(_url)
}

interface PointData {
  time: Float32Array
  value: Float32Array
  coordinates: Float32Array
  timeRange: number[]
}

// --- helper functions ------------------------------------------------

// Return a chunk of results after processing is complete.
function postResults(layerData: PointData) {
  postMessage(layerData, [
    layerData.coordinates.buffer,
    layerData.time.buffer,
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
  timeRange: [Infinity, -Infinity],
}

function appendResults(results: { data: any[]; comments: any[] }, parser: any) {
  // set EPSG if we have it in CSV file
  for (const comment of results.comments) {
    const epsg = comment.indexOf('EPSG:')
    if (epsg > -1) {
      _proj = comment.slice(epsg)
      console.log(_proj, 'found in CSV comment')
      break
    }
  }

  // if we don't have a valid projection, squawk and ask user
  if (_proj === 'EPSG:4326') {
    const row = results.data[0]
    const x = row.x || row.X || row.lon || row.longitude
    const y = row.y || row.Y || row.lat || row.latitude
    if (x > 180 || x < -180 || y < -90 || y > 90) {
      console.log('DATA CHUNK RECEIVED -- BUT NO CRS!', results.data.length)
      parser.abort()
      postMessage({ needCRS: true })
      return
    }
  }

  const numRows = results.data.length
  const rowsToFill = Math.min(numRows, LAYER_SIZE - _offset)
  const xy = [0, 0]

  // Fill the array as much as we can
  for (let i = 0; i < rowsToFill; i++) {
    const row = results.data[i] as any
    xy[0] = row.x || row.X || row.lon || row.longitude
    xy[1] = row.y || row.Y || row.lat || row.latitude
    const wgs84 = Coords.toLngLat(_proj, xy)
    layerData.coordinates[(_offset + i) * 2] = wgs84[0]
    layerData.coordinates[(_offset + i) * 2 + 1] = wgs84[1]
    layerData.time[_offset + i] = row.time || row.t || 0
    layerData.value[_offset + i] = row.value || 0
  }

  layerData.timeRange[0] = Math.min(layerData.time[0], layerData.timeRange[0])
  layerData.timeRange[1] = Math.max(
    layerData.time[_offset + rowsToFill - 1],
    layerData.timeRange[1]
  )

  _rangeOfValues = layerData.value.reduce((prev, value) => {
    prev[0] = Math.min(prev[0], value)
    prev[1] = Math.max(prev[1], value)
    return prev
  }, _rangeOfValues)

  _offset += rowsToFill
  _totalRowsRead += rowsToFill

  // Are we full?
  if (_offset === LAYER_SIZE) {
    postResults(layerData)
    _offset = 0

    layerData = {
      coordinates: new Float32Array(LAYER_SIZE * 2),
      time: new Float32Array(LAYER_SIZE),
      value: new Float32Array(LAYER_SIZE),
      timeRange: [Infinity, -Infinity],
    }
  }

  // is there more to load?
  if (rowsToFill < numRows) {
    const remainingData = { data: results.data.slice(rowsToFill), comments: [] }
    appendResults(remainingData, parser)
  } else {
    postMessage({ status: `Loading rows: ${_totalRowsRead}...` })
  }
}

function step2fetchCSVdata(url: any) {
  try {
    Papaparse.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      dynamicTyping: true,
      comments: '#',
      chunk: appendResults,
    } as any)
    // }
  } catch (e) {
    console.log('' + e)
    postMessage({ error: 'ERROR parsing or projection coordinates' })
    return
  }

  // all done? post final arrays
  if (_offset) {
    const subarray: PointData = {
      time: layerData.time.subarray(0, _offset),
      coordinates: layerData.coordinates.subarray(0, _offset * 2),
      value: layerData.value.subarray(0, _offset),
      timeRange: layerData.timeRange,
    }
    // console.log('FINAL: Posting', offset)
    postResults(subarray)
    postMessage({ finished: true, range: _rangeOfValues })
  }
}
