/**
 * Load a gzip file, parse its contents and return a set of ArrayBuffers for display.
 */
import Papa from '@simwrapper/papaparse'

import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import Coords from '@/js/Coords'

import { gUnzip, findMatchingGlobInFiles } from '@/js/util'

// -----------------------------------------------------------
onmessage = function (e) {
  startLoading(e.data)
}
// -----------------------------------------------------------

export interface NewRowCache {
  [group: string]: {
    positions: Float32Array
    column: Uint8Array
    columnIds: string[]
    coordColumns: number[]
    length: number
    numAggs: number
  }
}

interface Aggregations {
  [heading: string]: {
    title: string
    x: string
    y: string
  }[]
}

let allAggregations: Aggregations = {}
let totalLines = 0
let proj = 'EPSG:4326'

const fullRowCache: NewRowCache = {}

/**
 * Begin loading the file, and return status updates
 * as observables. When observable is complete, the
 * processing is finished and results can be obtained
 * by calling results().
 */
function startLoading(props: {
  filepath: string
  fileSystem: FileSystemConfig
  aggregations: Aggregations
  projection: string
}) {
  allAggregations = props.aggregations
  proj = props.projection

  postMessage({ status: `Loading ${props.filepath}...` })
  step1fetchFile(props.filepath, props.fileSystem)
}

// --- helper functions ------------------------------------------------

/**
 * Return the results after processing is complete.
 * @returns FullRowCache, ColumnLookup
 */
function postResults() {
  const positionBuffers = Object.values(fullRowCache).map(a => a.positions.buffer)
  const columnBuffers = Object.values(fullRowCache).map(a => a.column.buffer)
  postMessage({ fullRowCache }, [...positionBuffers, ...columnBuffers])
}

async function step1fetchFile(filepath: string, fileSystem: FileSystemConfig) {
  try {
    const httpFileSystem = new HTTPFileSystem(fileSystem)

    // figure out which file to load with *? wildcards
    let expandedFilename = filepath
    if (filepath.indexOf('*') > -1 || filepath.indexOf('?') > -1) {
      const zDataset = filepath.substring(1 + filepath.lastIndexOf('/'))
      const zSubfolder = filepath.substring(0, filepath.lastIndexOf('/'))

      // fetch list of files in this folder
      const { files } = await httpFileSystem.getDirectory(zSubfolder)
      const matchingFiles = findMatchingGlobInFiles(files, zDataset)
      if (matchingFiles.length == 0) throw Error(`No files matched "${zDataset}"`)
      if (matchingFiles.length > 1)
        throw Error(`More than one file matched "${zDataset}": ${matchingFiles}`)
      expandedFilename = `${zSubfolder}/${matchingFiles[0]}`
    }

    const blob = await httpFileSystem.getFileBlob(expandedFilename)
    if (!blob) throw Error('BLOB IS NULL')
    const buffer = await blob.arrayBuffer()

    // this will recursively gunzip until it can gunzip no more:
    const unzipped = await gUnzip(buffer)

    step2examineUnzippedData(new Uint8Array(unzipped))
  } catch (e) {
    postMessage({ error: 'Error loading: ' + filepath })
    throw Error('LOAD FAIL! ' + filepath)
  }
}

function step2examineUnzippedData(unzipped: Uint8Array) {
  postMessage({ status: 'Decoding CSV...' })

  // Figure out which columns to save
  const decoder = new TextDecoder()

  let skipLength = 0
  let header = ''
  const initialLines = decoder.decode(unzipped.subarray(0, 1024)).split('\n')
  for (let i = 0; i < 20; i++) {
    header = initialLines[i]
    skipLength += header.length
    if (!header.startsWith('#')) break
    const epsg = header.indexOf('EPSG')
    if (epsg > -1) {
      postMessage({ projection: header.slice(epsg) })
      proj = header.slice(epsg)
    }
  }

  const endOfHeader = skipLength // header.length

  const separator =
    header.indexOf(';') > -1
      ? ';'
      : header.indexOf('\t') > -1
      ? '\t'
      : header.indexOf(',') > -1
      ? ','
      : ' '
  const headerColumns = header.trim().split(separator) // trim to avoid line ending problems

  // split uint8 array into subarrays
  const startOfData = endOfHeader + 1
  const sections = [] as Uint8Array[]

  let half = Math.floor(unzipped.length / 2)
  while (half > 0 && unzipped[half] !== 10) {
    // \n
    half -= 1
  }

  // it's possible there is no data in this CSV :eyeroll:

  if (half == 0) {
    const section1 = unzipped.subarray(startOfData)
    sections.push(section1)
  } else {
    const section1 = unzipped.subarray(startOfData, half)
    const section2 = unzipped.subarray(half)
    sections.push(section1)
    sections.push(section2)
  }
  // how many lines - count the \n chars
  // there must be a better way...?
  let count = 0
  for (let i = startOfData; i < unzipped.length; i++) if (unzipped[i] === 10) count++

  // might end last line without EOL marker
  if (unzipped[unzipped.length - 1] !== 10) count++

  totalLines = count

  // only save the relevant columns to save memory and not die

  let numAggregations = 0

  for (const group of Object.keys(allAggregations)) {
    const aggregations = allAggregations[group]
    let i = 0
    let numAggregations = aggregations.length

    fullRowCache[group] = {
      positions: new Float32Array(2 * totalLines * numAggregations),
      column: new Uint8Array(totalLines * numAggregations),
      length: totalLines * numAggregations,
      numAggs: numAggregations,
      columnIds: [],
      coordColumns: [],
    }

    for (const agg of aggregations) {
      numAggregations++
      const xCol = headerColumns.indexOf(agg.x)
      const yCol = headerColumns.indexOf(agg.y)

      if (xCol === -1 || yCol === -1) {
        let msg = 'Could not find column '
        const missingColumn = []
        if (xCol === -1) missingColumn.push(agg.x)
        if (yCol === -1) missingColumn.push(agg.y)
        msg = msg + missingColumn.join(',')
        postMessage({ error: msg })
        return
      }

      fullRowCache[group].columnIds.push(`${group}${i}`)
      fullRowCache[group].coordColumns.push(...[xCol, yCol])
      // incr aggr number
      i++
    }
  }

  step3parseCSVdata(sections)
}

function step3parseCSVdata(sections: Uint8Array[]) {
  let offset = 0

  const decoder = new TextDecoder()

  try {
    for (const section of sections) {
      const text = decoder.decode(section)

      // const numAggregations = fullRowCache.columnIds.length
      Papa.parse(text, {
        comments: '#',
        header: false,
        // preview: 100,
        skipEmptyLines: true,
        delimitersToGuess: ['\t', ';', ',', ' '],
        dynamicTyping: true,
        step: (results: any, _: any) => {
          if (offset % 65536 === 0) {
            console.log(offset)
            postMessage({ status: `Processing CSV: ${Math.floor((100.0 * offset) / totalLines)}%` })
          }
          let coord = [0, 0]
          for (let group of Object.keys(fullRowCache)) {
            const rowCache = fullRowCache[group]
            for (let agg = 0; agg < rowCache.numAggs; agg++) {
              coord[0] = results.data[rowCache.coordColumns[agg * 2]]
              coord[1] = results.data[rowCache.coordColumns[agg * 2 + 1]]
              if (coord[0] && coord[1]) coord = Coords.toLngLat(proj, coord)
              rowCache.positions[offset * 2 * rowCache.numAggs + agg * 2] = coord[0]
              rowCache.positions[offset * 2 * rowCache.numAggs + agg * 2 + 1] = coord[1]
              rowCache.column[offset * rowCache.numAggs + agg] = agg
            }
          }
          offset += 1
          return results
        },
      })
    }
  } catch (e) {
    console.log('' + e)
    postMessage({ error: 'ERROR projection coordinates' })
    return
  }
  postMessage({ status: 'Trimming results...' })

  // now filter zero-cells out: some rows don't have coordinates, and they
  // will mess up the total calculations
  // for (const key of Object.keys(rowCache)) {
  // this is dangerous: only works if BOTH the x and the y are zero; otherwise
  // it will get out of sync and things will look crazy or crash HAHahahAHHAA

  // rowCache[key].raw = rowCache[key].raw.filter(elem => elem !== 0) // filter zeroes
  // rowCache[key].length = rowCache[key].raw.length / 2
  // }

  postResults()
}
