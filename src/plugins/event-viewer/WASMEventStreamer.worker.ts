import * as Comlink from 'comlink'
// import { SaxEventType, SAXParser, Detail, Tag, Attribute } from 'sax-wasm'

import { parseXML } from '@/js/util'
import AllEventLayers from './_views'

// import { XmlDocument } from 'libxml2-wasm'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import globalStore from '@/store'

// async function loadAndPrepareWasm() {
//   const parser = new SAXParser(
//     0xffff,
//     // SaxEventType.OpenTag | SaxEventType.OpenTagStart | SaxEventType.Attribute,
//     {
//       highWaterMark: 32 * 1024, // 32k chunks
//     }
//   )
//   const response = await fetch('/sax-wasm.wasm')
//   const saxWasm = new Uint8Array(await response.arrayBuffer())
//   const ready = await parser.prepareWasm(saxWasm)

//   if (ready) return parser

//   console.error('uhoh')
// }

const Task = {
  filename: '',
  fsConfig: null as FileSystemConfig | null,
  fileApi: {} as HTTPFileSystem,

  async startStream(props: {
    filename: string
    network: any
    layers: any
    fsConfig: FileSystemConfig
  }) {
    console.log('----starting event stream')
    console.log('PROPS', props)
    const { filename, fsConfig } = props

    // set up layers
    const layers = props.layers.map((L: any) => new AllEventLayers[L.viewer](props))

    // stream the events to the layer processors

    this.filename = filename
    this.fsConfig = fsConfig
    this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

    // console.log('boot up wasm')
    // const parser = (await loadAndPrepareWasm()) as SAXParser
    // console.log('wasm ready', parser)

    const blob = await this.fileApi.getFileBlob(this.filename)
    const buffer = new Uint8Array(await blob.arrayBuffer())

    const decoder = new TextDecoder('utf-8')
    const rawText = decoder.decode(buffer)
    console.log({ rawText })

    const xml = (await parseXML(rawText, { attributeNamePrefix: '' })) as any

    // tidy the results
    const cleanXML = xml.events.event.map((event: any) => {
      event.time = parseFloat(event.time)
      return event
    })

    const outputData = [] as any[]

    for (const layer of layers) {
      const { data } = layer.processEvents(cleanXML)
      outputData.push(data)
    }

    return outputData
    // return cleanEvents

    // parser.eventHandler = async (event, d) => {
    //   console.log(event)
    //   if (event === SaxEventType.Attribute) {
    //     try {
    //       console.log({ d })
    //       const detail = d as Attribute
    //       console.log(detail.name)
    //       const j = detail.toJSON()
    //       console.log({ j })

    //       // for (const attr of attrs) {
    //       //   console.log(1, attr.toJSON())
    //       // }

    //       // const json = JSON.parse(JSON.stringify(data))
    //       // console.log({ json })
    //       // if (json?.name == 'event') {
    //       //   for (const attr of json.attributes) {
    //       //     attributes[attr.name.value] = attr.value.value
    //       //   }
    //       // attributes.time = parseFloat(attributes.time)
    //       // }
    //     } catch (e) {
    //       console.warn('' + e)
    //     }
    //   }
    //   i += 1
    // }

    // parser.write(buffer)
    // console.log('total events', i)

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
