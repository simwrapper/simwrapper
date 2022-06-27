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
      expr = getFileVariableReplacements(calc, expr)

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

  // ok now do the filtering
  const table = _fileData[file] as any[]
  const filtered = table.filter(filters[whichFilter])

  // save it as if it were a file
  _fileData[calc] = filtered

  // and pass it back as a calculation too
  return filtered
}

function getFileVariableReplacements(calc: string, expr: string) {
  const validFunctions = ['first', 'last', 'sum', 'mean', 'min', 'max', 'count']

  // this regex matches {variables}
  // broken: const re = /(?<={).*?(?=})/g
  // const patterns = expr.match(re)
  // non-regex version because SAFARI IS THE WORST :-O
  let offset = 0
  const patterns: string[] = []
  let allFilters: any[] = []

  while (expr.indexOf('{', offset) > -1) {
    offset = 1 + expr.indexOf('{', offset)
    const element = expr.substring(offset, expr.indexOf('}', offset))
    patterns.push(element)
    allFilters.push([])
  }

  const filterTypes = ['<=', '>=', '==', '!=', '<', '>']

  for (let i = 0; i < patterns.length; i++) {
    let patternElement = patterns[i]
    if (patternElement.includes(',')) {
      const filterList = patternElement.split(',')
      for (const currentFilter of filterList) {
        for (const comparison of filterTypes) {
          const offset = currentFilter.indexOf(comparison)
          if (offset > -1) {
            const left = currentFilter.substring(0, offset)
            const right = currentFilter.substring(offset + comparison.length)
            const comp = currentFilter.substring(offset, offset + comparison.length)

            allFilters[i].push({
              key: left.trim(),
              value: right.replaceAll(')', '').trim(),
              mode: filterTypes.indexOf(comparison),
              file: left.split('.')[0].trim(),
              element: left.split('.')[1].trim(),
              exp: (left + comp + right).replaceAll(')', ''),
            })
            break
          }
        }
      }
      if (patternElement[0] == '@') {
        patterns[i] = patternElement.split(',')[0] + ')'
      } else {
        patterns[i] = patternElement.split(',')[0].replaceAll('(', '')
      }
    }
  }

  // no vars? just return the string
  if (!patterns.length) return expr

  // for each {variable}, do a lookup and replace
  for (let p of patterns) {
    // e.g. sum, count
    const pIndex = patterns.indexOf(p)
    let calculationType = ''
    let calculationPrefix = ''

    // special functions start with '@': @sum, @count, @etc
    if (p[0] == '@') {
      const pSplitted = p.split(/[()@]+/)
      p = pSplitted[2]
      calculationType = pSplitted[1]
      calculationPrefix = '@'
    }

    if (validFunctions.indexOf(calculationType) == -1) {
      postMessage({
        response: 'error',
        message: `${calc}: no such function @${calculationType}`,
      })
      return '???'
    }

    const pattern = p.split('.') // ${file.variable} --> ['file','variable']
    let element = _fileData[pattern[0]] as any[]

    let lookup
    let filterString = ''
    let filteredRows

    if (!Array.isArray(element)) {
      element = [element]
    }

    switch (calculationType) {
      case 'min':
        for (const row of element.filter(f => filterElements(f, allFilters[pIndex]))) {
          if (lookup > row[pattern[1]] || lookup == undefined) {
            lookup = row[pattern[1]]
          }
        }
        break
      case 'max':
        for (const row of element.filter(f => filterElements(f, allFilters[pIndex]))) {
          if (lookup < row[pattern[1]] || lookup == undefined) {
            lookup = row[pattern[1]]
          }
        }
        break
      case 'mean':
        lookup = 0
        let count = 0
        for (const row of element.filter(f => filterElements(f, allFilters[pIndex]))) {
          count++
          lookup = lookup + row[pattern[1]]
        }
        if (count != 0) {
          lookup = lookup / count
        }
        break
      case 'first':
        filteredRows = element.filter(f => filterElements(f, allFilters[pIndex]))
        if (filteredRows.length) lookup = filteredRows[0][pattern[1]]
        break
      case 'last':
        filteredRows = element.filter(f => filterElements(f, allFilters[pIndex]))
        if (filteredRows.length) lookup = filteredRows[filteredRows.length - 1][pattern[1]]
        break
      case 'sum':
        lookup = 0
        for (const row of element.filter(f => filterElements(f, allFilters[pIndex]))) {
          lookup = lookup + row[pattern[1]]
        }
        break
      case 'count':
        lookup = element.filter(f => filterElements(f, allFilters[pIndex])).length
        break
      default:
        lookup = 0
        for (const row of element.filter(f => filterElements(f, allFilters[pIndex]))) {
          lookup = lookup + row[pattern[1]]
        }
        break
    }

    for (let filter of allFilters[pIndex]) {
      filterString = `${filterString},${filter.exp}`
    }

    // (drtVehicles.t_1) -> drtVehicles.t_1
    expr = expr.replaceAll(
      `${calculationType}(${pattern[0]}.${pattern[1]}${filterString})`,
      `${pattern[0]}.${pattern[1]}`
    )

    expr = expr.replaceAll(`{${calculationPrefix}${pattern[0]}.${pattern[1]}}`, `${lookup}`)
  }
  return expr
}

function filterElements(row: any, filterElements: any[]) {
  let allResults = []
  for (let i = 0; i < filterElements.length; i++) {
    switch (filterElements[i].mode) {
      case -1:
        allResults.push(true)
        break
      case 0:
        allResults.push(nerdamer(row[filterElements[i].element]).lte(filterElements[i].value))
        break
      case 1:
        allResults.push(nerdamer(row[filterElements[i].element]).gte(filterElements[i].value))
        break
      case 2:
        allResults.push(nerdamer(row[filterElements[i].element]).eq(filterElements[i].value))
        break
      case 3:
        allResults.push(!nerdamer(row[filterElements[i].element]).eq(filterElements[i].value))
        break
      case 4:
        allResults.push(nerdamer(row[filterElements[i].element]).lt(filterElements[i].value))
        break
      case 5:
        allResults.push(nerdamer(row[filterElements[i].element]).gt(filterElements[i].value))
        break
      default:
        allResults.push(false)
        break
    }
  }
  return !allResults.includes(false)
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
  let filename = ''
  for (const inputFile of Object.keys(_yaml.files)) {
    try {
      // figure out which file to load
      const pattern = _yaml.files[inputFile].file
      let matchingFiles = findMatchingGlobInFiles(_files, pattern)

      if (matchingFiles.length == 0) {
        // not in this folder. Maybe we have a path
        const slash = pattern.indexOf('/')
        if (slash > -1) {
          const mergedFolder = slash === 0 ? pattern : `${_subfolder}/${pattern}`
          const dataset = mergedFolder.substring(1 + mergedFolder.lastIndexOf('/'))
          _subfolder = mergedFolder.substring(0, mergedFolder.lastIndexOf('/'))
          // fetch new list of files
          const { files } = await _fileSystem.getDirectory(_subfolder)
          _files = files
          matchingFiles = findMatchingGlobInFiles(_files, dataset)
        } else {
          console.warn(`No files in THIS FOLDER matched pattern ${pattern}`)
          console.warn('Assuming filename is hardcoded.')
          matchingFiles = [pattern]
        }
      } else if (matchingFiles.length > 1) {
        throw Error(`More than one file matched pattern ${pattern}: ${matchingFiles}`)
      }

      filename = matchingFiles[0] || pattern

      // load the file
      const text = await loadFileOrGzipFile(filename)

      // handle the various filetypes: csv, xml...
      await parseVariousFileTypes(inputFile, filename, text)
    } catch (e) {
      console.error(e)
      postMessage({ response: 'error', message: `${inputFile}: Error loading "${filename}"` })
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
