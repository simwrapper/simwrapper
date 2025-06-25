import * as Comlink from 'comlink'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

import init, { EventStreamer } from 'matsim-event-streamer'

import AllEventLayers from './_views'

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

  _currentTranch: [] as any[][],
  _currentTranchTotalLength: 0,

  _isGzipped: false,
  _cbUnzipChunkComplete: {} as any,

  _queue: [] as any[],

  _cbReporter: null as any,

  _eventStreamer: null as any,

  async startStream(
    props: {
      filename: string
      network: any
      layers: any
      fsConfig: FileSystemConfig
      follow?: string
    },
    cbReportNewData: Function
  ) {
    try {
      console.log('----starting event stream')
      const { filename, fsConfig } = props

      await init()
      this._eventStreamer = new EventStreamer()
      console.log('EVENT STREAM survived INIT')

      this._cbReporter = cbReportNewData

      // this._gunzipper.onData = (chunk: any) => {
      //   this._queue.push(chunk)
      // }
      // this._gunzipper.onEnd = (status: number) => {
      //   console.log('gzipper onEnd', status)
      // }

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

  sendDataToLayersForProcessing(events: any[][]) {
    for (const layer of this._layers) {
      const { data, timeRange } = layer.processEvents(events)

      this._cbReporter({ data, timeRange })
    }
  },

  async handleText(events: any[]) {
    // push all the events (for now)
    this._currentTranch.push(events)
    this._currentTranchTotalLength += events.length

    // Notify all the layers they have some work to do!
    if (this._currentTranchTotalLength > MAX_ARRAY_LENGTH) {
      // console.log('----batching off for processing:', this._currentTranchTotalLength)
      const oneSetOfChunks = [...this._currentTranch]
      this.sendDataToLayersForProcessing(oneSetOfChunks)
      // console.log('----done processing:', this._currentTranchTotalLength)
      this._currentTranch = [] // this._currentTranch.slice(MAX_ARRAY_LENGTH)
      this._currentTranchTotalLength = 0
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

            // console.log('====GOT LARGE CHUNK', entireChunk.length)
            const parseIt = async (smallChunk: Uint8Array, chunkId: number) => {
              if (parent._isCancelled) reject()

              // console.log('--sending chunk to WASM:', entireChunk.length)
              const rawEvents: string = await parent._eventStreamer.process(smallChunk)
              // console.log('--got text. parsing raw json string:', rawEvents.length)
              const events = JSON.parse(rawEvents)
              // console.log('--handling event rows:', events.length)
              await parent.handleText(events)
            }

            parent._numChunks++
            parent._dataLength += entireChunk.length
            let startOffset = 0

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
