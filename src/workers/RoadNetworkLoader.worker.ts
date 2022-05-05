// ROADWAY NETWORK LOADER - SIMWRAPPER

// Pass in a filename; can be MATSim network.xml.gz or preprocessed GeoJSON
// Get a table of links with Anode Bnode and properties

import { decompressSync } from 'fflate'
import { XMLParser } from 'fast-xml-parser'
import EPSGdefinitions from 'epsg'
import reproject from 'reproject'
import * as shapefile from 'shapefile'

import Coords from '@/js/Coords'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { DataTable, FileSystemConfig } from '@/Globals'

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

let _xml = {} as any
let _fileApi: HTTPFileSystem
let _fileSystemConfig: FileSystemConfig
let _subfolder = ''

// ENTRY POINT: -----------------------
onmessage = async function (e) {
  if (e.data.crs) {
    parseXmlNetworkAndPostResults(e.data.crs)
  } else {
    const { id, filePath, fileSystem, vizDetails, options } = e.data

    // guess file type from extension
    const format = guessFileTypeFromExtension(filePath)

    // fetch nodes and links
    fetchNodesAndLinks({
      format,
      filePath,
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
  format: NetworkFormat
  filePath: string
  fileSystem: FileSystemConfig
  vizDetails: any
  options: any
}): Promise<any> {
  const { format, filePath, fileSystem, vizDetails, options } = props

  switch (format) {
    case NetworkFormat.GEOJSON:
      return fetchGeojson(filePath, fileSystem)
    case NetworkFormat.MATSIM_XML:
      return fetchMatsimXmlNetwork(filePath, fileSystem, options)
    case NetworkFormat.SFCTA:
      return fetchSFCTANetwork(filePath, fileSystem, vizDetails)
    default:
      break
  }
}

async function fetchSFCTANetwork(filePath: string, fileSystem: FileSystemConfig, vizDetails: any) {
  console.log('WORKER loading shapefile', filePath)

  _fileApi = new HTTPFileSystem(fileSystem)
  _fileSystemConfig = fileSystem

  const url = filePath
  let nodes: any = {}

  // first, get shp/dbf files
  try {
    const shpPromise = _fileApi.getFileBlob(url)
    const dbfPromise = _fileApi.getFileBlob(url.replace('.shp', '.dbf'))
    await Promise.all([shpPromise, dbfPromise])

    const shpBlob = await (await shpPromise)?.arrayBuffer()
    const dbfBlob = await (await dbfPromise)?.arrayBuffer()
    if (!shpBlob || !dbfBlob) return []

    nodes = await shapefile.read(shpBlob, dbfBlob)
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
      // lol we can live without a projection
    }
  }

  const guessCRS = Coords.guessProjection(projection)
  // then, reproject if we have a projection
  if (guessCRS && guessCRS !== 'EPSG:4326') {
    nodes = reproject.toWgs84(nodes, guessCRS, EPSGdefinitions)
  }

  // OK we now have NODES in geojson.features!! ----------------------------------------
  console.log({ nodes })

  // build node coord lookup map
  const nodeLookup: { [id: string]: { properties: any; coords: number[] } } = {}
  for (const node of nodes.features) {
    // console.log(node.properties.N)
    // node lookup IDs must be strings
    const id = '' + node.properties['N']
    nodeLookup[id] = {
      properties: node.properties,
      coords: node.geometry.coordinates,
    }
  }

  // Download links data from first link datafile specified
  const linksFilename = Array.isArray(vizDetails.links) ? vizDetails.links[0] : vizDetails.links
  _subfolder = `${filePath.substring(0, filePath.lastIndexOf('/'))}`

  const linkIds: any = []
  const links = [] as any[]
  let numLinks = 0

  try {
    const dataTable = await fetchDataset({ dataset: linksFilename })
    console.log({ dataTable })

    // build link array from columnar data
    numLinks = dataTable.A.values.length
    const keys = Object.keys(dataTable)
    for (let i = 0; i < numLinks; i++) {
      links[i] = {}
      linkIds.push(dataTable.AB.values[i])
      for (const key of keys) {
        links[i][key] = dataTable[key].values[i]
      }
    }
  } catch (err) {
    const e = err as any
    postMessage({ error: '' + e.error })
  }

  const source: Float32Array = new Float32Array(2 * numLinks)
  const dest: Float32Array = new Float32Array(2 * numLinks)

  const outputLinks: any[] = []
  let warnings = 0

  // link source/dest coordinate lookup
  for (let j = 0; j < numLinks; j++) {
    const anode = nodeLookup[links[j].A]
    const bnode = nodeLookup[links[j].B]

    source[2 * j + 0] = anode.coords[0]
    source[2 * j + 1] = anode.coords[1]
    dest[2 * j + 0] = bnode.coords[0]
    dest[2 * j + 1] = bnode.coords[1]
  }

  // all done! post the links
  const linkCoordinates = { source, dest, linkIds }

  postMessage({ links: linkCoordinates }, [
    linkCoordinates.source.buffer,
    linkCoordinates.dest.buffer,
  ])

  // // add coordinates to links
  // links.forEach(link => {
  //   try {
  //     const row = Object.assign({}, link) as any
  //     // add A_coords, B_coords
  //     row.A_xy = nodeLookup[link.A].coords
  //     row.B_xy = nodeLookup[link.B].coords
  //     // add node properties
  //     Object.keys(nodeLookup[link.A].properties).forEach(key => {
  //       if (nodePropsToIgnore.has(key)) return
  //       row[`${key}_A`] = nodeLookup[link.A].properties[key]
  //     })
  //     Object.keys(nodeLookup[link.B].properties).forEach(key => {
  //       if (nodePropsToIgnore.has(key)) return
  //       row[`${key}_B`] = nodeLookup[link.B].properties[key]
  //     })
  //     outputLinks.push(row)
  //   } catch (e) {
  //     console.warn('link problem:', link)
  //     warnings++
  //   }
  // })
  if (warnings) console.error('FIX YOUR NETWORK:', warnings, 'LINKS WITH NODE LOOKUP PROBLEMS')
  // return outputLinks
  // return geojson.features as any[]
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

  // build links

  const source: Float32Array = new Float32Array(2 * _xml.network.links.link.length)
  const dest: Float32Array = new Float32Array(2 * _xml.network.links.link.length)

  const linkIds: any = []

  for (let i = 0; i < _xml.network.links.link.length; i++) {
    const link = _xml.network.links.link[i]
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
