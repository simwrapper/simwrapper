import * as Comlink from 'comlink'
import { XmlDocument } from 'libxml2-wasm'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import globalStore from '@/store'

// console.log('hiiii 2')

const Task = {
  filename: '',
  fsConfig: null as FileSystemConfig | null,
  fileApi: {} as HTTPFileSystem,

  async isReady() {
    await new Promise<void>(resolve => {
      console.log('waiting...')
      setTimeout(() => {
        console.log('waited.')
        resolve()
      }, 3000)
    })
    return { ready: true }
  },

  async startStream(filename: string, fsConfig: FileSystemConfig) {
    console.log('----startStream')
    this.filename = filename
    this.fsConfig = fsConfig
    this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

    const blob = await this.fileApi.getFileBlob(this.filename)
    const buffer = new Uint8Array(await blob.arrayBuffer())

    console.log('buffer is', buffer.length)

    const text = new TextDecoder().decode(buffer)
    const doc = XmlDocument.fromString('<note><to>Tove</to></note>')
    console.log(doc)
    doc.dispose()

    // parser.write(buffer)
    // const stream = await this.fileApi.getFileStream(this.filename)
    // const reader = stream.getReader()
    // while (true) {
    //   const chunk = await reader.read()
    //   if (chunk.done) {
    //     console.log('done', { chunk })
    //     console.log('total events', i)
    //     break
    //   } else {
    //     // console.log({ chunk })
    //     parser.write(chunk.value)
    //   }
    // }
  },
}

Comlink.expose(Task)
