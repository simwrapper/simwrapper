import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import * as JSUtil from '@/js/util'
import Coords from '@/js/Coords'

// import init, { XmlToJson } from 'xml-network-parser'

let fileApi = {} as HTTPFileSystem
let _fsConfig = null as FileSystemConfig | null
let _isCancelled = false
// let _xmlParser = null as any
let outStuff = [] as any[]
let nodeIdOffset = {} as { [id: string]: number }
let _filename = ''
let _offset = 0
let _crs = ''
let _nodeCoords = null as Float32Array | null
let _nodeId = [] as string[]
let _cleanLinks = [] as any[]
let _countLinks = 0
let _confirmed = false
let _isAtlantis = false

// ENTRY POINT: -----------------------
onmessage = async function (e) {
  if (e.data.confirmedCRS) {
    _crs = e.data.confirmedCRS || 'Atlantis'
    _confirmed = true
    const network = await parseXML()
    postMessage({ network })
  } else {
    const network = await parseXML(e.data)
    postMessage({ network })
  }
}

// re-center / normalize Atlantis coords around 0,0
function recenterAtlantis() {
  if (!_nodeCoords) return
  postMessage({ status: 'Centering...' })

  _isAtlantis = true

  let x = 0
  let y = 0
  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  const f = 1

  for (let n = 0; n < _nodeCoords.length; n += 2) {
    x = f * _nodeCoords[n]
    y = f * _nodeCoords[n + 1]
    minX = Math.min(x, minX)
    maxX = Math.max(x, maxX)
    minY = Math.min(y, minY)
    maxY = Math.max(y, maxY)
  }
  const centerX = (maxX + minX) / 2
  const centerY = (maxY + minY) / 2

  console.log({ minX, maxX, centerX, minY, maxY, centerY })
  // * 0.00000904369503 // convert meters to degrees
  const webMercator =
    '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs'

  const coord = [0, 0]
  for (let n = 0; n < _nodeCoords.length; n += 2) {
    coord[0] = f * _nodeCoords[n] - centerX
    coord[1] = f * _nodeCoords[n + 1] - centerY

    // const lnglat = [coord[0] * factor, coord[1] * factor]
    const lnglat = Coords.toLngLat(webMercator, coord)
    _nodeCoords[n] = lnglat[0]
    _nodeCoords[n + 1] = lnglat[1]
  }
}

async function processChunk(chunk: any) {
  // postMessage({ status: 'Got chunk ' + _countLinks })

  // build nodes first ===========================================
  const nodes = chunk.r?.node as { $id: string; $x: string; $y: string }[]
  if (nodes) {
    let numNodes = nodes.length
    const nodeCoords = new Float32Array(numNodes * 2).fill(NaN)
    let xy = [0, 0]
    for (let n = 0; n < numNodes; n++) {
      const node = nodes[n]
      _nodeId.push(node.$id)
      nodeIdOffset[node.$id] = _offset + n * 2
      xy[0] = parseFloat(node.$x)
      xy[1] = parseFloat(node.$y)
      if (_crs !== 'Atlantis') xy = Coords.toLngLat(_crs, xy)
      nodeCoords[n * 2] = xy[0]
      nodeCoords[n * 2 + 1] = xy[1]
    }
    // prep for next chunk
    outStuff.push({ nodeCoords })
    _offset += 2 * numNodes
    return
  }

  // stitch all node arrays together ================================
  if (!_nodeCoords) {
    _nodeCoords = new Float32Array(_offset)
    let nOffset = 0
    for (const stuff of outStuff) {
      _nodeCoords.set(stuff.nodeCoords, nOffset)
      nOffset += stuff.nodeCoords.length
    }
    // save some memory
    outStuff = []
    // recenter Atlantis coords around 0,0
    if (_crs == 'Atlantis' || !_crs) recenterAtlantis()
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
  props.from = [] // new Uint32Array(numLinks)
  props.to = [] // new Uint32Array(numLinks)

  links.forEach((link, i) => {
    // standard matsim parameters: id,cap,length, etc
    props.id.push(link.$id)
    for (const prop of defaultProps) {
      props[prop[0]][i] = link[prop[1]]
    }

    // look up source/dest coordinates for each link
    if (!_nodeCoords) return
    let nodeFrom = nodeIdOffset[link.$from]
    let nodeTo = nodeIdOffset[link.$to]
    props.source[i * 2] = _nodeCoords[nodeFrom]
    props.source[i * 2 + 1] = _nodeCoords[nodeFrom + 1]
    props.dest[i * 2] = _nodeCoords[nodeTo]
    props.dest[i * 2 + 1] = _nodeCoords[nodeTo + 1]
    props.from[i] = nodeFrom / 2 // _nodeId[nodeFrom / 2]
    props.to[i] = nodeTo / 2 // _nodeId[nodeTo / 2]
  })
  _countLinks += numLinks
  _cleanLinks.push(props)
}

function finalAssembly() {
  // clear some ram first
  nodeIdOffset = {}
  // _nodeCoords = null
  const network = {} as any

  // if (!_cleanLinks || !_cleanLinks[0]) return

  // stitch all link arrays together ================================

  let LOffset = 0

  for (const col of Object.keys(_cleanLinks[0])) {
    // console.log(`---`, col)
    if (col == 'source' || col == 'dest') {
      network[col] = new Float32Array(_countLinks * 2)
      LOffset = 0
      for (const chunk of _cleanLinks) {
        network[col].set(chunk[col], LOffset)
        LOffset += chunk[col].length
        chunk[col] = null
      }
    } else if (ArrayBuffer.isView(_cleanLinks[0][col])) {
      network[col] = new Float32Array(_countLinks)
      LOffset = 0
      for (const chunk of _cleanLinks) {
        network[col].set(chunk[col], LOffset)
        LOffset += chunk[col].length
        chunk[col] = null
      }
    } else {
      network[col] = []
      for (const chunk of _cleanLinks) {
        network[col].push(...chunk[col])
        chunk[col] = null
      }
    }
  }
  // final cleanup
  if (!network.linkId) network.linkId = network.id
  network.linkAttributes = Object.keys(network)
  network.crs = 'EPSG:4326'
  if (_isAtlantis) network.isAtlantis = true

  // node attributes ===============================
  network.nodeCoordinates = _nodeCoords
  network.nodeAttributes = ['nodeId']
  network.nodeId = _nodeId

  return network
}

async function parseXML(props?: {
  path: string
  fsConfig: FileSystemConfig
  options?: { crs: string }
}) {
  console.log('----starting xml parser', props)
  if (props) {
    const { path, fsConfig, options } = props
    _filename = path
    _fsConfig = fsConfig
    if (options?.crs) _crs = options.crs
  }

  fileApi = new HTTPFileSystem(_fsConfig as any, globalStore)

  let _numChunks = 0

  let _decoder = new TextDecoder()

  // 8MB seems to be the sweet spot for Firefox. Chrome doesn't care
  // const MAX_CHUNK_SIZE = 1024 * 1024 // * 8

  // read one chunk at a time. This sends backpressure to the server
  const strategy = new CountQueuingStrategy({ highWaterMark: 1 })

  // First we find nodes
  let searchElement = '<node '
  let closeTag = '</node>'
  let endOfSection = '</nodes>'

  let closeNode = ''
  let promises = [] as any[]

  let _chunkCounter = 0
  let _xmlStagingArea = ''

  // raw bytes from previous chunk
  let _preBytes = new Uint8Array()
  // utf-8 leftover characters from previous chunk
  let _leftovers = ''

  // Use a writablestream, which the docs say creates backpressure automatically:
  // https://developer.mozilla.org/en-US/docs/Web/API/WritableStream
  const streamProcessor = new WritableStream(
    {
      write(incomingChunk: Uint8Array) {
        return new Promise(async (resolve, reject) => {
          _numChunks++
          if (_isCancelled) reject()

          // cut off chunk at the last line ending so we never split UTF-8 glyphs
          let entireChunk = new Uint8Array(_preBytes.length + incomingChunk.length)
          entireChunk.set(_preBytes)
          entireChunk.set(incomingChunk, _preBytes.length)
          const cutoff = entireChunk.lastIndexOf(10)
          if (cutoff > -1) {
            _preBytes = entireChunk.slice(cutoff + 1)
            entireChunk = entireChunk.slice(0, cutoff)
          }

          let text = _leftovers + _decoder.decode(entireChunk)

          if (_numChunks == 1) {
            if (!_crs) {
              const crsLine = text.indexOf('coordinateReferenceSystem')
              if (crsLine > -1) {
                const line = text.slice(crsLine)
                _crs = line.substring(line.indexOf('>') + 1, line.indexOf('</attribute'))
                console.log(_crs)
              }
            }
            if (!_confirmed && (_crs == 'Atlantis' || !_crs)) {
              // STILL no  good crs; ask user
              postMessage({ requestCRS: _crs })
              reject('crs')
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
              const json = await JSUtil.parseXML(fullXml, {})
              processChunk(json)
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

          // and if we have ALL the links of a very small network,
          // drop the leftovers into the staging area
          const startLinks = _leftovers.indexOf('<links ')
          if (startLinks > -1 && _leftovers.indexOf('</links>') > -1) {
            _xmlStagingArea = _leftovers
              .substring(_leftovers.indexOf('<link '))
              .replace('</links>', '')
              .replace('</network>', '')
          }
          resolve()
        })
      },

      close() {
        // if (_leftovers) _xmlStagingArea += _leftovers

        // console.log(22, { _xmlStagingArea, _leftovers })
        // if (_xmlStagingArea.indexOf('</nodes>') > -1)
        //   _xmlStagingArea = _xmlStagingArea.replace('</nodes>', '')
        // _xmlStagingArea = _xmlStagingArea.replace('</network>', '')

        if (_xmlStagingArea.length) {
          console.log('CLOSE: GOT SOME LEFTOVER IN STAGING AREA')
          promises.push(
            new Promise<any>(async (resolve, reject) => {
              try {
                const fullXml = `<r>${_xmlStagingArea}</r>`
                _xmlStagingArea = ''
                _chunkCounter = 0
                const json = (await JSUtil.parseXML(fullXml)) as any
                processChunk(json)
                // resolve(json)
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
    const readableStream = await fileApi.getFileStream(_filename)
    // stream results through the data pipe
    if (_filename.toLocaleLowerCase().endsWith('.gz')) {
      const gunzipper = new DecompressionStream('gzip')
      await readableStream.pipeThrough(gunzipper).pipeTo(streamProcessor)
    } else {
      await readableStream.pipeTo(streamProcessor)
    }
  } catch (e) {
    // ignore crs error, user can try to fix
    if (!e) postMessage({ error: '' + e })
  }

  // console.log('Total chunks:', _numChunks)

  const network = finalAssembly()
  // console.log({ network })
  return network
}
