// --- WORKER PREAMBLE ---------------------------------------
// This lets typescript know we are in a worker, not a window
const ctx: Worker = self as any
// make the typescript compiler happy on import
export default null as any
// -----------------------------------------------------------

import readBlob from 'read-blob'
import pako from 'pako'

import HTTPFileSystem from '@/util/HTTPFileSystem'

onmessage = ({ data: { filePath, fileSystem } }: MessageEvent) => {
  fetchGzip(filePath, fileSystem).then(r => {
    ctx.postMessage({ answer: r })
  })
}

async function fetchGzip(filePath: string, fileSystem: any) {
  const httpFileSystem = new HTTPFileSystem(fileSystem)

  const blob = await httpFileSystem.getFileBlob(filePath)
  if (!blob) throw Error('BLOB IS NULL')
  const buffer = await readBlob.arraybuffer(blob)

  const data = gUnzip(buffer)

  return { data, transferrables: [] }
}

function gUnzip(buffer: any): any {
  const decoder = new TextDecoder('utf-8')

  // GZIP always starts with a magic number, hex 1f8b
  const header = new Uint8Array(buffer.slice(0, 2))
  if (header[0] === 31 && header[1] === 139) {
    console.log('Need to gUnzip!')
    return gUnzip(pako.inflate(buffer))
  }

  return buffer
}
