// named *werker* because *worker* gets processed by webpack already

import { expose, Transfer } from 'threads/worker'
import { Observable } from 'observable-fns'
import pako from 'pako'
import Papaparse from 'papaparse'

import { SVNProject } from '@/Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import Coords from '@/util/Coords'

interface RowCache {
  [id: string]: { raw: Float32Array; length: number; coordColumns: string[] }
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

const rowCache: RowCache = {}
const columnLookup: string[] = []

/**
 * Load a gzip file, parse its contents and
 * return a set of ArrayBuffers for display.
 */
const csvParser = {
  /**
   * Begin loading the file, and return status updates
   * as observables. When observable is complete, the
   * processing is finished and results can be obtained
   * by calling results().
   */
  startLoading(
    filepath: string,
    fileSystem: SVNProject,
    aggregations: Aggregations,
    projection: string
  ) {
    console.log('csvGzipParser worker starting')
    allAggregations = aggregations
    proj = projection

    return new Observable<string>((observer: any) => {
      observer.next(`Loading ${filepath}...`)
      step1fetchGzip(observer, filepath, fileSystem)
    })
  },

  /**
   * Return the results after processing is complete.
   * @returns RowCache
   */
  results() {
    return Transfer(
      { rowCache, columnLookup },
      Object.values(rowCache).map(cache => cache.raw.buffer)
    )
  },
}

export type CSVParser = typeof csvParser

expose(csvParser)

// --- helper functions ------------------------------------------------

async function step1fetchGzip(observer: any, filepath: string, fileSystem: SVNProject) {
  const httpFileSystem = new HTTPFileSystem(fileSystem)
  const blob = await httpFileSystem.getFileBlob(filepath)
  if (!blob) throw Error('BLOB IS NULL')
  const buffer = await blob.arrayBuffer()

  // this will recursively gunzip until it can gunzip no more:
  const unzipped = gUnzip(buffer)

  step2examineUnzippedData(observer, unzipped)
}

function step2examineUnzippedData(observer: any, unzipped: Uint8Array) {
  observer.next('Decoding CSV...')

  // convert to string
  const text = new TextDecoder().decode(unzipped)

  const lines = (text.match(/\n/g) || '').length
  console.log(lines, 'lines')
  totalLines = lines

  // only save the relevant columns to save memory and not die

  for (const group of Object.keys(allAggregations)) {
    const aggregations = allAggregations[group]
    let i = 0
    for (const agg of aggregations) {
      columnLookup.push(...[agg.x, agg.y])
      rowCache[`${group}${i}`] = {
        raw: new Float32Array(lines * 2),
        coordColumns: [agg.x, agg.y],
        length: lines,
      }
      i++
    }
  }

  step3parseCSVdata(observer, text)
}

function step3parseCSVdata(observer: any, text: string) {
  let offset = 0

  Papaparse.parse(text, {
    header: true,
    skipEmptyLines: true,
    dynamicTyping: true,
    step: (results, parser) => {
      if (offset % 65536 === 0) {
        console.log(offset)
        observer.next(`Processing CSV: ${Math.floor((50.0 * offset) / totalLines)}%`)
      }
      for (const key of Object.keys(rowCache)) {
        const wgs84 = Coords.toLngLat(proj, [
          results.data[rowCache[key].coordColumns[0] as any],
          results.data[rowCache[key].coordColumns[1] as any],
        ])
        rowCache[key].raw.set(wgs84, offset)
      }
      offset += 2
      return results
    },
  })

  observer.next('Trimming results...')
  // now filter zero-cells out: some rows don't have coordinates, and they
  // will mess up the total calculations
  for (const key of Object.keys(rowCache)) {
    // this is dangerous: only works if BOTH the x and the y are zero; otherwise
    // it will get out of sync and things will look crazy or crash HAHahahAHHAA
    rowCache[key].raw = rowCache[key].raw.filter(elem => elem !== 0) // filter zeroes
    rowCache[key].length = rowCache[key].raw.length / 2
  }
  observer.complete()
}

/**
 * This recursive function gunzips the buffer. It is recursive because
 * some combinations of subversion, nginx, and various web browsers
 * can single- or double-gzip .gz files on the wire. It's insane but true.
 */
function gUnzip(buffer: any): Uint8Array {
  // GZIP always starts with a magic number, hex 1f8b
  const header = new Uint8Array(buffer.slice(0, 2))
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return gUnzip(pako.inflate(buffer))
  }
  return buffer
}
