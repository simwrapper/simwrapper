import { markRaw } from 'vue'
import { buildStyleArrays } from './styling/styling'
import type { SqliteDb, VizDetails } from './types'

type OpenDbFn = (spl: any, buf: ArrayBuffer, path?: string) => Promise<SqliteDb>

export function applyStylesToVm(
  vm: any,
  features: any[],
  vizDetails: VizDetails,
  layerConfigs: any
) {
  vm.geoJsonFeatures = markRaw(features)
  const styles = buildStyleArrays({
    features: vm.geoJsonFeatures,
    layers: layerConfigs,
    defaults: vizDetails.defaults,
  })
  Object.assign(vm, styles, { isRGBA: true, redrawCounter: (vm.redrawCounter ?? 0) + 1 })
}

export function releaseMainDbFromVm(vm: any) {
  vm.db = null
  vm.tables = []
}

// Cache for blob fetching to avoid downloading the same file multiple times
const blobCache = new Map<string, Promise<ArrayBuffer>>()

export function clearBlobCache(): void {
  blobCache.clear()
}

export async function loadDbWithCache(spl: any, fileApi: any, openDb: OpenDbFn, path: string) {
  // Check if we're already downloading or have downloaded this file
  let arrayBufferPromise = blobCache.get(path)
  
  if (!arrayBufferPromise) {
    // Start the download and cache the promise
    arrayBufferPromise = fileApi.getFileBlob(path).then((blob: Blob) => blob.arrayBuffer()) as Promise<ArrayBuffer>
    blobCache.set(path, arrayBufferPromise)
  }
  
  const arrayBuffer = await arrayBufferPromise
  return openDb(spl, arrayBuffer, path)
}

export function createLazyDbLoader(
  spl: any,
  fileApi: any,
  openDb: OpenDbFn,
  extraDbPaths: Record<string, string>,
  onLoadingText?: (msg: string) => void
) {
  return async (dbName: string) => {
    const path = extraDbPaths[dbName]
    if (!path) return null
    try {
      onLoadingText?.(`Loading ${dbName}...`)
      
      // Use the same caching mechanism as loadDbWithCache
      let arrayBufferPromise = blobCache.get(path)
      
      if (!arrayBufferPromise) {
        arrayBufferPromise = fileApi.getFileBlob(path).then((blob: Blob) => blob.arrayBuffer()) as Promise<ArrayBuffer>
        blobCache.set(path, arrayBufferPromise)
      }
      
      const arrayBuffer = await arrayBufferPromise
      return openDb(spl, arrayBuffer, path)
    } catch (e) {
      console.warn(`Failed to load database '${dbName}':`, e)
      return null
    }
  }
}
