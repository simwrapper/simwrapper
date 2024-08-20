import * as Comlink from 'comlink'
import { SaxEventType, SAXParser } from 'sax-wasm'

// import pako from 'pako'
// import { parseXML } from '@/js/util'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import globalStore from '@/store'

export interface EventTask {
  startStream: any
}

async function loadAndPrepareWasm() {
  const parser = new SAXParser(SaxEventType.OpenTag, {
    highWaterMark: 64 * 1024,
  }) // 64k chunks

  const saxWasmResponse = fetch('/sax-wasm.wasm')
  const ready = await parser.prepareWasm(saxWasmResponse)
  if (ready) {
    return parser
  }
  console.error('uhoh')
}

const Task = {
  filename: '',
  fsConfig: null as FileSystemConfig | null,
  fileApi: {} as HTTPFileSystem,

  async startStream(filename: string, fsConfig: FileSystemConfig) {
    this.filename = filename
    this.fsConfig = fsConfig
    this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

    console.log('boot up wasm')
    const parser = (await loadAndPrepareWasm()) as SAXParser
    console.log('wasm ready')

    const decoder = new TextDecoder('utf-8')

    let i = 0

    parser.eventHandler = (event, data) => {
      if (event === SaxEventType.OpenTag) {
        try {
          const attributes = {} as any
          const json = JSON.parse(JSON.stringify(data))
          console.log({ json })
          // if (json?.name == 'event') {
          //   for (const attr of json.attributes) {
          //     attributes[attr.name.value] = attr.value.value
          //   }
          // attributes.time = parseFloat(attributes.time)
          i++
          // }
        } catch (e) {
          console.warn('' + e)
        }
      }
    }

    const stream = await this.fileApi.getFileStream(this.filename)
    const reader = stream.getReader()
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) {
        console.log('done', { chunk })
        console.log('total events', i)
        break
      } else {
        // console.log({ chunk })
        parser.write(chunk.value)
      }
    }
  },
}

Comlink.expose(Task)
