/**
 * Load a gzip file, parse its contents and return a set of ArrayBuffers for display.
 */
import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import { gUnzip, findMatchingGlobInFiles } from '@/js/util'
import CoordinateWorker from './CoordinateConverter.worker.ts?worker'

// -----------------------------------------------------------
onmessage = function (e) {
  startLoading(e.data)
}
// -----------------------------------------------------------

export interface NewRowCache {
  [group: string]: {
    positions: Float32Array[]
    length: number[]
    // column: Uint8Array
    columnIds: string[]
    coordColumns: number[]
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
let _workers = [] as any[]

let fullRowCache: NewRowCache = {}

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
  const buffers = [] as any
  Object.values(fullRowCache).forEach(group => {
    group.positions.forEach(p => buffers.push(p.buffer))
  })
  postMessage({ fullRowCache }, buffers)
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

  // how many lines - count the \n chars
  let count = 0
  for (let i = startOfData; i < unzipped.length; i++) if (unzipped[i] === 10) count++
  // might end last line without EOL marker
  if (unzipped[unzipped.length - 1] !== 10) count++
  totalLines = count

  // split into sections if there are more than 1000 lines
  const SECTIONS = count > 1000 ? 4 : 1

  const splitLocs = [] as number[]
  for (let i = 1; i < SECTIONS; i++) {
    let half = Math.floor((unzipped.length / SECTIONS) * i)
    while (half > 0 && unzipped[half] !== 10) {
      // \n
      half -= 1
    }
    splitLocs.push(half)
  }
  if (!splitLocs.length) splitLocs.push(0)

  // it's also possible there is no data in this CSV :eyeroll:
  if (splitLocs[0] == 0) {
    sections.push(unzipped.subarray(startOfData))
  } else {
    let start = startOfData
    for (let i = 0; i < splitLocs.length + 1; i++) {
      const sect = unzipped.slice(start, splitLocs[i] ?? undefined)
      sections.push(sect)
      start = splitLocs[i] + 1
    }
  }

  // only save the relevant columns to save memory and not die
  for (const group of Object.keys(allAggregations)) {
    const aggregations = allAggregations[group]
    let i = 0
    let numAggregations = aggregations.length

    fullRowCache[group] = {
      // 2x points for x/y coords; each Float32Array is for a unique aggregation
      positions: [], // Array.from({ length: numAggregations }, () => new Float32Array(2 * totalLines)),
      // column: new Uint8Array(totalLines * numAggregations),
      length: [], // totalLines,
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

  step3parseCSVdata(sections, headerColumns)
}

function step3parseCSVdata(sections: Uint8Array[], headerColumns: string[]) {
  let numActiveWorkers = sections.length

  try {
    for (let i = 0; i < sections.length; i++) {
      _workers.push(new CoordinateWorker())
      _workers[i].onmessage = (m: MessageEvent) => {
        if (m.data.ready) {
          _workers[i].postMessage(
            {
              id: i,
              aggregations: allAggregations,
              projection: proj,
              header: headerColumns,
              bytes: sections[i],
            },
            [sections[i].buffer]
          )
          return
        }

        if (m.data.error) {
          postMessage({ error: m.data.error })
          return
        }
        if (m.data.status) {
          postMessage({ status: m.data.status })
          return
        }
        if (m.data.fullRowCache) {
          // close this worker
          _workers[m.data.id].terminate()
          _workers[m.data.id] = m.data.fullRowCache
          // last worker? post results!
          numActiveWorkers -= 1
          if (!numActiveWorkers) {
            aggregateResults()
          }
        }
      }
    }
  } catch (e) {
    console.log('' + e)
    postMessage({ error: 'ERROR projection coordinates' })
    return
  }
}

function aggregateResults() {
  postMessage({ status: 'Merging results...' })
  // set the array buffers for positions/column values
  // for all groups and for all workers
  const groups = Object.keys(fullRowCache)
  for (const group of groups) {
    const groupData = fullRowCache[group]
    for (let agg = 0; agg < groupData.numAggs; agg++) {
      // figure out length of real data returned by all workers:
      const totalLength = _workers.reduce((a, w) => a + w[group].length[agg], 0)
      groupData.positions.push(new Float32Array(2 * totalLength))
      let offset = 0
      for (let i = 0; i < _workers.length; i++) {
        const wData = _workers[i] as NewRowCache
        const n = wData[group].length[agg]
        const filledValues = wData[group].positions[agg].slice(0, n * 2)
        groupData.positions[agg].set(filledValues, offset * 2)
        offset += n
      }
    }
  }
  // all done
  postResults()
}

postMessage({ ready: true })
