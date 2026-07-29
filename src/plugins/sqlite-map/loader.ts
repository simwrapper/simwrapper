// Ensures only one map loads at a time to prevent memory exhaustion when loading many maps
// simultaneously. Also manages the shared SPL (SpatiaLite) engine instance, which is ~100MB+ in
// memory. We are caching the database reads and geo-json extraction to not (a) repeatedly download
// the same DB files and (b) not spike the memory usage.

import SPL from 'spl.js'
import type { SPL as SPLType } from './types'
import { clearAllDbCaches } from './db'

let loadingQueue: Promise<void> = Promise.resolve()

export function acquireLoadingSlot(): Promise<() => void> {
  let releaseSlot: () => void
  const myTurn = loadingQueue.then()
  loadingQueue = new Promise<void>(resolve => {
    releaseSlot = resolve
  })
  return myTurn.then(() => releaseSlot!)
}

let sharedSpl: SPLType | null = null
let splInitPromise: Promise<SPLType> | null = null
let splRefCount = 0

export async function initSpl(): Promise<SPLType> {
  splRefCount++

  if (sharedSpl) {
    return sharedSpl
  }

  if (splInitPromise) {
    return splInitPromise
  }

  // initialize the shared SPL engine
  splInitPromise = SPL().then((spl: SPLType) => {
    sharedSpl = spl
    splInitPromise = null
    return spl
  })

  return splInitPromise!
}

export function releaseSpl(): void {
  // decrement the refcount (never negative)
  splRefCount = Math.max(0, splRefCount - 1)

  // when the last user releases SPL, perform a full cleanup: clear DB/blob caches
  // and terminate the underlying SPL/worker runtime if supported. This prevents
  // stale WASM/Worker instances from accumulating across dashboard switches.
  if (splRefCount === 0) {
    clearAllDbCaches()

    try {
      if (sharedSpl && typeof (sharedSpl as any).terminate === 'function') {
        ;(sharedSpl as any).terminate()
      }
    } catch (e) {
      console.warn('Failed to terminate SPL worker:', e)
    }

    sharedSpl = null
    splInitPromise = null
  }
}
