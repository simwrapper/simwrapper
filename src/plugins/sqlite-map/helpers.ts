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

export async function loadDbWithCache(spl: any, fileApi: any, openDb: OpenDbFn, path: string) {
  const blob = await fileApi.getFileBlob(path)
  return openDb(spl, await blob.arrayBuffer(), path)
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
      const blob = await fileApi.getFileBlob(path)
      return openDb(spl, await blob.arrayBuffer(), path)
    } catch (e) {
      console.warn(`Failed to load database '${dbName}':`, e)
      return null
    }
  }
}
