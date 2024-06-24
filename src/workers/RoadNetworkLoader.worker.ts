// ROADWAY NETWORK LOADER - SIMWRAPPER

// Pass in a filename; can be MATSim network.xml.gz or preprocessed GeoJSON
// Get a table of links with Anode Bnode and properties

import { decompressSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import reproject from 'reproject'
import * as shapefile from 'shapefile'

import Coords from '@/js/Coords'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { DataTable, FileSystemConfig } from '@/Globals'
import { findMatchingGlobInFiles } from '@/js/util'

import DataFetcherWorker from '@/workers/DataFetcher.worker.ts?worker'

enum NetworkFormat {
  MATSIM_XML,
  GEOJSON,
  SFCTA,
}

// We ignore some node properties
const ignore = ['X', 'Y']
const nodePropsToIgnore = new Set()
ignore.forEach(key => nodePropsToIgnore.add(key))

let _content = {} as any
let _fileApi: HTTPFileSystem
let _fileSystemConfig: FileSystemConfig
let _filePath = ''
let _networkFormat: NetworkFormat
let _subfolder = ''
let _vizDetails = {} as any
let _isFirefox = false
let _rawData = null as Uint8Array | null
let _options = {} as any
let _crs = ''

// ENTRY POINT: -----------------------
onmessage = async function (e) {
  // pre-filled buffer?
  if (e.data.xmlBuffer) {
    const cargo = gUnzip(e.data.xmlBuffer)
    memorySafeXMLParser(new Uint8Array(cargo), {})
    return
  }

  if (e.data.crs) {
    _crs = e.data.crs || 'Atlantis'

    switch (_networkFormat) {
      case NetworkFormat.MATSIM_XML:
        memorySafeXMLParser()
        break
      case NetworkFormat.SFCTA:
        parseSFCTANetworkAndPostResults(e.data.crs)
        break
      default:
        console.log('oops')
        memorySafeXMLParser()
        break
    }
  } else {
    const { filePath, fileSystem, vizDetails, options, isFirefox } = e.data

    // guess file type from extension
    _networkFormat = guessFileTypeFromExtension(filePath)
    _vizDetails = vizDetails
    _filePath = filePath
    _isFirefox = isFirefox

    // fetch nodes and links
    fetchNodesAndLinks({
      fileSystem,
      vizDetails,
      options,
    })
  }
}

function guessFileTypeFromExtension(name: string) {
  const f = name.toLocaleLowerCase()

  // regex is ugly, but this tests for various extensions with/without .gz suffix
  if (/\.xml(|\.gz)$/.test(f)) return NetworkFormat.MATSIM_XML
  if (/\.json(|\.gz)$/.test(f)) return NetworkFormat.GEOJSON
  if (/\.geojson(|\.gz)$/.test(f)) return NetworkFormat.GEOJSON
  if (/\.shp$/.test(f)) return NetworkFormat.SFCTA

  // No idea; guess MATSim.
  return NetworkFormat.MATSIM_XML
}

async function fetchNodesAndLinks(props: {
  fileSystem: FileSystemConfig
  vizDetails: any
  options: any
}): Promise<any> {
  const { fileSystem, vizDetails, options } = props

  switch (_networkFormat) {
    case NetworkFormat.GEOJSON:
      return fetchGeojson(_filePath, fileSystem)
    case NetworkFormat.MATSIM_XML:
      return fetchMatsimXmlNetwork(_filePath, fileSystem, options)
    case NetworkFormat.SFCTA:
      return fetchSFCTANetwork(_filePath, fileSystem, vizDetails)
    default:
      break
  }
}

async function fetchSFCTANetwork(
  filePath: string,
  fileSystem: FileSystemConfig,
  vizDetails: any
) {
  console.log('WORKER loading shapefile', filePath)

  _fileApi = new HTTPFileSystem(fileSystem)
  _fileSystemConfig = fileSystem

  const url = filePath
  _content = {}

  // first, get shp/dbf files
  try {
    const shpPromise = _fileApi.getFileBlob(url)
    const dbfPromise = _fileApi.getFileBlob(url.replace('.shp', '.dbf'))
    await Promise.all([shpPromise, dbfPromise])

    const shpBlob = await (await shpPromise)?.arrayBuffer()
    const dbfBlob = await (await dbfPromise)?.arrayBuffer()
    if (!shpBlob || !dbfBlob) return []

    _content = await shapefile.read(shpBlob, dbfBlob)
  } catch (e) {
    console.error(e)
    return []
  }

  // next, see if there is a .prj file with projection information
  let projection = vizDetails.projection
  if (!projection) {
    try {
      projection = await _fileApi.getFileText(url.replace('.shp', '.prj'))
    } catch (e) {
      // need a projection to continue; post message asking user.
      postMessage({ promptUserForCRS: 'crs needed' })
      return
    }
  }
  // if we got here, then we got a valid projection.
  console.log(projection)
  parseSFCTANetworkAndPostResults(projection)
}

async function parseSFCTANetworkAndPostResults(projection: string) {
  const guessCRS = Coords.guessProjection(projection)

  // then, reproject if we have a projection
  if (guessCRS && guessCRS !== 'EPSG:4326') {
    _content = reproject.toWgs84(_content, guessCRS, Coords.allEPSGs)
  }

  // OK we now have LINKS in geojson.features!! ----------------------------------------
  // console.log({ _content })

  const linkIds: any = []
  // const links = [] as any[]
  let numLinks = 0

  try {
    // build link array from columnar data
    // numLinks = dataTable.AB.values.length
    numLinks = _content.features.length
    // const keys = Object.keys(dataTable)
    for (const feature of _content.features) {
      linkIds.push(feature.properties.AB)
    }
  } catch (err) {
    const e = err as any
    postMessage({ error: '' + e.error })
  }

  const source: Float32Array = new Float32Array(2 * numLinks)
  const dest: Float32Array = new Float32Array(2 * numLinks)

  let warnings = 0

  // link source/dest coordinate lookup
  for (let j = 0; j < numLinks; j++) {
    // TODO shapefile has curvy lines; we are going to FLATTEN them
    // for now, just to get this up and running quickly.
    // Correct way to do this: use GeoJsonLayer, but that means rewriting
    // the centerline stuff from the LineOffsetLayer that we custom wrote :-(
    const lastcoord = _content.features[j].geometry.coordinates.length - 1
    source[2 * j + 0] = _content.features[j].geometry.coordinates[0][0]
    source[2 * j + 1] = _content.features[j].geometry.coordinates[0][1]
    dest[2 * j + 0] = _content.features[j].geometry.coordinates[lastcoord][0]
    dest[2 * j + 1] = _content.features[j].geometry.coordinates[lastcoord][1]
  }

  // all done! post the links
  const links = { source, dest, linkIds, projection: guessCRS }

  postMessage({ links }, [links.source.buffer, links.dest.buffer])

  if (warnings)
    console.error('FIX YOUR NETWORK:', warnings, 'LINKS WITH NODE LOOKUP PROBLEMS')
}

async function memorySafeXMLParser(rawData?: Uint8Array, options?: any) {
  // pick up where we left off if user interactively gave us the CRS
  if (rawData) _rawData = rawData
  if (options) _options = options

  if (!_rawData) {
    console.error("can't restart: no data")
    return
  }

  console.log('rawData is big:', _rawData.length)

  // Start chunking the rawdata
  const decoder = new TextDecoder('utf-8')
  // Be careful to only split chunks at the border between </link> and <link>

  // 9% at a time seems nice
  let chunkBytes = Math.floor(_rawData.length / 11)

  let decoded = ''
  let currentBytePosition = chunkBytes
  let firstChunk = _rawData.subarray(0, currentBytePosition)

  // Find end of nodes; close them and close network. Parse it.
  postMessage({ status: 'Parsing nodes...' })

  while (currentBytePosition < _rawData.length) {
    const text = decoder.decode(firstChunk)
    decoded += text

    if (text.indexOf('<links') > -1) break
    let startBytePosition = currentBytePosition
    currentBytePosition += chunkBytes
    firstChunk = _rawData.subarray(startBytePosition, currentBytePosition)
  }

  const endNodes = decoded.indexOf('<links')

  // This creates main network object with attributes and nodes.
  let networkNodes = decoded.slice(0, endNodes) + '\n</network>\n'

  let network = parseXML(networkNodes)

  // console.log({ network })

  // What is the CRS?
  let coordinateReferenceSystem = _crs
  if (!_crs) {
    const attribute = network?.network?.attributes?.attribute
    if (attribute?.$name === 'coordinateReferenceSystem') {
      coordinateReferenceSystem = attribute['#text']
      console.log('CRS', coordinateReferenceSystem)
    } else {
      // We don't have CRS: send msg to UI thread to ask for it. We'll pick it up later.
      postMessage({ promptUserForCRS: 'crs needed' })
      return
    }
  }

  // Prep the lookups.
  const nodes: { [id: string]: number[] } = {}
  const linkIds: any = []
  const linkChunks = [] as any[]

  // if crs is Atlantis, then don't do any conversions
  const crs = coordinateReferenceSystem === 'Atlantis' ? '' : coordinateReferenceSystem

  // store (converted) coordinates in lookup
  for (const node of network.network.nodes.node as any) {
    const coordinates = [parseFloat(node.$x), parseFloat(node.$y)]
    const longlat = crs
      ? Coords.toLngLat(coordinateReferenceSystem, coordinates)
      : coordinates
    nodes[node.$id] = longlat
  }

  // re-center / normalize Atlantis coords around 0,0
  if (coordinateReferenceSystem === 'Atlantis') {
    let x = 0
    let y = 0
    let minX = Infinity
    let maxX = -Infinity
    let minY = Infinity
    let maxY = -Infinity
    const coordinates = Object.values(nodes)
    for (const coord of coordinates) {
      x = coord[0]
      y = coord[1]
      minX = Math.min(x, minX)
      minY = Math.min(y, minY)
      maxX = Math.max(x, maxX)
      maxY = Math.max(y, maxY)
    }
    const centerX = (maxX + minX) / 2
    const centerY = (maxY + minY) / 2

    // * 0.00000904369503 // convert meters to degrees
    const webMercator =
      '+proj=merc +a=6378137 +b=6378137 +lat_ts=0.0 +lon_0=0.0 +x_0=0.0 +y_0=0 +k=1.0 +units=m +nadgrids=@null +wktext  +no_defs'

    for (const coord of coordinates) {
      coord[0] -= centerX
      coord[1] -= centerY

      const lnglat = Coords.toLngLat(webMercator, coord)

      coord[0] = lnglat[0]
      coord[1] = lnglat[1]
    }
  }

  // clear some memory
  network = null
  networkNodes = ''

  // Process initial link chunks
  postMessage({ status: 'Parsing links..' })

  let startLinks = decoded.indexOf('<link ')
  let endLinks = decoded.lastIndexOf('</link>')
  let closeTagLength = 7

  console.log(80, endLinks)
  // old MATSim networks used <link blah=.../> instead of <link asdfasdf>...</link>
  if (endLinks === -1) {
    endLinks = decoded.lastIndexOf('/>')
    closeTagLength = 2
  }

  let usable = decoded.slice(startLinks, endLinks + closeTagLength)
  let leftovers = decoded.slice(endLinks + closeTagLength)

  let linkData = parseXML(usable, _options)

  const chunk = buildLinkChunk(nodes, linkIds, linkData.link) // array of links is in XML linkData.link
  linkChunks.push(chunk)

  let startByte = 0
  let endByte = currentBytePosition

  let totalNumberOfLinks = linkData.link.length

  // Process remaining link chunks
  while (true) {
    startByte = endByte
    endByte = startByte + chunkBytes
    postMessage({
      status: `Parsing links... ${Math.floor((100 * startByte) / _rawData.length)}%`,
    })
    const nextChunk = _rawData.subarray(startByte, endByte)

    decoded = leftovers + decoder.decode(nextChunk)
    let endofFinalLink = decoded.lastIndexOf(closeTagLength === 7 ? '</link>' : '/>')
    usable = decoded.slice(0, endofFinalLink + closeTagLength)
    leftovers = decoded.slice(endofFinalLink + closeTagLength)

    if (usable.indexOf('<link ') === -1) break

    linkData = parseXML(usable, _options)
    // array of links is in XML linkData.link
    const chunk = buildLinkChunk(nodes, linkIds, linkData.link)
    linkChunks.push(chunk)
    totalNumberOfLinks += linkData.link.length

    // end when we're at the end
    if (endByte > _rawData.length) break
  }
  // console.log({ totalNumberOfLinks })

  // Last chunk, close out.
  const source: Float32Array = new Float32Array(2 * totalNumberOfLinks)
  const dest: Float32Array = new Float32Array(2 * totalNumberOfLinks)

  let offset = 0
  for (const chunk of linkChunks) {
    for (let i = 0; i < chunk[0].length; i++) {
      source[offset + i] = chunk[0][i]
      dest[offset + i] = chunk[1][i]
    }
    offset += chunk[0].length
  }

  const links = {
    source,
    dest,
    linkIds,
    projection: coordinateReferenceSystem,
  }
  postMessage({ links }, [links.source.buffer, links.dest.buffer])
}

// build [source,dest] Float32Array of link positions
function buildLinkChunk(nodes: any, linkIds: any[], links: any[]): Float32Array[] {
  const source: Float32Array = new Float32Array(2 * links.length)
  const dest: Float32Array = new Float32Array(2 * links.length)

  for (let i = 0; i < links.length; i++) {
    const link = links[i]
    linkIds.push(link.$id)

    const nodeFrom = nodes[link.$from]
    const nodeTo = nodes[link.$to]

    source[2 * i + 0] = nodeFrom ? nodeFrom[0] : NaN // nodes[link.$from][0]
    source[2 * i + 1] = nodeFrom ? nodeFrom[1] : NaN
    dest[2 * i + 0] = nodeTo ? nodeTo[0] : NaN
    dest[2 * i + 1] = nodeTo ? nodeTo[1] : NaN
  }

  return [source, dest]
}

async function fetchMatsimXmlNetwork(
  filePath: string,
  fileSystem: FileSystemConfig,
  options: any
) {
  const rawData = await fetchGzip(filePath, fileSystem)

  try {
    // always use the memory-safe parser, because Firefox randomly hangs without any
    // error messages or warnings when the parse object is too big :-(
    await memorySafeXMLParser(rawData, options)
  } catch (e) {
    console.error('' + e)
    postMessage({ error: 'Could not parse network XML' })
    return
  }
}

function parseXmlNetworkAndPostResults(coordinateReferenceSystem: string) {
  // build node/coordinate lookup
  const nodes: { [id: string]: number[] } = {}

  // if crs is Atlantis, then don't do any conversions
  const crs = coordinateReferenceSystem === 'Atlantis' ? '' : coordinateReferenceSystem

  // store (converted) coordinates in lookup
  for (const node of _content.network.nodes.node as any) {
    const coordinates = [parseFloat(node.$x), parseFloat(node.$y)]

    // convert coordinates to long/lat if necessary
    const longlat = crs
      ? Coords.toLngLat(coordinateReferenceSystem, coordinates)
      : coordinates

    nodes[node.$id] = longlat
  }

  // build links
  const source: Float32Array = new Float32Array(2 * _content.network.links.link.length)
  const dest: Float32Array = new Float32Array(2 * _content.network.links.link.length)

  const linkIds: any = []

  for (let i = 0; i < _content.network.links.link.length; i++) {
    const link = _content.network.links.link[i]
    linkIds[i] = link.$id

    source[2 * i + 0] = nodes[link.$from][0]
    source[2 * i + 1] = nodes[link.$from][1]
    dest[2 * i + 0] = nodes[link.$to][0]
    dest[2 * i + 1] = nodes[link.$to][1]
  }

  const links = { source, dest, linkIds, projection: coordinateReferenceSystem }

  // all done! post the links
  postMessage({ links }, [links.source.buffer, links.dest.buffer])
}

async function fetchGeojson(filePath: string, fileSystem: FileSystemConfig) {
  const rawData = await fetchGzip(filePath, fileSystem)

  // TODO for now we assume everything is UTF-8; add an option later
  const decoded = new TextDecoder('utf-8').decode(rawData)
  const json = JSON.parse(decoded)

  const source: Float32Array = new Float32Array(2 * json.features.length)
  const dest: Float32Array = new Float32Array(2 * json.features.length)

  const linkIds: any = []

  for (let i = 0; i < json.features.length; i++) {
    const feature = json.features[i]
    // super-efficient format lol is [ coordsFrom[], coordsTo[] ]
    // const link = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]]
    source[2 * i + 0] = feature.geometry.coordinates[0][0]
    source[2 * i + 1] = feature.geometry.coordinates[0][1]
    dest[2 * i + 0] = feature.geometry.coordinates[1][0]
    dest[2 * i + 1] = feature.geometry.coordinates[1][1]

    // Geojson spec is unclear on where the ID should go.
    // - Section 3 says if there is a general ID, it "should" go
    //   in the top level of the feature itself, ie. feature.id
    //   https://datatracker.ietf.org/doc/html/rfc7946#section-3
    // - Section 6 says that all properties of the feature
    //   should go in the "properties" object and putting anything
    //   outside of the geometry or properties will cause
    //   interoperability problems
    //   https://datatracker.ietf.org/doc/html/rfc7946#section-6
    //
    // Thus we will look in both places.

    linkIds[i] = feature.id ?? feature.properties.id
  }

  const links = { source, dest, linkIds, projection: 'EPSG:4326' }

  // all done! post the links
  postMessage({ links }, [links.source.buffer, links.dest.buffer])
}

async function fetchGzip(filePath: string, fileSystem: FileSystemConfig) {
  let resolvedPath = filePath
  try {
    const httpFileSystem = new HTTPFileSystem(fileSystem)

    // if dataset has a path in it, we need to fetch the correct subfolder contents
    // and resolve any path wildcards
    const slash = filePath.indexOf('/')
    if (slash > -1) {
      const dataset = filePath.substring(1 + filePath.lastIndexOf('/'))
      const subfolder = filePath.substring(0, filePath.lastIndexOf('/'))

      // resolve path wildcards
      const { files } = await httpFileSystem.getDirectory(subfolder)
      const matchingFiles = findMatchingGlobInFiles(files, dataset)
      if (matchingFiles.length === 0) throw Error(`No files matched "${dataset}"`)
      if (matchingFiles.length > 1) {
        throw Error(`More than one file matched "${dataset}": ${matchingFiles}`)
      }
      resolvedPath = `${subfolder}/${matchingFiles[0]}`
    }

    console.log(100, 'RESOLVED PATH', resolvedPath)
    const blob = await httpFileSystem.getFileBlob(resolvedPath)
    if (!blob) throwError('BLOB IS NULL')

    const buffer = await blob.arrayBuffer()
    const cargo = gUnzip(buffer)
    return cargo
  } catch (e) {
    console.error('oh no', e)
    throwError('Error loading ' + filePath)
  }
}

/**
 * This recursive function gunzips the buffer. It is recursive because
 * some combinations of subversion, nginx, and various user browsers
 * can single- or double-gzip .gz files on the wire. It's insane but true.
 */
function gUnzip(buffer: ArrayBuffer): any {
  const u8 = new Uint8Array(buffer)

  // GZIP always starts with a magic number, hex 0x8b1f
  const header = new Uint16Array(buffer, 0, 2)

  if (header[0] === 0x8b1f) {
    try {
      const result = decompressSync(u8)
      return result
    } catch (e) {
      console.error('eee', e)
    }
  }

  return buffer
}

function throwError(message: string) {
  postMessage({ error: message })
  close()
}

function parseXML(xml: string, settings: any = {}) {
  // This uses the fast-xml-parser library, which is the least-quirky
  // of all the terrible XML libraries.
  //
  // - Element attributes are stored directly in the element as "$attributeName"
  //
  // - Items with just one element are stored as is; but you can
  //   force a path to be always-array with "alwaysArray: ['my.path.to.element]"
  //
  // - Order is not preserved; like items are stored as arrays. For matsim, this
  //   is only a problem for plans (I think?) but you can recreate the plan order
  //   since act and leg elements always alternate. (Or use "preserveOrder: true"
  //   but that creates LOTS of one-item arrays everywhere. Sad.)

  const defaultConfig = {
    ignoreAttributes: false,
    preserveOrder: false,
    attributeNamePrefix: '$',
    isFirefox: _isFirefox,
    // isArray: undefined as any,
  }

  // Allow user to pass in an array of "always as array" XML paths:
  // if (settings.alwaysArray)
  //   defaultConfig.isArray = (name: string, jpath: string) => {
  //     if (settings.alwaysArray.indexOf(jpath) !== -1) return true
  //   }

  const options = Object.assign(defaultConfig, settings)
  const parser = new XMLParser(options)

  try {
    // console.log(801, 'about to parse xml', xml.length)
    const result = parser.parse(xml)
    // console.log(802, 'parse successful')
    return result
  } catch (e) {
    console.error('WHAT', e)
    throw Error('' + e)
  }
}

async function fetchDataset(config: { dataset: string }) {
  const { files } = await _fileApi.getDirectory(_subfolder)
  return new Promise<DataTable>((resolve, reject) => {
    const thread = new DataFetcherWorker()
    try {
      thread.postMessage({
        fileSystemConfig: _fileSystemConfig,
        subfolder: _subfolder,
        files: files,
        config: config,
      })

      thread.onmessage = e => {
        thread.terminate()
        if (e.data.error) {
          reject(e.data)
        }
        resolve(e.data)
      }
    } catch (err) {
      thread.terminate()
      console.error(err)
      reject('' + err)
    }
  })
}

// // make the typescript compiler happy on import
// export default null as any
