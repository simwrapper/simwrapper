/**
 * Transit viewer worker: fetches, decompresses and parses the transit schedule and the
 * demand CSV, and does all the heavy processing (see transitProcessing.ts).
 *
 * Big results go back as transferred typed arrays, so the main thread never has to
 * deserialize large object graphs. The worker keeps the compact demand rows so it can
 * answer per-link demand queries later; the component terminates it on unmount.
 */
import * as Comlink from 'comlink'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import { findMatchingGlobInFiles, gUnzip, parseXML } from '@/js/util'
import type {
  ColorRule,
  DemandResult,
  NetworkColumns,
  RouteDemand,
  SupplyResult,
} from './Interfaces'
import {
  buildSupply,
  DemandAccumulator,
  parseDemandCsv,
  scheduleProjection,
  SCHEDULE_XML_OPTIONS,
  transferables,
} from './transitProcessing'

type StatusCallback = (message: string) => void

let _xml: any = null
let _supply: { linkIds: string[]; stopIds: string[] } | null = null
let _demand: DemandAccumulator | null = null

/** fetch + decompress, expanding *? wildcards in the filename */
async function fetchFile(fileSystem: FileSystemConfig, filepath: string): Promise<Uint8Array> {
  const httpFileSystem = new HTTPFileSystem(fileSystem)

  let expandedFilename = filepath
  try {
    if (filepath.indexOf('*') > -1 || filepath.indexOf('?') > -1) {
      const zDataset = filepath.substring(1 + filepath.lastIndexOf('/'))
      const zSubfolder = filepath.substring(0, filepath.lastIndexOf('/'))

      const { files } = await httpFileSystem.getDirectory(zSubfolder)
      const matchingFiles = findMatchingGlobInFiles(files, zDataset)
      if (matchingFiles.length == 0) throw Error(`No files matched "${zDataset}"`)
      if (matchingFiles.length > 1)
        throw Error(`More than one file matched "${zDataset}": ${matchingFiles}`)
      expandedFilename = `${zSubfolder}/${matchingFiles[0]}`
    }

    const blob = await httpFileSystem.getFileBlob(expandedFilename)
    if (!blob) throw Error('BLOB IS NULL')
    const cargo: any = await gUnzip(await blob.arrayBuffer())
    return cargo instanceof Uint8Array ? cargo : new Uint8Array(cargo)
  } catch (e) {
    console.error(e)
    throw Error('Error loading ' + expandedFilename)
  }
}

const TransitTask = {
  /** fetch + parse the schedule; runs while the main thread is still loading the network */
  async loadSchedule(props: { fileSystem: FileSystemConfig; schedulePath: string }) {
    _xml = null
    _supply = null
    _demand = null
    const bytes = await fetchFile(props.fileSystem, props.schedulePath)
    _xml = await parseXML(new TextDecoder('utf-8').decode(bytes), SCHEDULE_XML_OPTIONS)
  },

  async buildSupply(
    props: {
      network: NetworkColumns
      forcedProjection?: string
      fallbackProjection: string
      colorRules: ColorRule[]
    },
    onStatus?: StatusCallback
  ): Promise<SupplyResult> {
    if (!_xml) throw Error('buildSupply() needs loadSchedule() first')
    const status = (msg: string) => onStatus && onStatus(msg)

    const projection = scheduleProjection(_xml, props.forcedProjection, props.fallbackProjection)
    console.log('Transit schedule using', projection)

    const result = buildSupply({
      xml: _xml,
      network: props.network,
      projection,
      colorRules: props.colorRules,
      onStatus: status,
    })

    // the parsed XML tree is big; drop it now
    _xml = null
    _supply = { linkIds: result.linkIds, stopIds: result.stops.map(s => s.id) }

    return Comlink.transfer(result, transferables(result))
  },

  async loadDemand(
    props: { fileSystem: FileSystemConfig; path: string },
    onStatus?: StatusCallback
  ): Promise<DemandResult> {
    if (!_supply) throw Error('loadDemand() needs buildSupply() first')
    const status = (msg: string) => onStatus && onStatus(msg)

    status('Loading demand...')
    const bytes = await fetchFile(props.fileSystem, props.path)

    status('Processing demand...')
    const acc = new DemandAccumulator()
    parseDemandCsv(bytes, acc)

    status('Summarizing demand data...')
    const result = acc.finish(_supply.linkIds, _supply.stopIds)
    _demand = acc
    console.log(`transit demand: ${acc.rowCount} rows`)

    return Comlink.transfer(result, transferables(result))
  },

  /** per-route pax/cap of the demand rows on this link ('' = all rows) */
  routeDemandForLink(linkId: string): RouteDemand | null {
    if (!_demand) return null
    const result = _demand.routeDemandForLink(linkId)
    // the '' result is cached here, so copy rather than transfer it
    return linkId ? Comlink.transfer(result, transferables(result)) : result
  },
}

export type TransitTaskApi = typeof TransitTask

Comlink.expose(TransitTask)
