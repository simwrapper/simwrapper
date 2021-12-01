import AsyncWorkerConnector from './AsyncWorkerConnector'
import { INITIALIZE } from './AsyncBackgroundWorker'
import BackgroundWorker from './XmlFetcher.worker?worker'
import { InitParams, MethodNames } from './XmlFetcherContract'

export default class XmlFetcher extends AsyncWorkerConnector {
  constructor() {
    super(new BackgroundWorker())
  }

  public static async create(params: InitParams) {
    const fetcher = new XmlFetcher()
    await fetcher.initialize(params)
    return fetcher
  }

  public async fetchXML() {
    return this.postAsyncWorkerMessage(MethodNames.FetchXML, {})
    // no data, everything is in init
  }

  private async initialize(params: InitParams) {
    await this.postAsyncWorkerMessage(INITIALIZE, params)
  }
}
