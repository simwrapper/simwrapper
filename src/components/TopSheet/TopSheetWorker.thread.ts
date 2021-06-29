// named *thread* because *worker* gets processed by webpack already

/*eslint prefer-rest-params: "off"*/

import { expose } from 'threads/worker'
import nerdamer, { ExpressionParam } from 'nerdamer'
import pako from 'pako'
import Papaparse from 'papaparse'
import YAML from 'yaml'
import { parseNumbers } from 'xml2js/lib/processors'

import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import { findMatchingGlobInFiles, parseXML } from '@/util/util'
import globalStore from '@/store'

type TableRow = {
  title: string
  value: any
  style?: any
}

type TopsheetYaml = {
  files: {
    [id: string]: { file: string; useLastRow?: boolean; xmlElements: string }
  }
  userEntries?: {
    [id: string]: { title?: string; title_en?: string; title_de?: string; value: any }
  }
  calculations: { [id: string]: ExpressionParam }
  outputs: { title?: string; title_en?: string; title_de?: string; value: any; style?: any }[]
}

// global variables
let _fileSystem: HTTPFileSystem
let _subfolder = ''
let _files: string[] = []
let _boxValues: any = {}
let _yaml: TopsheetYaml = { files: {}, calculations: {}, outputs: [] }
let _calculations: any = {}
const _fileData: any = {}

const testRows: TableRow[] = [
  { title: 'Demand', value: 2500 },
  { title: 'Fleet size', value: 150 },
  { title: 'Fleet mileage', value: 10000.5 },
  { title: 'Income/day', value: -10, style: { color: 'red', backgroundColor: 'yellow' } },
  { title: 'Rating', value: '⭐️⭐️⭐️' },
]

expose({
  async updateCalculations(entries: { key: string; title: string; value: any }[]) {
    const boxes: any = {}

    for (const box of entries) boxes[box.key] = box.value

    _boxValues = boxes

    // do all calculations, in order they are written.
    _calculations = doAllCalculations()
    const outputs = buildOutputs()
    return outputs
  },

  getTextEntryFields() {
    const boxes = _yaml.userEntries
    if (!boxes) return []

    const fields: any[] = []
    const locale = globalStore.state.locale

    for (const key of Object.keys(boxes)) {
      const box = boxes[key]

      let title = ''
      if (locale === 'en') title = box.title_en || box.title || box.title_de || key
      else title = box.title_de || box.title || box.title_en || key

      fields.push({ key, title, value: _calculations[key] })
    }
    return fields
  },

  async runTopSheet(props: {
    fileSystemConfig: FileSystemConfig
    subfolder: string
    files: string[]
  }) {
    console.log('TopSheet thread worker starting')

    _fileSystem = new HTTPFileSystem(props.fileSystemConfig)
    _subfolder = props.subfolder
    _files = props.files

    // read the table definitions from yaml
    _yaml = await getYaml()

    // load all files
    await loadFiles()
    console.log(_fileData)

    // set up user entry boxes if first run
    if (!Object.keys(_boxValues).length) {
      console.log('** resetting boxvalues')
      _boxValues = getBoxValues(_yaml)
    }

    // do all calculations, in order they are written.
    _calculations = doAllCalculations()
    const outputs = buildOutputs()
    return outputs
  },
})

// ----- helper functions ------------------------------------------------

function buildOutputs() {
  const rows: TableRow[] = []

  // Header: use (1) locale if we have it; (2) title if we don't; (3) otherLocale; (4) variable name.
  const locale = globalStore.state.locale

  for (const row of _yaml.outputs) {
    let title = ''
    if (locale === 'en') title = row.title_en || row.title || row.title_de || row.value
    else title = row.title_de || row.title || row.title_en || row.value

    const output = { title, value: _calculations[row.value], style: {} } as TableRow

    if (('' + _calculations[row.value]).startsWith('Error'))
      output.style = { backgroundColor: 'yellow' }

    if (row.style) output.style = Object.assign({ style: output.style }, row.style)

    rows.push(output)
  }
  return rows
}

function getBoxValues(yaml: TopsheetYaml) {
  console.log('getBoxValues')
  const boxes = yaml.userEntries
  if (!boxes) return {}

  const boxValues: any = {}
  for (const boxId of Object.keys(boxes)) {
    boxValues[boxId] = boxes[boxId].value
  }

  return boxValues
}

function doAllCalculations() {
  console.log('CALCULATIONS ---------------------')

  // Start with user entries!
  const calculations = Object.assign({}, _boxValues)
  let expr = ''

  // Now loop thru each calc and try to solve it
  for (const calc of Object.keys(_yaml.calculations)) {
    try {
      expr = '' + _yaml.calculations[calc]

      // look up any file-based variables
      expr = getFileVariableReplacements(expr)

      // replace variables with known quantities
      for (const [k, v] of Object.entries(calculations)) {
        expr = expr.replaceAll(k, '' + v)
      }

      // solve the equation using nerdamer
      const value = nerdamer(expr).valueOf()
      calculations[calc] = value
      console.log(calc, value)
    } catch (e) {
      calculations[calc] = `Error:${calc}: ${expr}`
    }
  }

  return calculations
}

function getFileVariableReplacements(expr: string) {
  // this regex matches any ${variables}
  const re = /{.*?}/g
  const patterns = expr.match(re)
  if (!patterns) return expr

  // for each ${variable}, do a lookup and replace
  for (const p of patterns) {
    const pattern = p.substring(1, p.length - 1).split('.') // ${file.variable} --> ['file','variable']

    const element = _fileData[pattern[0]]

    // if this represents a scalar, use it; otherwise it is an array, and do a summation
    let lookup = 0
    if (Array.isArray(element)) {
      for (const row of element) {
        lookup = lookup + row[pattern[1]]
      }
    } else {
      lookup = element[pattern[1]]
    }

    expr = expr.replaceAll('${' + pattern[0] + '.' + pattern[1] + '}', '' + lookup)
  }
  return expr
}

async function getYaml() {
  const filename = 'topsheet.yaml'

  const text = await _fileSystem.getFileText(`${_subfolder}/${filename}`)
  const yaml = YAML.parse(text) as TopsheetYaml
  console.log({ yaml })
  return yaml
}

async function loadFiles() {
  for (const inputFile of Object.keys(_yaml.files)) {
    try {
      // figure out which file to load
      const pattern = _yaml.files[inputFile].file
      const matchingFiles = findMatchingGlobInFiles(_files, pattern)

      if (matchingFiles.length == 0) throw Error(`No files matched pattern ${pattern}`)
      if (matchingFiles.length > 1)
        throw Error(`More than one file matched pattern ${pattern}: ${matchingFiles}`)

      const filename = matchingFiles[0]
      console.log('Reading', filename)

      // load the file
      const text = await loadFileOrGzipFile(filename)

      // handle the various filetypes: csv, xml...
      await parseVariousFileTypes(inputFile, filename, text)
    } catch (e) {
      console.error(e)
      throw e
    }
  }
}

async function parseVariousFileTypes(fileKey: string, filename: string, text: string) {
  // XML
  if (filename.indexOf('.xml') > -1) {
    const xml = (await parseXML(text, {
      mergeAttrs: true,
      explicitArray: false,
      attrValueProcessors: [parseNumbers],
    })) as any

    // Do a splitty lookup if the xmlElement is specified
    const details = _yaml.files[fileKey]
    if (details.xmlElements) {
      const subelements = details.xmlElements.split('.')
      const subXML = drillIntoXML(xml, subelements)
      _fileData[fileKey] = subXML
    } else {
      _fileData[fileKey] = xml
    }

    return

    function drillIntoXML(parent: any, tag: any): any {
      if (Array.isArray(tag) && tag.length > 0) return drillIntoXML(parent[tag[0]], tag.slice(1))
      return parent
    }
  }

  // if it isn't XML, then let's hope assume Papaparse can handle it
  const csv = Papaparse.parse(text, {
    // preview: 10000,
    comments: '#',
    dynamicTyping: true,
    header: true,
    skipEmptyLines: true,
  }).data

  // if useLastRow, do that
  if (_yaml.files[fileKey].useLastRow) {
    const lastRow = csv[csv.length - 1]
    _fileData[fileKey] = lastRow
  } else {
    _fileData[fileKey] = csv
  }
}

async function loadFileOrGzipFile(filename: string) {
  const filepath = `${_subfolder}/${filename}`

  // fetch the file
  const blob = await _fileSystem.getFileBlob(filepath)
  if (!blob) throw Error('BLOB IS NULL')
  const buffer = await blob.arrayBuffer()

  // recursively gunzip until it can gunzip no more:
  const unzipped = gUnzip(buffer)

  // convert to utf-8
  const text = new TextDecoder().decode(unzipped)

  return text

  /**
   * This recursive function gunzips the buffer. It is recursive because
   * some combinations of subversion, nginx, and various web browsers
   * can single- or double-gzip .gz files on the wire. It's insane but true.
   */
  function gUnzip(buffer: any): Uint8Array {
    // GZIP always starts with a magic number, hex $1f8b
    const header = new Uint8Array(buffer.slice(0, 2))
    if (header[0] === 0x1f && header[1] === 0x8b) {
      return gUnzip(pako.inflate(buffer))
    }
    return buffer
  }
}
