// --- WORKER PREAMBLE ---------------------------------------
// This lets typescript know we are in a worker, not a window
const ctx: Worker = self as any
// make the typescript compiler happy on import
export default null as any
// -----------------------------------------------------------

import pako from 'pako'

import HTTPFileSystem from '@/util/HTTPFileSystem'

onmessage = ({ data: { filePath, fileSystem } }: MessageEvent) => {
  fetchGzip(filePath, fileSystem).then(result => {
    ctx.postMessage(result, [result.buffer]) // transferable zero-copy!
  })
}

async function fetchGzip(filePath: string, fileSystem: any) {
  const httpFileSystem = new HTTPFileSystem(fileSystem)

  const blob = await httpFileSystem.getFileBlob(filePath)
  if (!blob) throw Error('BLOB IS NULL')

  const buffer = await blob.arrayBuffer()
  const cargo = gUnzip(buffer)

  return cargo
}

/**
 * This recursive function gunzips the buffer. It is recursive because
 * some combinations of subversion, nginx, and various user browsers
 * can single- or double-gzip .gz files on the wire. It's insane but true.
 */
function gUnzip(buffer: any): any {
  // GZIP always starts with a magic number, hex 1f8b
  const header = new Uint8Array(buffer.slice(0, 2))
  if (header[0] === 0x1f && header[1] === 0x8b) {
    return gUnzip(pako.inflate(buffer))
  }

  return buffer
}
