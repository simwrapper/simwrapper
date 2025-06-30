import AsyncBackgroundWorker, { MethodCall, MethodResult } from '@/workers/AsyncBackgroundWorker'
import { InitParams, MethodNames } from './XmlFetcherContract'

import { gUnzip, parseXML } from '@/js/util'

import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

class XmlFetcher extends AsyncBackgroundWorker {
  private params!: InitParams

  public handleInitialize(call: MethodCall) {
    this.params = call.parameters as InitParams
  }

  public async handleMethodCall(call: MethodCall): Promise<MethodResult> {
    switch (call.method) {
      case MethodNames.FetchXML:
        return this.fetchXml()
      default:
        throw new Error('No method with name ' + call.method)
    }
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = []
    // const svnProject: FileSystemConfig[] = this.state.svnProjects.filter(
    //   (a: FileSystemConfig) => a.slug === name
    // )
    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }
    return svnProject[0]
  }

  private async fetchXml() {
    const fileSystem = this.getFileSystem(this.params.fileApi)
    const httpFileSystem = new HTTPFileSystem(fileSystem)

    const blob = await httpFileSystem.getFileBlob(this.params.filePath)
    if (!blob) throw Error('BLOB IS NULL')

    const data = await this.getDataFromBlob(blob)
    const xml = parseXML(data, {
      alwaysArray: [],
    })

    return { data: xml, transferrables: [] }
  }

  private async getDataFromBlob(blob: Blob) {
    const data = await blob.arrayBuffer()
    const cargo = await gUnzip(data)

    const text = new TextDecoder('utf-8').decode(cargo)
    return text
  }
}

// make the typescript compiler happy on import
export default null as any
