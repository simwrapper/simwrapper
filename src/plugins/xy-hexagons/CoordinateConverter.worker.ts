import Papa from '@simwrapper/papaparse'
import Coords from '@/js/Coords'
import { NewRowCache } from './CsvGzipParser.worker'

// -----------------------------------------------------------
onmessage = function (e) {
  parseIt(e.data)
}
// -----------------------------------------------------------

interface Aggregations {
  [heading: string]: {
    title: string
    x: string
    y: string
  }[]
}

let _allAggregations: Aggregations = {}
let _totalLines = 0
let _proj = 'EPSG:4326'
let _bytes: Uint8Array
let _headerColumns: string[]
let _id: number

const fullRowCache: NewRowCache = {}

function parseIt(props: {
  aggregations: Aggregations
  projection: string
  header: string[]
  bytes: Uint8Array
  id: number
}) {
  _allAggregations = props.aggregations
  _proj = props.projection
  _bytes = props.bytes
  _headerColumns = props.header
  _id = props.id

  convertCoordinates()
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
  postMessage({ fullRowCache, id: _id }, buffers)
}

/** **** */
function convertCoordinates() {
  // how many lines - count the \n chars // there must be a better way...?
  let count = 0
  for (let i = 0; i < _bytes.length; i++) if (_bytes[i] === 10) count++

  // might end last line without EOL marker
  if (_bytes[_bytes.length - 1] !== 10) count++

  let totalLines = count

  // only save the relevant columns to save memory and not die

  for (const group of Object.keys(_allAggregations)) {
    let i = 0
    const aggregations = _allAggregations[group]
    let numAggregations = aggregations.length

    fullRowCache[group] = {
      // 2x points for x/y coords; each Float32Array is for a unique aggregation
      positions: Array.from({ length: numAggregations }, () => new Float32Array(2 * totalLines)),
      length: Array(numAggregations).fill(0), // .from({length: numAggregations}) , // [], // totalLines * numAggregations,
      numAggs: numAggregations,
      columnIds: [],
      coordColumns: [],
    }

    for (const agg of aggregations) {
      // numAggregations++
      const xCol = _headerColumns.indexOf(agg.x)
      const yCol = _headerColumns.indexOf(agg.y)

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

  //////////////////////////////////////////////////////////////////////////
  let offset = 0
  const decoder = new TextDecoder()

  try {
    const text = decoder.decode(_bytes)

    // const numAggregations = fullRowCache.columnIds.length
    Papa.parse(text, {
      comments: '#',
      header: false,
      // preview: 100,
      skipEmptyLines: true,
      delimitersToGuess: ['\t', ';', ',', ' '],
      dynamicTyping: true,
      step: (results: any, _: any) => {
        if (_id == 0 && offset % 65536 === 0) {
          console.log(offset)
          postMessage({ status: `Processing CSV: ${Math.floor((100.0 * offset) / totalLines)}%` })
        }
        let coord = [0, 0]
        for (let group of Object.keys(fullRowCache)) {
          const rowCache = fullRowCache[group]
          for (let agg = 0; agg < rowCache.numAggs; agg++) {
            coord[0] = results.data[rowCache.coordColumns[agg * 2]]
            coord[1] = results.data[rowCache.coordColumns[agg * 2 + 1]]
            if (coord[0] && coord[1]) {
              const n = rowCache.length[agg]
              coord = Coords.toLngLat(_proj, coord)
              rowCache.positions[agg][n * 2] = coord[0]
              rowCache.positions[agg][n * 2 + 1] = coord[1]
              rowCache.length[agg] += 1
            }
            // rowCache.column[offset * rowCache.numAggs + agg] = agg
          }
        }
        offset += 1
        return results
      },
    })
  } catch (e) {
    console.log('' + e)
    postMessage({ error: 'ERROR projection coordinates' })
    return
  }
  postResults()
}
