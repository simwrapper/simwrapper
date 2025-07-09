import * as Comlink from 'comlink'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import { parseXML } from '@/js/util'

// import init, { XmlNetworkParser } from 'xml-network-parser'

const Task = {
  filename: '',
  fileApi: {} as HTTPFileSystem,
  fsConfig: null as FileSystemConfig | null,

  _cbReporter: null as any,
  _isCancelled: false,

  async parseXML(props: { path: string; fsConfig: FileSystemConfig }) {
    console.log('----starting xml parser')
    const { path, fsConfig } = props

    // await init()
    // this._xmlParser = new XmlNetworkParser()
    // console.log('XML PARSER survived INIT')

    this.filename = path
    this.fsConfig = fsConfig
    this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

    let _numChunks = 0
    let data = 0

    let _decoder = new TextDecoder()
    let _leftovers = ''
    let _offset = 0

    // 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
    const MAX_CHUNK_SIZE = 1024 * 1024 // * 8

    // read one chunk at a time. This sends backpressure to the server
    const strategy = new CountQueuingStrategy({ highWaterMark: 1 })

    const parent = this

    // First we find nodes
    let searchElement = '<node '
    let closeNode = ''

    let allNodes = [] as any[]

    // Use a writablestream, which the docs say creates backpressure automatically:
    // https://developer.mozilla.org/en-US/docs/Web/API/WritableStream
    const streamProcessorWithBackPressure = new WritableStream(
      {
        write(entireChunk: Uint8Array) {
          return new Promise(async (resolve, reject) => {
            console.log('CHINK!')
            if (parent._isCancelled) reject()
            _numChunks++

            let text = _leftovers + _decoder.decode(entireChunk)

            if (!closeNode) closeNode = text.indexOf('</node>') > -1 ? '</node>' : '/>'

            const endOfNodes = text.indexOf('</nodes>')
            if (endOfNodes > -1) text = text.slice(0, endOfNodes)

            const startNode = text.indexOf(searchElement)
            if (startNode == -1) reject('no nodes found')

            const lastNode = text.lastIndexOf(closeNode)
            const xmlBody = text.slice(startNode, lastNode + closeNode.length)
            _leftovers = text.slice(lastNode + closeNode.length)

            const json = (await parseXML(xmlBody, {
              alwaysArray: ['node', 'link'],
            })) as any

            console.log(json)
            allNodes.push(...json.node)
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
      const readableStream = await this.fileApi.getFileStream(this.filename)

      // stream results through the data pipe
      if (this.filename.toLocaleLowerCase().endsWith('.gz')) {
        const gunzipper = new DecompressionStream('gzip')
        await readableStream.pipeThrough(gunzipper).pipeTo(streamProcessorWithBackPressure)
      } else {
        await readableStream.pipeTo(streamProcessorWithBackPressure)
      }
    } catch (e) {
      console.error('' + e)
      postMessage({ error: '' + e })
    }

    console.log('Total chunks:', _numChunks)
    console.log('Total data:', data)

    console.log(allNodes)
    // console.log('FINAL: Posting', offset)
    return {}
  },
}

Comlink.expose(Task)
