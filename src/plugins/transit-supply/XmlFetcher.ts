import AsyncWorkerConnector from '@/visualization/frame-animation/modell/background/AsyncWorkerConnector'
import BackgroundWorker from '@/visualization/transit-supply/XmlFetcher.worker'
import { InitParams, MethodNames } from '@/visualization/transit-supply/XmlFetcherContract'
import { INITIALIZE } from '@/visualization/frame-animation/modell/background/AsyncBackgroundWorker'

export default class XmlFetcher extends AsyncWorkerConnector {
  constructor() {
    super(new BackgroundWorker())
  }

  public static async create(params: InitParams) {
    console.log('<< WORKER __ Create called!')
    const fetcher = new XmlFetcher()
    await fetcher.initialize(params)
    return fetcher
  }

  public async fetchXML() {
    return this.postAsyncWorkerMessage(MethodNames.FetchXML, {}) // no data, everything is in init
  }

  private async initialize(params: InitParams) {
    await this.postAsyncWorkerMessage(INITIALIZE, params)
  }
}
