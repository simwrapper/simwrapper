'use strict'
// --- WORKER PREAMBLE ---------------------------------------
// This lets typescript know we are in a worker, not a window
const ctx: Worker = self as any
export default null as any
// -----------------------------------------------------------

import Papa from '@simwrapper/papaparse'

import HTTPFileSystem from '@/js/HTTPFileSystem'

let _fileAPI: HTTPFileSystem
let _filePath: string
let _config: any
let _fields: any[] = []
let _origCol: string, _destCol: string
let _zoneData = {} as any
let _dailyZoneData = {} as any
let _dailyLinkData = {} as any

onmessage = async ({ data: { config, filePath, fileSystem } }: MessageEvent) => {
  console.log('WORKER:', filePath)
  _fileAPI = new HTTPFileSystem(fileSystem)
  _filePath = filePath
  _config = config

  try {
    const csv = await loadFile()

    _fields = csv.meta.fields

    createMatrixFromRowData(csv.data)

    ctx.postMessage({
      rowName: _origCol,
      colName: _destCol,
      headers: _fields,
      zoneData: _zoneData,
      dailyZoneData: _dailyZoneData,
      dailyLinkData: _dailyLinkData,
      finished: true,
    })
  } catch (e) {
    ctx.postMessage({
      error: '' + e,
    })
  }
}

function createMatrixFromRowData(data: any[]) {
  _origCol = _fields[0]
  _destCol = _fields[1]
  _fields = _fields.slice(2)

  // loop over each row to build matrix of data
  for (const row of data) {
    const values = _fields.map(column => parseFloat(row[column]))

    // build zone matrix
    const i = row[_origCol]
    const j = row[_destCol]

    if (!_zoneData[i]) _zoneData[i] = {}
    _zoneData[i][j] = values //TODO this should be a sum

    // calculate daily/total values
    const daily = values.reduce((a, b) => (Number.isFinite(b) ? a + b : a), 0)

    if (!_dailyZoneData[i]) _dailyZoneData[i] = []
    _dailyZoneData[i][j] = daily

    // save total on the links too
    if (daily !== 0) {
      const ij = `${i}:${j}`
      _dailyLinkData[ij] = { orig: i, dest: j, daily, values }
    }
  }
}

async function loadFile() {
  const rawText = await _fileAPI.getFileText(_filePath)
  const csv = Papa.parse(rawText, {
    comments: '#',
    delimitersToGuess: [';', '\t', ',', ' '],
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  })

  return csv
}
