// ROADWAY NETWORK LOADER - SIMWRAPPER

// Pass in a filename; can be MATSim network.xml.gz or preprocessed GeoJSON
// Get a table of links with Anode Bnode and properties

import { decompressSync } from 'fflate'

import { XMLParser } from 'fast-xml-parser'
import Coords from '@/js/Coords'

// import { parseXML } from '@/js/util'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

enum NetworkFormat {
  MATSIM_XML,
  GEOJSON,
  DBF,
}

let _xml = {} as any

// ENTRY POINT: -----------------------
onmessage = async function (e) {
  if (e.data.crs) {
    parseXmlNetworkAndPostResults(e.data.crs)
  } else {
    const { id, filePath, fileSystem, options } = e.data

    // guess file type from extension
    const format = guessFileTypeFromExtension(filePath)

    // fetch nodes and links
    fetchNodesAndLinks({
      format,
      filePath,
      fileSystem,
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
  if (/\.dbf(|\.gz)$/.test(f)) return NetworkFormat.DBF

  // No idea; guess MATSim.
  return NetworkFormat.MATSIM_XML
}

async function fetchNodesAndLinks(props: {
  format: NetworkFormat
  filePath: string
  fileSystem: FileSystemConfig
  options: any
}): Promise<any> {
  const { format, filePath, fileSystem, options } = props

  switch (format) {
    case NetworkFormat.GEOJSON:
      return fetchGeojson(filePath, fileSystem)
    case NetworkFormat.MATSIM_XML:
      return fetchMatsimXmlNetwork(filePath, fileSystem, options)
    default:
      break
  }
}

async function fetchMatsimXmlNetwork(filePath: string, fileSystem: FileSystemConfig, options: any) {
  const rawData = await fetchGzip(filePath, fileSystem)
  const decoded = new TextDecoder('utf-8').decode(rawData)
  _xml = await parseXML(decoded, options)

  // What is the CRS?
  let coordinateReferenceSystem = ''

  const attribute = _xml.network.attributes?.attribute
  if (attribute?.$name === 'coordinateReferenceSystem') {
    coordinateReferenceSystem = attribute['#text']
    console.log('CRS', coordinateReferenceSystem)
    parseXmlNetworkAndPostResults(coordinateReferenceSystem)
  } else {
    // We don't have CRS: send msg to UI thread to ask for it. We'll pick it up later.
    postMessage({ promptUserForCRS: 'crs needed' })
  }
}

function parseXmlNetworkAndPostResults(coordinateReferenceSystem: string) {
  // build node/coordinate lookup
  const nodes: { [id: string]: number[] } = {}
  for (const node of _xml.network.nodes.node as any) {
    const coordinates = [parseFloat(node.$x), parseFloat(node.$y)]

    // convert coordinates to long/lat if necessary
    const longlat = coordinateReferenceSystem
      ? Coords.toLngLat(coordinateReferenceSystem, coordinates)
      : coordinates

    nodes[node.$id] = longlat
  }

  // const linkOffsetLookup: { [id: string]: number } = {}

  // build links

  const source: Float32Array = new Float32Array(2 * _xml.network.links.link.length)
  const dest: Float32Array = new Float32Array(2 * _xml.network.links.link.length)

  const linkIds: any = []

  for (let i = 0; i < _xml.network.links.link.length; i++) {
    const link = _xml.network.links.link[i]
    // linkOffsetLookup[link.$id] = i
    linkIds[i] = link.$id

    source[2 * i + 0] = nodes[link.$from][0]
    source[2 * i + 1] = nodes[link.$from][1]
    dest[2 * i + 0] = nodes[link.$to][0]
    dest[2 * i + 1] = nodes[link.$to][1]
  }

  const links = { source, dest, linkIds }

  // all done! post the links
  postMessage({ links }, [links.source.buffer, links.dest.buffer])
}

async function fetchGeojson(filePath: string, fileSystem: FileSystemConfig) {
  const rawData = await fetchGzip(filePath, fileSystem)

  // TODO for now we assume everything is UTF-8; add an option later
  const decoded = new TextDecoder('utf-8').decode(rawData)
  const json = JSON.parse(decoded)

  // const linkOffsetLookup: { [id: string]: number } = {}

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
    //   https://datatracker.ietf.org/doc/html/rfc7946#section-6
    // - Section 6 says that all properties of the feature
    //   should go in the "properties" object and putting anything
    //   outside of the geometry or properties will cause
    //   interoperability problems
    //   https://datatracker.ietf.org/doc/html/rfc7946#section-6
    //
    // Thus we will look in both places.

    linkIds[i] = feature.id || feature.properties.id
  }

  const links = { source, dest, linkIds }
  // all done! post the links
  postMessage({ links }, [links.source.buffer, links.dest.buffer])
}

async function fetchGzip(filePath: string, fileSystem: FileSystemConfig) {
  try {
    const httpFileSystem = new HTTPFileSystem(fileSystem)
    const blob = await httpFileSystem.getFileBlob(filePath)
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
    const result = parser.parse(xml)
    return result
  } catch (e) {
    console.error('WHAT', e)
    throw Error('' + e)
  }
}

// // make the typescript compiler happy on import
// export default null as any
