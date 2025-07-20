import * as Comlink from 'comlink'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import { parseXML } from '@/js/util'
import Coords from '@/js/Coords'

import init, { XmlToJson } from 'xml-network-parser'

const Task = {
  filename: '',
  fileApi: {} as HTTPFileSystem,
  fsConfig: null as FileSystemConfig | null,

  _cbReporter: null as any,
  _isCancelled: false,
  _xmlParser: null as any,
  outStuff: [] as any[],
  nodeIdOffset: {} as { [id: string]: number },
  _offset: 0,
  _crs: '',
  _nodeCoords: null as Float32Array | null,
  _cleanLinks: [] as any[],
  _countLinks: 0,

  async processChunk(chunk: any) {
    // console.log(chunk)

    // build nodes first ===========================================
    const nodes = chunk.r?.node as { $id: string; $x: string; $y: string }[]
    if (nodes) {
      let numNodes = nodes.length
      const nodeCoords = new Float32Array(numNodes * 2).fill(NaN)
      let xy = [0, 0]
      for (let n = 0; n < numNodes; n++) {
        this.nodeIdOffset[nodes[n].$id] = this._offset + n * 2
        xy[0] = parseFloat(nodes[n].$x)
        xy[1] = parseFloat(nodes[n].$y)
        if (this._crs) xy = Coords.toLngLat(this._crs, xy)
        nodeCoords[n * 2] = xy[0]
        nodeCoords[n * 2 + 1] = xy[1]
      }
      // prep for next chunk
      this.outStuff.push({ nodeCoords })
      this._offset += 2 * numNodes
      return
    }

    // stitch all node arrays together ================================
    if (!this._nodeCoords) {
      this._nodeCoords = new Float32Array(this._offset)
      let nOffset = 0
      for (const stuff of this.outStuff) {
        this._nodeCoords.set(stuff.nodeCoords, nOffset)
        nOffset += stuff.nodeCoords.length
      }
      // save some memory
      this.outStuff = []
    }

    // build links next ===========================================
    const links = chunk.r?.link as { $id: string; $from: string; $to: string }[]
    if (!links) return

    let numLinks = links.length

    const props = {
      capacity: new Float32Array(numLinks),
      freespeed: new Float32Array(numLinks),
      length: new Float32Array(numLinks),
      oneway: new Float32Array(numLinks),
      permlanes: new Float32Array(numLinks),
      id: [],
      modes: [],
    } as any

    let defaultProps = Object.keys(props)
      .filter(p => p !== 'id')
      .map(p => [p, `$${p}`]) as []

    props.source = new Float32Array(2 * numLinks)
    props.dest = new Float32Array(2 * numLinks)

    links.forEach((link, i) => {
      // standard matsim parameters: id,cap,length, etc
      props.id.push(link.$id)
      for (const prop of defaultProps) {
        props[prop[0]][i] = link[prop[1]]
      }

      // look up source/dest coordinates for each link
      if (!this._nodeCoords) return
      let nodeFrom = this.nodeIdOffset[link.$from]
      let nodeTo = this.nodeIdOffset[link.$to]
      props.source[i * 2] = this._nodeCoords[nodeFrom]
      props.source[i * 2 + 1] = this._nodeCoords[nodeFrom + 1]
      props.dest[i * 2] = this._nodeCoords[nodeTo]
      props.dest[i * 2 + 1] = this._nodeCoords[nodeTo + 1]
    })
    this._countLinks += numLinks
    this._cleanLinks.push(props)
  },

  finalAssembly() {
    // clear some ram first
    this.nodeIdOffset = {}
    this._nodeCoords = null

    // stitch all link arrays together ================================
    console.log('FINAL ASSEMBLY')
    const network = {} as any
    let LOffset = 0
    for (const col of Object.keys(this._cleanLinks[0])) {
      console.log(`---`, col)
      if (col == 'source' || col == 'dest') {
        network[col] = new Float32Array(this._countLinks * 2)
        LOffset = 0
        for (const chunk of this._cleanLinks) {
          network[col].set(chunk[col], LOffset)
          LOffset += chunk[col].length
          chunk[col] = null
        }
      } else if (ArrayBuffer.isView(this._cleanLinks[0][col])) {
        network[col] = new Float32Array(this._countLinks)
        LOffset = 0
        for (const chunk of this._cleanLinks) {
          network[col].set(chunk[col], LOffset)
          LOffset += chunk[col].length
          chunk[col] = null
        }
      } else {
        network[col] = []
        for (const chunk of this._cleanLinks) {
          network[col].push(...chunk[col])
          chunk[col] = null
        }
      }
    }
    // final cleanup
    if (!network.linkIds) network.linkIds = network.id
    network.linkAttributes = Object.keys(network)
    network.crs = 'EPSG:4326'

    return network
  },

  async parseXML(props: { path: string; fsConfig: FileSystemConfig; options?: { crs: string } }) {
    console.log('----starting xml parser')
    const { path, fsConfig, options } = props

    if (options?.crs) this._crs = options.crs

    // await init()
    // this._xmlParser = new XmlToJson()
    // console.log('XML PARSER survived INIT')

    this.filename = path
    this.fsConfig = fsConfig
    this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

    let _numChunks = 0

    let _decoder = new TextDecoder()
    let _leftovers = ''

    // 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
    // const MAX_CHUNK_SIZE = 1024 * 1024 // * 8

    // read one chunk at a time. This sends backpressure to the server
    const strategy = new CountQueuingStrategy({ highWaterMark: 1 })

    const parent = this

    // First we find nodes
    let searchElement = '<node '
    let closeTag = '</node>'
    let endOfSection = '</nodes>'

    let closeNode = ''
    let promises = [] as any[]

    let _chunkCounter = 0
    let _xmlStagingArea = ''

    // Use a writablestream, which the docs say creates backpressure automatically:
    // https://developer.mozilla.org/en-US/docs/Web/API/WritableStream
    const streamProcessorWithBackPressure = new WritableStream(
      {
        write(entireChunk: Uint8Array) {
          return new Promise(async (resolve, reject) => {
            // console.log('CHuNK!')
            if (parent._isCancelled) reject()
            _numChunks++

            let text = _leftovers + _decoder.decode(entireChunk)

            if (!parent._crs) {
              console.log('NO CRS')
              const crsLine = text.indexOf('coordinateReferenceSystem')
              if (crsLine > -1) {
                const line = text.slice(crsLine)
                parent._crs = line.substring(line.indexOf('>') + 1, line.indexOf('</attribute'))
                console.log(parent._crs)
              }
            }

            if (!closeNode) closeNode = text.indexOf(closeTag) > -1 ? closeTag : '/>'

            const endOfNodes = text.indexOf(endOfSection)
            let linkText = ''
            if (endOfNodes > -1) {
              linkText = text.slice(endOfNodes)
              text = text.slice(0, endOfNodes)
            }

            const startNode = text.indexOf(searchElement)
            if (startNode == -1) reject('no nodes found')

            const lastNode = text.lastIndexOf(closeNode)
            const xmlBody = text.slice(startNode, lastNode + closeNode.length)
            _leftovers = text.slice(lastNode + closeNode.length)

            if (xmlBody.length) {
              _chunkCounter++
              _xmlStagingArea += xmlBody
              if (_chunkCounter > 4 || endOfNodes > -1) {
                const fullXml = `<r>${_xmlStagingArea}</r>`
                _xmlStagingArea = ''
                _chunkCounter = 0
                const json = await parseXML(fullXml, {})
                parent.processChunk(json)

                // promises.push(
                //   new Promise<any>(async resolve => {
                //     try {
                //       const fullXml = `<r>${_xmlStagingArea}</r>`
                //       _xmlStagingArea = ''
                //       _chunkCounter = 0
                //       // const text = await parent._xmlParser.parse(fullXml)
                //       const json = await parseXML(fullXml, {})
                //       // console.log(json)
                //       // const json = JSON.parse(text)
                //       resolve(json)
                //     } catch (e) {
                //       console.error('' + e)
                //       reject('' + e)
                //     }
                //   })
                // )
              }
            }

            // flip to link mode if we got the </nodes> tag
            if (endOfNodes > -1) {
              searchElement = '<link '
              closeTag = '</link>'
              endOfSection = '</links>'
              closeNode = ''
              _leftovers += linkText
            }
            resolve()
          })
        },

        close() {
          if (_xmlStagingArea.length) {
            console.log('CLOSE: GOT SOME LEFTOVER IN STAGING AREA')
            promises.push(
              new Promise<any>(async (resolve, reject) => {
                try {
                  const fullXml = `<r>${_xmlStagingArea}</r>`
                  _xmlStagingArea = ''
                  _chunkCounter = 0
                  const text = await parent._xmlParser.parse(fullXml)
                  const json = JSON.parse(text)
                  resolve(json)
                } catch (e) {
                  console.error('' + e)
                  reject('' + e)
                }
              })
            )
          }
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
    // const results = await Promise.all(promises)
    // console.log('All promises done')

    const network = this.finalAssembly()
    // console.log({ network })
    return network
  },
}

Comlink.expose(Task)
