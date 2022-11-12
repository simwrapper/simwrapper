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

onmessage = ({ data: { filePath, fileSystem } }: MessageEvent) => {
  readStream(filePath, fileSystem)
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

const MAX_ARRAY_LENGTH = 734567

let _currentTranch = [] as any[]
let _currentTimes = new Float32Array(MAX_ARRAY_LENGTH).fill(NaN)

const streamProcessorWithBackPressure = new WritableStream(
  {
    write(entireChunk: Uint8Array) {
      return new Promise((resolve, reject) => {
        if (_isCancelled) reject()

        _numChunks++
        _dataLength += entireChunk.length
        let startOffset = 0

        // console.log('got chunk', _numChunks)

        const parseIt = async (smallChunk: Uint8Array) => {
          if (_isCancelled) reject()
          // reconstruct first line taking mid-line breaks into account
          let text = _leftOvers + _decoder.decode(smallChunk)

          const lastLF = text.lastIndexOf('\n')
          _leftOvers = text.slice(lastLF + 1)
          text = text.slice(0, lastLF)

          const lines = text.split('\n')

          const events = await processLines(lines)

          _currentTranch.push(...events)

          if (_currentTranch.length > MAX_ARRAY_LENGTH) {
            const oneChunk = _currentTranch.slice(0, MAX_ARRAY_LENGTH)
            _currentTimes.set(oneChunk.map(m => m.time))

            postMessage({ events: oneChunk, times: _currentTimes }, [_currentTimes.buffer])
            _currentTranch = _currentTranch.slice(MAX_ARRAY_LENGTH)
            _currentTimes = new Float32Array(MAX_ARRAY_LENGTH)
          }
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
      _currentTimes.set(_currentTranch.map(m => m.time))
      _currentTimes = _currentTimes.subarray(0, _currentTranch.length)
      postMessage({ events: _currentTranch, times: _currentTimes }, [_currentTimes.buffer])
    },
    abort(err) {
      console.log('STREAM error:', err)
    },
  },
  strategy
)

async function processLines(lines: string[]) {
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

/*
 *
 * This recursive function gunzips the buffer. It is recursive because
 * some combinations of subversion, nginx, and various user browsers
 * can single- or double-gzip .gz files on the wire. It's insane but true.
 */
function gUnzip(buffer: any): any {
  // GZIP always starts with a magic number, hex 1f8b
  const header = new Uint8Array(buffer.slice(0, 2))
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return gUnzip(pako.inflate(buffer))
  }

  return buffer
}
