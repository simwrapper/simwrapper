import * as Comlink from 'comlink'
// import { SaxEventType, SAXParser, Detail, Tag, Attribute } from 'sax-wasm'
import pako from 'pako'

import { parseXML } from '@/js/util'
import AllEventLayers from './_views'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import globalStore from '@/store'

// read one chunk at a time. This sends backpressure to the server
const strategy = new CountQueuingStrategy({ highWaterMark: 1 })
// 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
const MAX_CHUNK_SIZE = 1024 * 1024 * 8
// This is the number of dots per layer. Deck.gl advises < 1million
const MAX_ARRAY_LENGTH = 1200127

const Task = {
  filename: '',
  fsConfig: null as FileSystemConfig | null,
  fileApi: {} as HTTPFileSystem,
  streamProcessorWithBackPressure: WritableStream,

  _layers: {} as any,
  _numChunks: 0,
  _dataLength: 0,
  _isCancelled: false,
  _leftOvers: '',
  _decoder: new TextDecoder(),
  _eventTypes: [] as string[],

  _currentTranch: [] as any[],

  // Pako library has gunzip chunking mode!
  _gunzipper: new pako.Inflate({ to: 'string', chunkSize: 524288 }),

  _isGzipped: false,
  _cbUnzipChunkComplete: {} as any,

  _queue: [] as any[],

  _cbReporter: null as any,

  async startStream(
    props: {
      filename: string
      network: any
      layers: any
      fsConfig: FileSystemConfig
    },
    cbReportNewData: Function
  ) {
    try {
      console.log('----starting event stream')
      const { filename, fsConfig } = props

      this._cbReporter = cbReportNewData

      this._gunzipper.onData = (chunk: any) => {
        this._queue.push(chunk)
      }
      this._gunzipper.onEnd = (status: number) => {
        console.log('gzipper onEnd', status)
      }

      this._layers = props.layers.map((L: any) => new AllEventLayers[L.viewer](props))

      this.filename = filename
      this.fsConfig = fsConfig
      this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

      const stream = await this.fileApi.getFileStream(filename)
      if (!stream) throw Error('STREAM is null')

      const streamProcessorWithBackPressure = this.createStreamProcessor()
      await stream.pipeTo(streamProcessorWithBackPressure)

      // postMessage({ finished: true })

      // stream will handle things from here
    } catch (e) {
      postMessage({ error: 'Error loading ' + this.filename })
    }

    return []
  },

  sendDataToLayersForProcessing(events: any[]) {
    for (const layer of this._layers) {
      const { data, timeRange } = layer.processEvents(events)

      this._cbReporter({ data, timeRange })

      // postMessage(
      //   {
      //     events: oneChunk,
      //     times: this._currentTimes,
      //     vehicleTrips: this._vehicleTrips,
      //   },
      //   [this._currentTimes.buffer]
      // )
    }
  },

  async convertXMLtoEventArray(lines: string[]) {
    const events = []
    const isEvent = /<event /

    for (const line of lines) {
      if (isEvent.test(line)) {
        const xml = (await parseXML(line, {
          alwaysArray: [],
          attributeNamePrefix: '',
        })) as any

        xml.event.time = parseFloat(xml.event.time)
        events.push(xml.event)
      }
    }
    return events
  },

  async handleText(chunkText: string) {
    // console.log('----handling text length', chunkText.length)
    // reconstruct first line taking mid-line breaks into account
    let text = this._leftOvers + chunkText

    const lastLF = text.lastIndexOf('\n')
    this._leftOvers = text.slice(lastLF + 1)
    text = text.slice(0, lastLF)

    const lines = text.split('\n')
    const events = await this.convertXMLtoEventArray(lines)

    // push all the events (for now)
    this._currentTranch.push(...events)

    // Notify all the layers they have some work to do!
    if (this._currentTranch.length > MAX_ARRAY_LENGTH) {
      const oneChunk = this._currentTranch.slice(0, MAX_ARRAY_LENGTH)
      this.sendDataToLayersForProcessing(oneChunk)
      this._currentTranch = this._currentTranch.slice(MAX_ARRAY_LENGTH)
    }
  },

  createStreamProcessor() {
    const parent = this
    return new WritableStream(
      {
        // Stream calls write() for every new chunk from fetch call:
        write(entireChunk: Uint8Array) {
          return new Promise(async (resolve, reject) => {
            if (parent._isCancelled) reject()

            const parseIt = async (smallChunk: Uint8Array, chunkId: number) => {
              if (parent._isCancelled) reject()

              // check for gzip at start
              if (parent._numChunks == 1) {
                const header = new Uint8Array(smallChunk.buffer.slice(0, 2))
                if (header[0] === 0x1f && header[1] === 0x8b) parent._isGzipped = true
              }

              if (parent._isGzipped) {
                parent._gunzipper.push(smallChunk)

                while (parent._queue.length) {
                  const text = parent._queue.shift()
                  await parent.handleText(text)
                }
                // console.log('queue empty')
              } else {
                const chunkText = parent._decoder.decode(smallChunk)
                parent.handleText(chunkText)
              }
            }

            parent._numChunks++
            parent._dataLength += entireChunk.length
            let startOffset = 0

            console.log('----got chunk')

            while (!parent._isCancelled && startOffset < entireChunk.length) {
              const subchunk = entireChunk.subarray(startOffset, startOffset + MAX_CHUNK_SIZE)

              if (subchunk.length) await parseIt(subchunk, parent._numChunks)
              startOffset += MAX_CHUNK_SIZE
            }

            resolve()
          })
        },

        close() {
          // console.log('STREAM FINISHED! Orphans:', JSON.stringify(_vehiclesOnLinks))
          console.log('STREAM FINISHED! ')
          parent.sendDataToLayersForProcessing(parent._currentTranch)

          // Orphans:', Object.keys(parent._vehiclesOnLinks).length)
          // console.log(
          //   'final vehicle trips:',
          //   _vehicleTrips.length,
          //   _vehicleTrips[_vehicleTrips.length - 1]
          //   // JSON.stringify(_vehicleTrips)
          // )
          // _currentTimes.set(_currentTranch.map(m => m.time))
          // _currentTimes = _currentTimes.subarray(0, _currentTranch.length)

          console.log('TODO CLOSE! Need to process final data!!')
          // postMessage(
          //   {
          //     events: _currentTranch,
          //     times: _currentTimes,
          //     vehicleTrips: _vehicleTrips,
          //   },
          //   [_currentTimes.buffer]
          // )
        },
        abort(err) {
          console.log('STREAM error:', err)
        },
      },
      strategy
    )
  },
}
Comlink.expose(Task)
