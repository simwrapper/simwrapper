import * as Comlink from 'comlink'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { FileSystemConfig } from '@/Globals'

import init, { XmlNetworkParser } from 'xml-network-parser'

const Task = {
  filename: '',
  fileApi: {} as HTTPFileSystem,
  fsConfig: null as FileSystemConfig | null,

  _cbReporter: null as any,
  _xmlParser: null as any,

  async parseXML(props: { path: string; fsConfig: FileSystemConfig }) {
    //    try {
    console.log('----starting xml parser')
    const { path, fsConfig } = props

    await init()
    this._xmlParser = new XmlNetworkParser()
    console.log('XML PARSER survived INIT')

    this.filename = path
    this.fsConfig = fsConfig
    this.fileApi = new HTTPFileSystem(fsConfig, globalStore)

    const blob = await this.fileApi.getFileBlob(path)
    if (!blob) throw Error('BLOB is null')
    const buffer = await blob.arrayBuffer()
    const u8 = new Uint8Array(buffer)

    console.log('buffer length', buffer.byteLength)
    const text: string = await this._xmlParser.process(u8)
    const json = JSON.parse(text)
    return json
    // } catch (e) {
    //   postMessage({ error: 'Error loading ' + this.filename })
    // }

    return []
  },
}
Comlink.expose(Task)
