/**
 * Load a *.xyt.csv file, parse it, and return a set of ArrayBuffers for display.
 */
import Papa from '@simwrapper/papaparse'

import { FileSystemConfig } from '@/Globals'
import { findMatchingGlobInFiles } from '@/js/util'
import Coords from '@/js/Coords'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const LAYER_SIZE = 0.5 * 1024 * 1024

interface PointData {
  time: Float32Array
  value: Float32Array
  coordinates: Float32Array
  timeRange: number[]
}

let layerData: PointData = {
  time: new Float32Array(LAYER_SIZE),
  value: new Float32Array(LAYER_SIZE),
  coordinates: new Float32Array(LAYER_SIZE * 2),
  timeRange: [Infinity, -Infinity],
}

let _filename = ''
let _proj = 'EPSG:4326'
let _rangeOfValues = [Infinity, -Infinity]
let _offset = 0
let _totalRowsRead = 0
let _httpFileSystem: HTTPFileSystem
let _readableStream: ReadableStream
let _header = ''
let _isCancelled = false
let _isEPSGinComment = false

// -----------------------------------------------------------
onmessage = function (e) {
  if (e.data.terminate) {
    _isCancelled = true
    console.log(666, 'cancelled')
  } else if (e.data.userCRS) {
    // restarting with a user-supplied CRS
    _proj = e.data.userCRS.toUpperCase()
    console.log('NEW CRS:', _proj)
    step2fetchCSVdata(_filename)
  } else {
    // initial launch
    startLoading(e.data)
  }
}
// -----------------------------------------------------------

async function startLoading(props: {
  filepath: string
  fileSystem: FileSystemConfig
  projection: string
}) {
  if (props.projection) _proj = props.projection.toUpperCase()

  _filename = await step1PrepareFetch(props.filepath, props.fileSystem)
  step2fetchCSVdata(_filename)
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
    _httpFileSystem = new HTTPFileSystem(fileSystem)

    // figure out which file to load with *? wildcards
    let expandedFilename = filepath

    if (filepath.indexOf('*') > -1 || filepath.indexOf('?') > -1) {
      const zDataset = filepath.substring(1 + filepath.lastIndexOf('/'))
      const zSubfolder = filepath.substring(0, filepath.lastIndexOf('/'))

      // fetch list of files in this folder
      const { files } = await _httpFileSystem.getDirectory(zSubfolder)
      const matchingFiles = findMatchingGlobInFiles(files, zDataset)
      if (matchingFiles.length == 0) throw Error(`No files matched "${zDataset}"`)
      if (matchingFiles.length > 1)
        throw Error(`More than one file matched "${zDataset}": ${matchingFiles}`)
      expandedFilename = `${zSubfolder}/${matchingFiles[0]}`
    }

    // got true filename, away we go
    return expandedFilename
  } catch (e) {
    console.error('' + e)
    postMessage({ error: 'Error loading: ' + filepath })
    throw Error('LOAD FAIL! ' + filepath)
  }
}

function appendResults(results: { data: any[]; comments: any[] }) {
  // set EPSG if we have it in CSV file

  if (!_isEPSGinComment) {
    for (const comment of results.comments) {
      const epsg = comment.indexOf('EPSG:')
      if (epsg > -1) {
        _proj = comment.slice(epsg)
        console.log(_proj, 'found in CSV comment')
        _isEPSGinComment = true
        break
      }
    }
  }

  // if we don't have a valid projection, squawk and ask user
  try {
    if (_proj === 'EPSG:4326') {
      const row = results.data[0]
      const x = row.x || row.X || row.lon || row.longitude
      const y = row.y || row.Y || row.lat || row.latitude
      if (x > 180 || x < -180 || y < -90 || y > 90) {
        _isCancelled = true
        console.log('DATA CHUNK RECEIVED -- BUT NO CRS!', results.data.length)
        postMessage({ needCRS: true })
        return
      }
    }
  } catch (e) {
    console.warn('Projection fail: ' + e)
  }

  // Loop through everything
  const numRows = results.data.length
  const rowsToFill = Math.min(numRows, LAYER_SIZE - _offset)
  const xy = [0, 0]

  for (let i = 0; i < rowsToFill; i++) {
    const row = results.data[i] as any
    try {
      xy[0] = row.x || row.X || row.lon || row.longitude
      xy[1] = row.y || row.Y || row.lat || row.latitude
      const wgs84 = Coords.toLngLat(_proj, xy)

      layerData.coordinates[(_offset + i) * 2] = wgs84[0]
      layerData.coordinates[(_offset + i) * 2 + 1] = wgs84[1]
      layerData.time[_offset + i] = row.time || row.t || 0
      layerData.value[_offset + i] = row.value || 0
    } catch (e) {
      // bad row; don't increment i
      console.warn('bad row: ', i, row)
    }
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
    appendResults(remainingData)
  } else {
    postMessage({ status: `Loading rows: ${_totalRowsRead}...` })
  }
}

// this version reads a STREAM. crazy future!
async function step2fetchCSVdata(filename: string) {
  let _numChunks = 0
  let data = 0
  _header = ''
  _rangeOfValues = [Infinity, -Infinity]
  _offset = 0
  _totalRowsRead = 0

  let _decoder = new TextDecoder()
  let leftOvers = ''

  console.log('STARTING stream:', filename)

  // 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
  const MAX_CHUNK_SIZE = 1024 * 1024 * 8

  // read one chunk at a time. This sends backpressure to the server
  const strategy = new CountQueuingStrategy({ highWaterMark: 1 })

  // Let's try a writablestream, which the docs say creates
  // backpressure automatically:
  // https://developer.mozilla.org/en-US/docs/Web/API/WritableStream
  const streamProcessorWithBackPressure = new WritableStream(
    {
      // Implement the sink
      write(entireChunk: Uint8Array) {
        return new Promise((resolve, reject) => {
          _numChunks++
          data += entireChunk.length
          let startOffset = 0

          const parseIt = (smallChunk: Uint8Array) => {
            if (_isCancelled) reject()
            // reconstruct first line taking mid-line breaks into account
            let text = _header + leftOvers + _decoder.decode(smallChunk)

            // append the header to every chunk -- save it if we don't have it yet
            if (!_header) _header = constructHeader(text)

            const lastLF = text.lastIndexOf('\n')
            leftOvers = text.slice(lastLF + 1)
            text = text.slice(0, lastLF)

            const results = Papa.parse(text, {
              header: true,
              skipEmptyLines: true,
              dynamicTyping: true,
              comments: '#',
              delimitersToGuess: [';', '\t', ',', ' '],
            }) as any

            if (_isCancelled) reject()
            else appendResults(results)
          }

          while (!_isCancelled && startOffset < entireChunk.length) {
            const subchunk = entireChunk.subarray(startOffset, startOffset + MAX_CHUNK_SIZE)

            if (subchunk.length) parseIt(subchunk)
            startOffset += MAX_CHUNK_SIZE
          }

          resolve()
        })
      },

      close() {
        console.log('STREAM FINISHED!')
      },
      abort(err) {
        console.log('STREAM error:', err)
      },
    },
    strategy
  )

  try {
    // get the readable stream from the server
    _readableStream = await _httpFileSystem.getFileStream(filename)

    // stream results through the data pipe
    if (filename.toLocaleLowerCase().endsWith('.gz')) {
      const gunzipper = new DecompressionStream('gzip')
      await _readableStream.pipeThrough(gunzipper).pipeTo(streamProcessorWithBackPressure)
    } else {
      await _readableStream.pipeTo(streamProcessorWithBackPressure)
    }
  } catch (e) {
    console.error('' + e)
    postMessage({ error: '' + e })
  }

  console.log('Total chunks:', _numChunks)
  console.log('Total data:', data)

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

function constructHeader(text: string) {
  const topLines = text.slice(0, 4096).split('\n')
  for (const line of topLines) {
    if (line.startsWith('#')) continue
    return line + '\n'
  }
  return ''
}
