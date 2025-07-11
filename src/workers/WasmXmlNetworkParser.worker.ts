import * as Comlink from 'comlink'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import { parseXML } from '@/js/util'
import Coords from '@/js/Coords'

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
    let closeTag = '</node>'
    let endOfSection = '</nodes>'

    let closeNode = ''

    let allNodes = [] as any[]
    let allLinks = [] as any[]

    let promises = [] as any[]

    const buildNodeLookups = (results: any[]) => {
      let nodeIdOffset: { [id: string]: number } = {}
      let offset = 0

      const outStuff = [] as any[]

      // build nodes first ===========================================

      for (const chunk of results) {
        const nodes = chunk.node as { $id: string; $x: string; $y: string }[]
        if (!nodes) continue
        let numNodes = nodes.length
        const nodeIds = []
        const nodeCoords = new Float32Array(numNodes * 2).fill(NaN)

        let xy = [0, 0]

        for (let n = 0; n < numNodes; n++) {
          nodeIdOffset[nodes[n].$id] = offset + n * 2
          xy[0] = parseFloat(nodes[n].$x)
          xy[1] = parseFloat(nodes[n].$y)
          xy = Coords.toLngLat('EPSG:25832', xy)
          nodeCoords[n * 2] = xy[0]
          nodeCoords[n * 2 + 1] = xy[1]
          nodeIds.push(nodes[n].$id)
        }
        // for next chunk
        outStuff.push({ nodeCoords, nodeIds, nodeIdOffset })
        offset += 2 * numNodes
      }

      // stitch all node arrays together ================================
      const numNodes = offset / 2
      const znodeCoords = new Float32Array(numNodes * 2)
      let nOffset = 0
      for (const stuff of outStuff) {
        znodeCoords.set(stuff.nodeCoords, nOffset)
        nOffset += stuff.nodeCoords.length
      }

      // build links next ===========================================
      const cleanLinks = [] as any[]
      let countLinks = 0

      for (const chunk of results) {
        const links = chunk.link as { $id: string; $from: string; $to: string }[]
        if (!links) continue
        let numLinks = links.length

        const props = {
          capacity: new Float32Array(numLinks),
          freespeed: new Float32Array(numLinks),
          length: new Float32Array(numLinks),
          oneway: new Float32Array(numLinks),
          permlanes: new Float32Array(numLinks),
          linkIds: [],
        } as any

        let defaultProps = Object.keys(props)
          .filter(p => p !== 'linkIds')
          .map(p => [p, `$${p}`]) as []

        props.source = new Float32Array(2 * numLinks)
        props.dest = new Float32Array(2 * numLinks)

        links.forEach((link, i) => {
          // standard matsim parameters: id,cap,length, etc
          props.linkIds.push(link.$id)
          for (const prop of defaultProps) {
            props[prop[0]][i] = link[prop[1]]
          }

          // look up source/dest coordinates for each link
          let nodeFrom = nodeIdOffset[link.$from]
          let nodeTo = nodeIdOffset[link.$to]
          props.source[i * 2] = znodeCoords[nodeFrom]
          props.source[i * 2 + 1] = znodeCoords[nodeFrom + 1]
          props.dest[i * 2] = znodeCoords[nodeTo]
          props.dest[i * 2 + 1] = znodeCoords[nodeTo + 1]
        })
        countLinks += numLinks
        cleanLinks.push(props)
      }

      // stitch all link arrays together ================================
      const network = { crs: 'EPSG:4326' } as any
      let LOffset = 0
      for (const col of Object.keys(cleanLinks[0])) {
        if (col == 'source' || col == 'dest') {
          network[col] = new Float32Array(countLinks * 2)
          LOffset = 0
          for (const chunk of cleanLinks) {
            network[col].set(chunk[col], LOffset)
            LOffset += chunk[col].length
          }
        } else if (ArrayBuffer.isView(cleanLinks[0][col])) {
          network[col] = new Float32Array(countLinks)
          LOffset = 0
          for (const chunk of cleanLinks) {
            network[col].set(chunk[col], LOffset)
            LOffset += chunk[col].length
          }
        } else {
          network[col] = []
          for (const chunk of cleanLinks) {
            network[col].push(...chunk[col])
          }
        }
      }
      network.id = network.linkIds
      return network
    }

    const processLinkData = () => {
      // Build bare network with no attributes, just like other networks

      const numLinks = network.linkId.length

      const crs = network.crs || 'EPSG:4326'
      const needsProjection = crs !== 'EPSG:4326' && crs !== 'WGS84'

      const source: Float32Array = new Float32Array(2 * numLinks)
      const dest: Float32Array = new Float32Array(2 * numLinks)
      const linkIds: any = []

      let coordFrom = [0, 0]
      let coordTo = [0, 0]

      for (let i = 0; i < numLinks; i++) {
        const linkID = network.linkId[i]
        const fromOffset = 2 * network.from[i]
        const toOffset = 2 * network.to[i]

        coordFrom[0] = network.nodeCoordinates[fromOffset]
        coordFrom[1] = network.nodeCoordinates[1 + fromOffset]
        coordTo[0] = network.nodeCoordinates[toOffset]
        coordTo[1] = network.nodeCoordinates[1 + toOffset]

        if (needsProjection) {
          coordFrom = Coords.toLngLat(crs, coordFrom)
          coordTo = Coords.toLngLat(crs, coordTo)
        }

        source[2 * i + 0] = coordFrom[0]
        source[2 * i + 1] = coordFrom[1]
        dest[2 * i + 0] = coordTo[0]
        dest[2 * i + 1] = coordTo[1]

        linkIds[i] = linkID
      }

      const links = { source, dest, linkIds, projection: 'EPSG:4326' } as any

      // add network attributes back in
      for (const col of network.linkAttributes) {
        if (col !== 'linkId') links[col] = network[col]
      }
      return links
    }

    // Use a writablestream, which the docs say creates backpressure automatically:
    // https://developer.mozilla.org/en-US/docs/Web/API/WritableStream
    const streamProcessorWithBackPressure = new WritableStream(
      {
        write(entireChunk: Uint8Array) {
          return new Promise(async (resolve, reject) => {
            // console.log('CHINK!')
            if (parent._isCancelled) reject()
            _numChunks++

            let text = _leftovers + _decoder.decode(entireChunk)

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

            promises.push(
              new Promise<any>(async resolve => {
                const json = (await parseXML(xmlBody, {
                  alwaysArray: ['node', 'link', 'attribute'],
                })) as any
                console.log(json)
                resolve(json)
              })
            )

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
    const results = await Promise.all(promises)
    console.log('All promises done')

    const network = buildNodeLookups(results)

    console.log({ network })
    // console.log(allNodes)
    // console.log(allLinks)
    // console.log('FINAL: Posting', offset)
    return network
  },
}

Comlink.expose(Task)
