// ROADWAY NETWORK LOADER - SIMWRAPPER

// Pass in a filename; can be MATSim network.xml.gz or preprocessed GeoJSON
// Get a table of links with Anode Bnode and properties

import PROJ4 from 'proj4'
import EPSG from 'epsg'
// import pako from 'pako'
import { decompressSync } from 'fflate'

import { XMLParser } from 'fast-xml-parser'

// import { parseXML } from '@/js/util'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

enum NetworkFormat {
  MATSIM_XML,
  GEOJSON,
  DBF,
}

// Set up ALL coordinate systems in 'epsg' repository
const allEPSGs = Object.entries(EPSG).filter(row => row[0].startsWith('EPSG') && row[1]) as any
PROJ4.defs(allEPSGs)
PROJ4.defs(
  'GK4',
  '+proj=tmerc +lat_0=0 +lon_0=12 +k=1 +x_0=4500000 +y_0=0 +ellps=bessel +datum=potsdam +units=m +no_defs'
)

// ENTRY POINT: -----------------------
onmessage = async function (e) {
  const { id, filePath, fileSystem, options } = e.data

  // guess file type from extension
  const format = guessFileTypeFromExtension(filePath)

  // fetch nodes and links
  const { links, linkOffsetLookup } = await fetchNodesAndLinks({
    format,
    filePath,
    fileSystem,
    options,
  })

  postMessage({ links, linkOffsetLookup }, [links.source.buffer, links.dest.buffer])
}

function guessFileTypeFromExtension(name: string) {
  const f = name.toLocaleLowerCase()

  // regex is ugly, but this tests for various extensions with/without .gz suffix
  if (/\.json(|\.gz)$/.test(f)) return NetworkFormat.GEOJSON
  if (/\.geojson(|\.gz)$/.test(f)) return NetworkFormat.GEOJSON
  if (/\.xml(|\.gz)$/.test(f)) return NetworkFormat.MATSIM_XML
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
  const xml: any = await parseXML(decoded, options)

  console.log({ xml })

  // What is the CRS?
  let coordinateReferenceSystem = ''

  const attribute = xml.network.attributes.attribute
  if (attribute.$name === 'coordinateReferenceSystem')
    coordinateReferenceSystem = attribute['#text']

  console.log('CRS', coordinateReferenceSystem)

  // build node/coordinate lookup
  const nodes: { [id: string]: number[] } = {}
  for (const node of xml.network.nodes.node as any) {
    const coordinates = [parseFloat(node.$x), parseFloat(node.$y)]

    // convert coordinates to long/lat if necessary
    const longlat = coordinateReferenceSystem
      ? (PROJ4(coordinateReferenceSystem, 'EPSG:4326', coordinates) as any)
      : coordinates

    nodes[node.$id] = longlat
  }

  // build links
  const linkOffsetLookup: { [id: string]: number } = {}

  const source: Float32Array = new Float32Array(2 * xml.network.links.link.length)
  const dest: Float32Array = new Float32Array(2 * xml.network.links.link.length)

  for (let i = 0; i < xml.network.links.link.length; i++) {
    const link = xml.network.links.link[i]
    linkOffsetLookup[link.$id] = i

    source[2 * i + 0] = nodes[link.$from][0]
    source[2 * i + 1] = nodes[link.$from][1]
    dest[2 * i + 0] = nodes[link.$to][0]
    dest[2 * i + 1] = nodes[link.$to][1]
  }

  const links = { source, dest }

  return { linkOffsetLookup, links }
}

async function fetchGeojson(filePath: string, fileSystem: FileSystemConfig) {
  const rawData = await fetchGzip(filePath, fileSystem)

  // TODO for now we assume everything is UTF-8; add an option later
  const decoded = new TextDecoder('utf-8').decode(rawData)
  const json = JSON.parse(decoded)

  const linkOffsetLookup: { [id: string]: number } = {}

  const source: Float32Array = new Float32Array(2 * json.features.length)
  const dest: Float32Array = new Float32Array(2 * json.features.length)

  for (let i = 0; i < json.features.length; i++) {
    const feature = json.features[i]
    // super-efficient format lol is [ coordsFrom[], coordsTo[] ]
    // const link = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]]
    source[2 * i + 0] = feature.geometry.coordinates[0][0]
    source[2 * i + 1] = feature.geometry.coordinates[0][1]
    dest[2 * i + 0] = feature.geometry.coordinates[1][0]
    dest[2 * i + 1] = feature.geometry.coordinates[1][1]

    linkOffsetLookup[feature.properties.id] = i
  }

  return { linkOffsetLookup, links: { source, dest } }
}

async function fetchGzip(filePath: string, fileSystem: FileSystemConfig) {
  try {
    const httpFileSystem = new HTTPFileSystem(fileSystem)
    const blob = await httpFileSystem.getFileBlob(filePath)
    if (!blob) throw Error('BLOB IS NULL')

    const buffer = await blob.arrayBuffer()
    const cargo = gUnzip(buffer)
    return cargo
  } catch (e) {
    console.error('oh no', e)
    throw Error('Fetch failed' + e)
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
