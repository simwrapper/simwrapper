import AsyncBackgroundWorker, { MethodCall, MethodResult } from '@/workers/AsyncBackgroundWorker'
import { InitParams, MethodNames } from './XmlFetcherContract'

import pako from 'pako'
import xml2js from 'xml2js'

import globalStore from '@/store'
import HTTPFileSystem from '@/util/HTTPFileSystem'

class XmlFetcher extends AsyncBackgroundWorker {
  private params!: InitParams
  private state = globalStore.state

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
    const svnProject: any[] = this.state.svnProjects.filter((a: any) => a.url === name)
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
    const xml = await this.parseXML(data)

    return { data: xml, transferrables: [] }
  }

  private async getDataFromBlob(blob: Blob) {
    const data = await blob.arrayBuffer()
    const cargo = this.gUnzip(data)

    const text = new TextDecoder('utf-8').decode(cargo)
    return text
  }

  /**
   * This recursive function gunzips the buffer. It is recursive because
   * some combinations of subversion, nginx, and various user browsers
   * can single- or double-gzip .gz files on the wire. It's insane but true.
   */
  private gUnzip(buffer: any): any {
    // GZIP always starts with a magic number, hex 1f8b
    const header = new Uint8Array(buffer.slice(0, 2))
    if (header[0] === 31 && header[1] === 139) {
      return this.gUnzip(pako.inflate(buffer))
    }

    return buffer
  }

  private parseXML(xml: string): Promise<string> {
    const parser = new xml2js.Parser({ preserveChildrenOrder: true, strict: true })
    return new Promise((resolve, reject) => {
      parser.parseString(xml, function(err: Error, result: string) {
        if (err) {
          reject(err)
        } else {
          resolve(result)
        }
      })
    })
  }
}

// make the typescript compiler happy on import
export default null as any

// bootstrap when worker is loaded
const worker = new XmlFetcher()
