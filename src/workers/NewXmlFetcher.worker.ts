import { parseXML } from '@/js/util'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'
import { gUnzip, findMatchingGlobInFiles } from '@/js/util'

let _id = ''
let _resolvedFilename = ''

onmessage = async function (e) {
  _id = e.data.id
  const xml = await fetchXML(e.data.fileSystem, e.data.filePath, e.data.options)

  postMessage({ xml, id: _id, resolvedFilename: _resolvedFilename })
}

async function fetchXML(fileSystem: FileSystemConfig, filepath: string, options: any) {
  try {
    const httpFileSystem = new HTTPFileSystem(fileSystem)

    // figure out which file to load with *? wildcards
    let expandedFilename = filepath
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
      _resolvedFilename = expandedFilename
    }

    const blob = await httpFileSystem.getFileBlob(expandedFilename)
    if (!blob) throwError('BLOB IS NULL')

    const data = await getDataFromBlob(blob)
    const xml = parseXML(data, options)
    return xml
  } catch (e) {
    throwError('Error loading ' + filepath)
  }
}

async function getDataFromBlob(blob: Blob) {
  const data = await blob.arrayBuffer()
  const cargo = await gUnzip(data)

  const text = new TextDecoder('utf-8').decode(cargo)
  return text
}

function throwError(message: string) {
  postMessage({ error: message, id: _id })
  close()
}

// // make the typescript compiler happy on import
// export default null as any
