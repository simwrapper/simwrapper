/**
 * Decodes an Avro network file off the main thread.
 *
 * Returns the same record DashboardDataManager used to build on the main thread: the
 * decoded network columns plus `source`/`dest` link-endpoint coordinates. Typed-array
 * buffers are transferred, not copied.
 */
import * as Comlink from 'comlink'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { getAvro } from '@/js/avro'
import type { FileSystemConfig } from '@/Globals'

async function loadNetwork(fileSystem: FileSystemConfig, path: string) {
  const blob = await new HTTPFileSystem(fileSystem).getFileBlob(path)
  const avro = await getAvro()

  const records: any[] = await new Promise((resolve, reject) => {
    const rows = [] as any[]
    avro
      .createBlobDecoder(blob)
      .on('data', (row: any) => rows.push(row))
      .on('error', (e: any) => reject(e))
      .on('end', () => resolve(rows))
  })

  const network = records[0]

  const numLinks = network.linkId.length
  const source = new Float32Array(2 * numLinks)
  const dest = new Float32Array(2 * numLinks)

  for (let i = 0; i < numLinks; i++) {
    const fromOffset = 2 * network.from[i]
    const toOffset = 2 * network.to[i]
    source[2 * i] = network.nodeCoordinates[fromOffset]
    source[2 * i + 1] = network.nodeCoordinates[1 + fromOffset]
    dest[2 * i] = network.nodeCoordinates[toOffset]
    dest[2 * i + 1] = network.nodeCoordinates[1 + toOffset]
  }

  network.source = source
  network.dest = dest

  // transfer every typed-array column; a buffer may back more than one view, so dedupe
  const buffers = new Set<ArrayBuffer>()
  for (const value of Object.values(network)) {
    if (ArrayBuffer.isView(value) && value.buffer instanceof ArrayBuffer) buffers.add(value.buffer)
  }

  return Comlink.transfer(network, [...buffers])
}

const AvroNetworkLoader = { loadNetwork }
export type AvroNetworkLoaderTask = typeof AvroNetworkLoader

Comlink.expose(AvroNetworkLoader)
