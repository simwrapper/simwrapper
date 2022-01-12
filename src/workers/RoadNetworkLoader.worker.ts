// ROADWAY NETWORK LOADER - SIMWRAPPER

// Pass in a filename; can be MATSim network.xml.gz or preprocessed GeoJSON
// Get a table of links with Anode Bnode and properties

import PROJ4 from 'proj4'
import EPSG from 'epsg'
import pako from 'pako'

import { parseXML } from '@/js/util'

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

onmessage = async function (e) {
  const { id, filePath, fileSystem, options } = e.data

  // guess file type from extension
  const format = guessFileTypeFromExtension(filePath)

  // fetch nodes and links
  const { geojsonData, linkOffsetLookup } = await fetchNodesAndLinks({
    format,
    filePath,
    fileSystem,
    options,
  })

  postMessage({ geojsonData, linkOffsetLookup })
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

  // What is the CRS?
  let coordinateReferenceSystem = ''
  const attribute = xml.network.attributes.attribute
  if (attribute.$name === 'coordinateReferenceSystem')
    coordinateReferenceSystem = attribute['#text']

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
  const geojsonData: any[] = []
  for (let i = 0; i < xml.network.links.link.length; i++) {
    const link = xml.network.links.link[i]
    const coordinates = [nodes[link.$from], nodes[link.$to]]
    geojsonData.push(coordinates)
    linkOffsetLookup[link.$id] = i
  }

  return { linkOffsetLookup, geojsonData }
}

async function fetchGeojson(filePath: string, fileSystem: FileSystemConfig) {
  console.log(11)
  const rawData = await fetchGzip(filePath, fileSystem)
  console.log(12)

  // TODO for now we assume everything is UTF-8; add an option later
  const decoded = new TextDecoder('utf-8').decode(rawData)
  console.log(13)
  const json = JSON.parse(decoded)
  console.log(14)

  const linkOffsetLookup: { [id: string]: number } = {}
  const geojsonData: any[] = []

  for (let i = 0; i < json.features.length; i++) {
    const feature = json.features[i]
    // super-efficient format lol is [ coordsFrom[], coordsTo[] ]
    const link = [feature.geometry.coordinates[0], feature.geometry.coordinates[1]]
    geojsonData.push(link)

    linkOffsetLookup[feature.properties.id] = i
  }
  console.log(15)

  return { linkOffsetLookup, geojsonData }
}

async function fetchGzip(filePath: string, fileSystem: FileSystemConfig) {
  try {
    const httpFileSystem = new HTTPFileSystem(fileSystem)
    const blob = await httpFileSystem.getFileBlob(filePath)
    if (!blob) throw Error('BLOB IS NULL')

    const buffer = await blob.arrayBuffer()
    const cargo = gUnzip(buffer)
    console.log({ cargo })
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
function gUnzip(buffer: any): any {
  console.log('gUnzip', buffer)
  // GZIP always starts with a magic number, hex 0x8b1f
  const header = new Uint16Array(buffer, 0, 2)

  if (header[0] === 0x8b1f) {
    console.log('hello')
    try {
      const zcontent = pako.inflate(buffer)
      console.log({ zcontent })
      return zcontent
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

// // make the typescript compiler happy on import
// export default null as any
