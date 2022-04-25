/*eslint prefer-rest-params: "off"*/

import nerdamer, { ExpressionParam } from 'nerdamer'
import pako from 'pako'
import Papaparse from 'papaparse'
import YAML from 'yaml'

import { FileSystemConfig, YamlConfigs } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { findMatchingGlobInFiles, parseXML } from '@/js/util'

type TableRow = {
  title: string
  value: any
  style?: any
}

type TopsheetYaml = {
  title?: string
  title_en?: string
  title_de?: string
  files: {
    [id: string]: { file: string; useLastRow?: boolean; xmlElements: string }
  }
  userEntries?: {
    [id: string]: { title?: string; title_en?: string; title_de?: string; value: any }
  }
  calculations: { [id: string]: ExpressionParam }
  outputs: { title?: string; title_en?: string; title_de?: string; value: any; style?: any }[]
}

onmessage = async function (message) {
  const data = message.data
  switch (data.command) {
    case 'runTopSheet':
      const outputs = await runTopSheet(data)
      postMessage({ response: 'results', results: outputs })
      break
    case 'updateCalculations':
      _locale = data.locale
      const title = getTitle(_locale)
      postMessage({ response: 'title', title })
      const update = await updateCalculations(data.entries)
      postMessage({ response: 'results', results: update })
      break
    default:
      console.error('Strange command:', data)
  }
}

// global variables
let _fileSystem: HTTPFileSystem
let _subfolder = ''
let _files: string[] = []
let _boxValues: any = {}
let _yaml: TopsheetYaml = { files: {}, calculations: {}, outputs: [] }
let _calculations: any = {}
let _yamlFile: string = ''
let _locale = 'en'

let _allConfigYamls: YamlConfigs = {
  dashboards: {},
  topsheets: {},
  vizes: {},
  configs: {},
}

const _fileData: any = {}

const testRows: TableRow[] = [
  { title: 'Demand', value: 2500 },
  { title: 'Fleet size', value: 150 },
  { title: 'Fleet mileage', value: 10000.5 },
  { title: 'Income/day', value: -10, style: { color: 'red', backgroundColor: 'yellow' } },
  { title: 'Rating', value: '⭐️⭐️⭐️' },
]

async function updateCalculations(entries: { key: string; title: string; value: any }[]) {
  const boxes: any = {}

  for (const box of entries) boxes[box.key] = box.value

  _boxValues = boxes

  // do all calculations, in order they are written.
  _calculations = doAllCalculations()
  const outputs = buildOutputs()
  return outputs
}

function getTitle(locale: string) {
  console.log('getTitle locale', locale)
  let title = ''

  if (locale === 'en') title = _yaml.title_en || _yaml.title || _yaml.title_de || ''
  else title = _yaml.title_de || _yaml.title || _yaml.title_en || ''

  return title
}

function getTextEntryFields() {
  const boxes = _yaml.userEntries
  if (!boxes) return []

  const fields: any[] = []

  for (const key of Object.keys(boxes)) {
    const box = boxes[key]

    let title = ''
    if (_locale === 'en') title = box.title_en || box.title || box.title_de || key
    else title = box.title_de || box.title || box.title_en || key

    fields.push({ key, title, value: _boxValues[key] })
  }
  return fields
}

async function runTopSheet(props: {
  fileSystemConfig: FileSystemConfig
  subfolder: string
  files: string[]
  yaml: string
  locale: string
  allConfigFiles: YamlConfigs
}) {
  // console.log('TopSheet thread worker starting')

  _fileSystem = new HTTPFileSystem(props.fileSystemConfig)
  _subfolder = props.subfolder
  _files = props.files
  _yamlFile = props.yaml
  _locale = props.locale
  _allConfigYamls = props.allConfigFiles

  // read the table definitions from yaml
  _yaml = await getYaml()

  // set the title
  const title = getTitle(_locale)
  postMessage({ response: 'title', title })

  // load all files
  await loadFiles()
  console.log(_fileData)

  // set up user entry boxes if first run
  if (!Object.keys(_boxValues).length) {
    // console.log('** resetting boxvalues')
    _boxValues = getBoxValues(_yaml)
  }

  // set the entryFields
  const entryFields = getTextEntryFields()
  postMessage({ response: 'entries', entryFields })

  // do all calculations, in order they are written.
  _calculations = doAllCalculations()
  const outputs = buildOutputs()
  return outputs
}

// ----- helper functions ------------------------------------------------

function buildOutputs() {
  const rows: TableRow[] = []

  // Description:
  // use (1) locale if we have it; (2) title if we don't; (3) otherLocale; (4) variable name.

  for (const row of _yaml.outputs) {
    let title = ''
    if (_locale === 'en') {
      title = row.title_en || row.title || row.title_de || row.value
    } else {
      title = row.title_de || row.title || row.title_en || row.value
    }

    const output = { title, value: _calculations[row.value], style: {} } as TableRow

    if (('' + _calculations[row.value]).startsWith('Error'))
      output.style = { backgroundColor: 'yellow' }

    if (row.style) output.style = Object.assign({ style: output.style }, row.style)

    rows.push(output)
  }
  return rows
}

function getBoxValues(yaml: TopsheetYaml) {
  // console.log('getBoxValues')
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
      // try filter first
      const filter = getFilterReplacements(calc)
      if (filter.length) {
        calculations[calc] = filter
        continue
      }

      // calc expression
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
    } catch (e) {
      calculations[calc] = `Error:${calc}: ${expr}`
    }
  }

  return calculations
}

function getFilterReplacements(calc: string): any[] {
  const expr = '' + _yaml.calculations[calc]

  // this regex matches @filter(file.column==value):

  // OOPS: SAFARI doesn't support real regex, fuck you safari!
  // const re = /(?<=\@filter\().*?(?=\))/g
  // const patterns = expr.match(re)

  const loc = expr.indexOf('@filter(')
  if (loc == -1) return []

  // analyze first @filter only
  const innerPattern = expr.substring(loc + 8, expr.indexOf(')', loc))

  const filters = {
    '==': (row: any) => row[column] == value,
    '<=': (row: any) => row[column] <= value,
    '>=': (row: any) => row[column] >= value,
    '!=': (row: any) => row[column] != value,
    '<': (row: any) => row[column] < value,
    '>': (row: any) => row[column] > value,
  } as any

  const supportedFilters = Object.keys(filters)
  let whichFilter = ''
  for (const f of supportedFilters) {
    if (innerPattern.indexOf(f) > -1) {
      whichFilter = f
      break
    }
  }
  if (!whichFilter) throw Error(`${calc}: filter needs ==,<=,>=,!=,<,>`)

  const [left, value] = innerPattern.split(whichFilter).map((a: string) => a.trim())
  const [file, column] = left.split('.').map((a: string) => a.trim())
  console.log(file, column, value)

  // ok now do the filtering
  const table = _fileData[file] as any[]
  const filtered = table.filter(filters[whichFilter])

  // save it as if it were a file
  _fileData[calc] = filtered

  // and pass it back as a calculation too
  return filtered
}

function getFileVariableReplacements(expr: string) {
  // this regex matches {variables}
  // OOPS! SAFARI FUCKALL DOESN'T SUPPORT REGEX WITH LOOKBEHIND
  // broken: const re = /(?<={).*?(?=})/g
  // const patterns = expr.match(re)

  // non-regex version because SAFARI IS THE WORST :-O
  let offset = 0
  const patterns: string[] = []

  while (expr.indexOf('{', offset) > -1) {
    offset = 1 + expr.indexOf('{', offset)
    const element = expr.substring(offset, expr.indexOf('}', offset))
    patterns.push(element)
  }

  // no vars? just return the string
  if (!patterns.length) return expr

  // for each {variable}, do a lookup and replace
  for (let p of patterns) {
    // e.g. sum, count
    let calculationType = ''

    // special functions start with '@': @sum, @count, @etc
    if (p[0] == '@') {
      const pSplitted = p.split(/[()@]+/)
      p = pSplitted[2]
      calculationType = pSplitted[1]
    }

    const pattern = p.split('.') // ${file.variable} --> ['file','variable']
    const element = _fileData[pattern[0]]

    let lookup

    switch (calculationType) {
      case 'min':
        // Calculate the min
        if (Array.isArray(element)) {
          for (const row of element) {
            if (lookup > row[pattern[1]] || lookup == undefined) {
              lookup = row[pattern[1]]
            }
          }
        } else {
          lookup = element[pattern[1]]
        }
        // @min(drtVehicles.t_1) -> drtVehicles.t_1
        expr = expr.replaceAll(
          '@min(' + pattern[0] + '.' + pattern[1] + ')',
          '' + pattern[0] + '.' + pattern[1]
        )
        break
      case 'max':
        // Calculate the max
        if (Array.isArray(element)) {
          for (const row of element) {
            if (lookup < row[pattern[1]] || lookup == undefined) {
              lookup = row[pattern[1]]
            }
          }
        } else {
          lookup = element[pattern[1]]
        }
        // @max(drtVehicles.t_1) -> drtVehicles.t_1
        expr = expr.replaceAll(
          '@max(' + pattern[0] + '.' + pattern[1] + ')',
          '' + pattern[0] + '.' + pattern[1]
        )
        break
      case 'mean':
        // Calculate the mean
        if (Array.isArray(element)) {
          lookup = 0
          let count = 0
          for (const row of element) {
            count++
            lookup = lookup + row[pattern[1]]
          }
          lookup = lookup / count
        } else {
          lookup = element[pattern[1]]
        }
        // @mean(drtVehicles.t_1) -> drtVehicles.t_1
        expr = expr.replaceAll(
          '@mean(' + pattern[0] + '.' + pattern[1] + ')',
          '' + pattern[0] + '.' + pattern[1]
        )
        break
      case 'first':
        // Calculate the first element
        if (Array.isArray(element)) {
          lookup = element[0][pattern[1]]
        } else {
          lookup = element[pattern[1]]
        }
        // @first(drtVehicles.t_1) -> drtVehicles.t_1
        expr = expr.replaceAll(
          '@first(' + pattern[0] + '.' + pattern[1] + ')',
          '' + pattern[0] + '.' + pattern[1]
        )
        break
      case 'last':
        // Calculate the last element
        if (Array.isArray(element)) {
          lookup = element[element.length-1][pattern[1]]
        } else {
          lookup = element[pattern[1]]
        }
        // @last(drtVehicles.t_1) -> drtVehicles.t_1
        expr = expr.replaceAll(
          '@last(' + pattern[0] + '.' + pattern[1] + ')',
          '' + pattern[0] + '.' + pattern[1]
        )
        break
      case 'sum':
        // Calculate the sum
        lookup = 0
        if (Array.isArray(element)) {
          for (const row of element) {
            lookup = lookup + row[pattern[1]]
          }
        } else {
          lookup = element[pattern[1]]
        }
        // @sum(drtVehicles.t_1) -> drtVehicles.t_1
        expr = expr.replaceAll(
          '@sum(' + pattern[0] + '.' + pattern[1] + ')',
          '' + pattern[0] + '.' + pattern[1]
        )
        break
      case 'count':
        lookup = 0
        // Count all elements
        if (Array.isArray(element)) {
          lookup = element.length
        } else {
          lookup = 1
        }
        // @count(drtVehicles.t_1) -> drtVehicles.t_1
        expr = expr.replaceAll(
          '@count(' + pattern[0] + '.' + pattern[1] + ')',
          '' + pattern[0] + '.' + pattern[1]
        )
        break
      default:
        lookup = 0
        // if this represents a scalar, use it; otherwise it is an array, and do a summation
        if (Array.isArray(element)) {
          for (const row of element) {
            lookup = lookup + row[pattern[1]]
          }
        } else {
          lookup = element[pattern[1]]
        }
        break
    }
    expr = expr.replaceAll('{' + pattern[0] + '.' + pattern[1] + '}', '' + lookup)
  }
  return expr
}

async function getYaml() {
  let filename = _yamlFile

  // if we have a reference to a yaml in a different folder, use that one
  filename = _allConfigYamls.topsheets[_yamlFile] || filename

  const text = await _fileSystem.getFileText(filename)
  const yaml = YAML.parse(text) as TopsheetYaml
  return yaml
}

async function loadFiles() {
  for (const inputFile of Object.keys(_yaml.files)) {
    try {
      // figure out which file to load
      const pattern = _yaml.files[inputFile].file
      let matchingFiles = findMatchingGlobInFiles(_files, pattern)

      if (matchingFiles.length == 0) {
        console.warn(`No files in THIS FOLDER matched pattern ${pattern}`)
        console.warn('Assuming filename is hardcoded.')
        matchingFiles = [pattern]
      } else if (matchingFiles.length > 1) {
        throw Error(`More than one file matched pattern ${pattern}: ${matchingFiles}`)
      }

      const filename = matchingFiles[0]

      // load the file
      const text = await loadFileOrGzipFile(filename)

      // handle the various filetypes: csv, xml...
      await parseVariousFileTypes(inputFile, filename, text)
    } catch (e) {
      console.error(e)
      // throw e
    }
  }
}

async function parseVariousFileTypes(fileKey: string, filename: string, text: string) {
  // XML
  if (filename.indexOf('.xml') > -1) {
    const xml = (await parseXML(text, {
      mergeAttrs: true,
      explicitArray: false,
      parseAttributeValue: true,
      attributeNamePrefix: '',
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
    delimitersToGuess: ['\t', ';', ','],
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

function parseNumbers(str: any) {
  if (!isNaN(str)) {
    str = str % 1 === 0 ? parseInt(str, 10) : parseFloat(str)
  }
  return str
}
