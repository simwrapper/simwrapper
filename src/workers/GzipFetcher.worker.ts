// --- WORKER PREAMBLE ---------------------------------------
// This lets typescript know we are in a worker, not a window
const ctx: Worker = self as any
// make the typescript compiler happy on import
export default null as any
// -----------------------------------------------------------

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import { gUnzip, findMatchingGlobInFiles } from '@/js/util'

onmessage = ({ data: { filePath, fileSystem } }: MessageEvent) => {
  fetchGzip(filePath, fileSystem).then((result: any) => {
    // transferable zero-copy!
    if (result.buffer) ctx.postMessage(result, [result.buffer])
    else ctx.postMessage(result, [result])
  })
}

async function fetchGzip(filepath: string, fileSystem: FileSystemConfig) {
  const httpFileSystem = new HTTPFileSystem(fileSystem)

  // figure out which file to load with *? wildcards
  let expandedFilename = filepath
  try {
    if (filepath.indexOf('*') > -1 || filepath.indexOf('?') > -1) {
      const zDataset = filepath.substring(1 + filepath.lastIndexOf('/'))
      const zSubfolder = filepath.substring(0, filepath.lastIndexOf('/'))

      // fetch list of files in this folder
      const { files } = await httpFileSystem.getDirectory(zSubfolder)
      const matchingFiles = findMatchingGlobInFiles(files, zDataset)
      if (matchingFiles.length == 0) throw Error(`No files matched "${zDataset}"`)
      if (matchingFiles.length > 1)
        throw Error(`More than one file matched "${zDataset}": ${matchingFiles}`)
      expandedFilename = `${zSubfolder}/${matchingFiles[0]}`
    }

    const blob = await httpFileSystem.getFileBlob(expandedFilename)
    if (!blob) throw Error('BLOB IS NULL')

    const buffer = await blob.arrayBuffer()
    const cargo = await gUnzip(buffer)

    return cargo
  } catch (e) {
    ctx.postMessage({ error: 'Error loading ' + expandedFilename })
  }
}
