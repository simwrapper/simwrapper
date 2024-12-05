import * as Comlink from 'comlink'

//@ts-ignore
// import streamer from './streamer.go'
// import init, { EventStreamer } from 'matsim-event-streamer'

import { parseXML, sleep } from '@/js/util'
import AllEventLayers from './_views'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import globalStore from '@/store'

// ------------------------------------------------------
// ------------ INITIALIZE WASM --------------------
// ------------------------------------------------------
import '/src/js/wasm_exec.js'
const WASM_URL = '/go-event-streamer.wasm'
var wasmStreamer: any
// ------------------------------------------------------

// read one chunk at a time. This sends backpressure to the server
const strategy = new CountQueuingStrategy({ highWaterMark: 1 })
// 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
const MAX_CHUNK_SIZE = 1024 * 1024 * 1
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

  // _eventStreamer: null as any,

  _ready: false,

  // ----- initialize the WASM module. This was a battle but it works now
  async initWasm() {
    if (this._ready) return
    //@ts-ignore
    const go = new Go() // from import wasm_exec.js
    var wasm: any
    const bytes = await (await fetch(WASM_URL)).arrayBuffer()
    const obj = await WebAssembly.instantiate(bytes, go.importObject)
    wasm = obj.instance
    go.run(wasm)
    wasmStreamer = wasm.exports

    console.log({ wasm, wasmStreamer })
    this._ready = true
  },
  // -----------------------------------------------

  async startStream(
    props: {
      filename: string
      network: any
      layers: any
      fsConfig: FileSystemConfig
    },
    cbReportNewData: Function
  ) {
    await this.initWasm()

    try {
      console.log('----starting event stream')
      const { filename, fsConfig } = props

      // // boot up WASM event parser
      // await init()
      // this._eventStreamer = new EventStreamer()
      // console.log('EVENT STREAM MUTHAAAA 2')

      this._cbReporter = cbReportNewData

      this._layers = props.layers.map((L: any) => new AllEventLayers[L.viewer](props))

      this.filename = filename
      this.fsConfig = fsConfig
      this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

      const stream = await this.fileApi.getFileStream(filename)
      if (!stream) throw Error('STREAM is null')

      const streamProcessorWithBackPressure = this.createStreamProcessor()
      // stream the data -- hopefully this can happen async
      stream.pipeTo(streamProcessorWithBackPressure)
      await this.retrieveEventsFromStream()
      // this will return when all chunks are completed
    } catch (e) {
      postMessage({ error: 'Error loading ' + this.filename })
    }

    return []
  },

  async retrieveEventsFromStream() {
    let zeroes = 0
    while (true) {
      await sleep(100)
      // Let's also see if there are any decompressed events ready for us!
      let rawEvents = (await retrieveText()) as string // false: not the end
      if (rawEvents == '/DONE/') {
        console.log('### NO EVENTS! WE ARE DONE ==-----')
        break
      }
      if (!rawEvents) {
        zeroes++
        if (zeroes > 20) break
      }
      console.log('--raw events!--', rawEvents.slice(-100))
      rawEvents = '[]'
      // got text. parsing raw json string:', rawEvents.length)
      // const events = JSON.parse(rawEvents)
      // console.log('--handling event rows:', events.length)
      // await this.handleText(events)
    }
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
      console.log('----batching off for processing:', this._currentTranchTotalLength)
      const oneSetOfChunks = [...this._currentTranch]
      this.sendDataToLayersForProcessing(oneSetOfChunks)
      console.log('----done processing:', this._currentTranchTotalLength)
      this._currentTranch = [] // this._currentTranch.slice(MAX_ARRAY_LENGTH)
      this._currentTranchTotalLength = 0
    }
  },

  createStreamProcessor() {
    const parent = this
    const starttime = Date.now()
    return new WritableStream(
      {
        // Stream calls write() for every new chunk from fetch call:
        write(entireChunk: Uint8Array) {
          return new Promise(async (resolve, reject) => {
            if (parent._isCancelled) reject()

            console.log('====GOT LARGE CHUNK', entireChunk.length)

            const parseIt = async (smallChunk: Uint8Array) => {
              console.log('--sending chunk to WASM:', entireChunk.length)
              const bytes = submitChunk(smallChunk)
              console.log('--successfully sent', bytes, 'bytes')

              await sleep(20)

              // // Let's also see if there are any decompressed events ready for us!
              // let rawEvents = (await streamer.retrieveText(false)) as string // false: not the end
              // console.log('--raw events!--', rawEvents.slice(-100))
              // rawEvents = '[]'
              // // got text. parsing raw json string:', rawEvents.length)
              // const events = JSON.parse(rawEvents)
              // console.log('--handling event rows:', events.length)
              // await parent.handleText(events)
            }

            parent._numChunks++
            parent._dataLength += entireChunk.length
            let startOffset = 0

            while (!parent._isCancelled && startOffset < entireChunk.length) {
              const subchunk = entireChunk.subarray(startOffset, startOffset + MAX_CHUNK_SIZE)

              if (subchunk.length) await parseIt(subchunk)
              startOffset += MAX_CHUNK_SIZE
            }

            resolve()
          })
        },

        close() {
          // console.log('STREAM FINISHED! Orphans:', JSON.stringify(_vehiclesOnLinks))
          submitChunk(new Uint8Array())
          console.log('STREAM FINISHED! Fetch final data next!')
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
