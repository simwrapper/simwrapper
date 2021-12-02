export interface MethodCall {
  method: string
  parameters: any
}

export interface AsyncMessage {
  id: string
}

export interface AsyncResult extends AsyncMessage {
  type: string
}

export interface AsyncMethodCall extends AsyncMessage {
  call: MethodCall
}

export interface MethodResult {
  data: any
  transferrables: Transferable[]
}

export interface AsyncMethodResult extends AsyncResult {
  result: MethodResult
}

export interface AsyncError extends AsyncResult {
  error: any
}
export const INITIALIZE = 'initialize'
export const TYPE_ERROR = 'error'
export const TYPE_RESULT = 'result'

/*  make sure typescript compiler knows that the global context is a worker context.
    also see: https://github.com/Microsoft/TypeScript/issues/582
    and: https://github.com/Microsoft/TypeScript/issues/20595
*/
const workerContext: Worker = self as any

export default abstract class AsyncBackgroundWorker {
  private handleMessageDelegate: EventListener
  private isInitialized = false

  constructor() {
    this.handleMessageDelegate = (e: any) => this.handleMessage(e as MessageEvent)
    addEventListener('message', this.handleMessageDelegate)
  }

  public abstract handleInitialize(call: MethodCall): void
  public abstract handleMethodCall(call: MethodCall): Promise<MethodResult>

  private async handleMessage(e: MessageEvent): Promise<void> {
    const message = e.data as AsyncMethodCall

    if (!this.isValidMessage(message)) console.error('invalid message')

    if (message.call.method === INITIALIZE) {
      this.handleInitialize(message.call)
      this.postResult(message.id, { data: {}, transferrables: [] })
      this.isInitialized = true
      return
    }

    if (!this.isInitialized) {
      this.postError(message.id, 'worker was not initialized')
      return
    }

    try {
      const result = await this.handleMethodCall(message.call)
      this.postResult(message.id, result)
    } catch (error) {
      const e = error as any
      this.postError(message.id, e.message)
    }
  }

  private postResult(id: string, methodResult: MethodResult) {
    const asyncResult: AsyncMethodResult = {
      id: id,
      type: TYPE_RESULT,
      result: methodResult.data,
    }
    workerContext.postMessage(asyncResult, methodResult.transferrables)
  }

  private postError(id: string, error: any) {
    const asyncError: AsyncError = {
      id: id,
      type: TYPE_ERROR,
      error: error,
    }
    workerContext.postMessage(asyncError)
  }

  private isValidMessage(message?: AsyncMethodCall) {
    return message && message.call && message.call.method && message.call.parameters && message.id
  }
}
