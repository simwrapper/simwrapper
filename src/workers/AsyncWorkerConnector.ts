import {
  AsyncResult,
  TYPE_ERROR,
  AsyncError,
  TYPE_RESULT,
  AsyncMethodResult,
} from './AsyncBackgroundWorker'

interface ResolveReject {
  resolve: (value: any) => any
  reject: (reason: string) => void
}

export default class AsyncWorkerConnector {
  private readonly worker: Worker
  private readonly promises = new Map<string, ResolveReject>()
  private handleMessageDelegate: EventListener

  constructor(worker: Worker) {
    this.worker = worker

    this.handleMessageDelegate = (e: any) => this.handleWorkerMessage(e as MessageEvent)
    this.worker.addEventListener('message', this.handleMessageDelegate)
  }

  public destroy() {
    if (this.worker) {
      this.worker.removeEventListener('message', this.handleMessageDelegate)
      this.worker.terminate()
    }
  }

  public async postAsyncWorkerMessage<T>(
    methodName: string,
    data: any,
    transferrables?: Transferable[]
  ) {
    const message = {
      call: {
        method: methodName,
        parameters: data,
      },
      id: this.generatePromiseId(),
    }

    if (transferrables) this.worker.postMessage(message, transferrables)
    else this.worker.postMessage(message, [])

    return new Promise<T>((resolve, reject) => {
      this.promises.set(message.id, { resolve, reject })
    })
  }

  private handleWorkerMessage(e: MessageEvent) {
    const then = Date.now()
    const message = e.data as AsyncResult

    switch (message.type) {
      case TYPE_ERROR:
        this.handleError(message as AsyncError)
        break
      case TYPE_RESULT:
        this.handleEvent(message as AsyncMethodResult)
        break
      default:
        console.error('unknown message type: ' + message.type)
    }
  }

  private handleError(message: AsyncError) {
    console.error('Error in Worker: ' + message.error)
    if (this.promises.has(message.id)) {
      this.promises.get(message.id)!.reject(message.error)
      this.promises.delete(message.id)
    }
  }

  private handleEvent(message: AsyncMethodResult) {
    if (this.promises.has(message.id)) {
      this.promises.get(message.id)!.resolve(message.result)
      this.promises.delete(message.id)
    }
  }

  private generatePromiseId() {
    const values = new Uint32Array(8)
    crypto.getRandomValues(values)
    // Developed by stackoverflow https://stackoverflow.com/a/50192275/9945451
    return values.reduce((output, value) => output + ('0' + value.toString(16)).slice(-2), '')
  }
}
