// --- WORKER PREAMBLE ---------------------------------------
// This lets typescript know we are in a worker, not a window
const ctx: Worker = self as any
// make the typescript compiler happy on import
export default null as any
// -----------------------------------------------------------

import pako from 'pako'
import { parseXML } from '@/js/util'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

// read one chunk at a time. This sends backpressure to the server
const strategy = new CountQueuingStrategy({ highWaterMark: 1 })

// 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
const MAX_CHUNK_SIZE = 1024 * 1024 * 8

// This is the number of dots per layer. Deck.gl advises < 1million
const MAX_ARRAY_LENGTH = 1200127

onmessage = async ({ data: { filePath, fileSystem } }: MessageEvent) => {
  await readStream(filePath, fileSystem)
}

async function readStream(filePath: string, fileSystem: FileSystemConfig) {
  try {
    console.log(filePath)
    const httpFileSystem = new HTTPFileSystem(fileSystem)
    const stream = await httpFileSystem.getFileStream(filePath)
    if (!stream) throw Error('STREAM is null')

    await stream.pipeTo(streamProcessorWithBackPressure)
    ctx.postMessage({ finished: true })

    // stream will handle things from here
  } catch (e) {
    ctx.postMessage({ error: 'Error loading ' + filePath })
  }
}

let _numChunks = 0
let _dataLength = 0
let _isCancelled = false
let _leftOvers = ''
let _decoder = new TextDecoder()
let _eventTypes = [] as string[]

let _currentTranch = [] as any[]
let _currentTimes = new Float32Array(MAX_ARRAY_LENGTH).fill(NaN)

// pathStart(xy),pathEnd(xy),timeStart,timeEnd = 6 numbers
let _vehicleTrips = [] as any[]
let _vehiclesOnLinks = {} as any

// Pako library has gunzip chunking mode!
let _isGzipped = false

const _gunzipper = new pako.Inflate({ to: 'string', chunkSize: 524288 })
const _queue = [] as any[]

_gunzipper.onData = (chunk: any) => {
  _queue.push(chunk)
}

_gunzipper.onEnd = (status: number) => {
  console.log('gzipper onEnd', status)
}

const handleText = async (chunkText: string) => {
  // reconstruct first line taking mid-line breaks into account
  let text = _leftOvers + chunkText

  const lastLF = text.lastIndexOf('\n')
  _leftOvers = text.slice(lastLF + 1)
  text = text.slice(0, lastLF)

  const lines = text.split('\n')
  const events = await convertXMLtoEventArray(lines)

  calculateVehicleTrips(events)

  // push all the events (for now)
  _currentTranch.push(...events)

  if (_currentTranch.length > MAX_ARRAY_LENGTH) {
    const oneChunk = _currentTranch.slice(0, MAX_ARRAY_LENGTH)
    _currentTimes.set(oneChunk.map(m => m.time))

    postMessage(
      {
        events: oneChunk,
        times: _currentTimes,
        vehicleTrips: _vehicleTrips,
      },
      [_currentTimes.buffer]
    )
    // console.log(_vehicleTrips.length, 'vtrips')
    _currentTranch = _currentTranch.slice(MAX_ARRAY_LENGTH)
    _currentTimes = new Float32Array(MAX_ARRAY_LENGTH)
    _vehicleTrips = []
  }
}

const streamProcessorWithBackPressure = new WritableStream(
  {
    // Stream calls write() for every new chunk from fetch call:
    write(entireChunk: Uint8Array) {
      return new Promise(async (resolve, reject) => {
        if (_isCancelled) reject()

        const parseIt = async (smallChunk: Uint8Array, chunkId: number) => {
          if (_isCancelled) reject()

          // check for gzip at start
          if (_numChunks == 1) {
            const header = new Uint8Array(smallChunk.buffer.slice(0, 2))
            if (header[0] === 0x1f && header[1] === 0x8b) _isGzipped = true
          }

          if (_isGzipped) {
            _gunzipper.push(smallChunk)

            while (_queue.length) {
              const text = _queue.shift()
              await handleText(text)
            }
            // console.log('queue empty')
          } else {
            const chunkText = _decoder.decode(smallChunk)
            handleText(chunkText)
          }
        }

        _numChunks++
        _dataLength += entireChunk.length
        let startOffset = 0

        console.log('got chunk', _numChunks)

        while (!_isCancelled && startOffset < entireChunk.length) {
          const subchunk = entireChunk.subarray(startOffset, startOffset + MAX_CHUNK_SIZE)

          if (subchunk.length) await parseIt(subchunk, _numChunks)
          startOffset += MAX_CHUNK_SIZE
        }

        resolve()
      })
    },

    close() {
      // console.log('STREAM FINISHED! Orphans:', JSON.stringify(_vehiclesOnLinks))
      console.log('STREAM FINISHED! Orphans:', Object.keys(_vehiclesOnLinks).length)
      console.log(
        'final vehicle trips:',
        _vehicleTrips.length,
        _vehicleTrips[_vehicleTrips.length - 1]
        // JSON.stringify(_vehicleTrips)
      )
      _currentTimes.set(_currentTranch.map(m => m.time))
      _currentTimes = _currentTimes.subarray(0, _currentTranch.length)
      postMessage(
        {
          events: _currentTranch,
          times: _currentTimes,
          vehicleTrips: _vehicleTrips,
        },
        [_currentTimes.buffer]
      )
    },
    abort(err) {
      console.log('STREAM error:', err)
    },
  },
  strategy
)

function calculateVehicleTrips(events: any[]) {
  // splice out vehicle trips
  for (const event of events) {
    switch (event.type) {
      case 'vehicle enters traffic':
      case 'entered link':
        _vehiclesOnLinks[event.vehicle] = event.time
        break
      case 'left link':
        if (event.vehicle in _vehiclesOnLinks) {
          _vehicleTrips.push({
            link: event.link,
            t0: _vehiclesOnLinks[event.vehicle],
            t1: event.time,
          })
          _vehiclesOnLinks[event.vehicle] = event.time
        }
      case 'vehicle leaves traffic':
        if (event.vehicle in _vehiclesOnLinks) {
          _vehicleTrips.push({
            link: event.link,
            t0: _vehiclesOnLinks[event.vehicle],
            t1: event.time,
          })
        }
        delete _vehiclesOnLinks[event.vehicle]
        break
      default:
        break
    }
  }
}

async function convertXMLtoEventArray(lines: string[]) {
  const events = []

  const isEvent = /<event /
  for (const line of lines) {
    if (isEvent.test(line)) {
      const xml = (await parseXML(line, {
        alwaysArray: [],
        attributeNamePrefix: '',
      })) as any

      // console.log(JSON.stringify(xml.event))
      // if (xml.event.type !== 'entered link') continue

      xml.event.time = parseFloat(xml.event.time)

      // // eventType lookup to save memory
      // let eventType = _eventTypes.indexOf(xml.event.type)
      // if (eventType == -1) {
      //   _eventTypes.push(xml.event.type)
      //   eventType = _eventTypes.length - 1
      // }

      events.push(xml.event)
    }
  }
  return events
}
