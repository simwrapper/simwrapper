// Keep Vuex viewState camera fields consistent.
//
// Problem: some map components commit only `center: [lng, lat]` without
// `longitude/latitude`. Other parts of the app compare longitude/latitude and
// may respond by repeatedly "correcting" the camera, creating a tight
// feedback loop (and escalating memory/CPU usage).
//
// Constraint: we avoid changing the global store; instead we normalize the
// incoming mutation payload via a scoped Vuex subscription that can be enabled
// by plugins.

type ViewState = {
  longitude?: number
  latitude?: number
  center?: any
  zoom?: number
  bearing?: number
  pitch?: number
  jump?: boolean
  initial?: boolean
  startup?: boolean
  [k: string]: any
}

function asFiniteNumber(v: any): number | undefined {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : undefined
}

function extractCenter(center: any): [number, number] | undefined {
  const c: any = center
  if (Array.isArray(c) && c.length >= 2) {
    const lon = asFiniteNumber(c[0])
    const lat = asFiniteNumber(c[1])
    if (lon === undefined || lat === undefined) return undefined
    return [lon, lat]
  }
  if (c && typeof c === 'object') {
    const lon = asFiniteNumber(c.lng ?? c.lon ?? c.longitude)
    const lat = asFiniteNumber(c.lat ?? c.latitude)
    if (lon === undefined || lat === undefined) return undefined
    return [lon, lat]
  }
  return undefined
}

function buildLonLatPatch(payload: ViewState): { longitude: number; latitude: number } | null {
  if (!payload) return null

  const lon = asFiniteNumber(payload.longitude)
  const lat = asFiniteNumber(payload.latitude)
  if (lon !== undefined && lat !== undefined) return null

  const center = extractCenter(payload.center)
  if (!center) return null

  const fixedLon = lon ?? center[0]
  const fixedLat = lat ?? center[1]
  return { longitude: fixedLon, latitude: fixedLat }
}

let users = 0
let unsubscribe: null | (() => void) = null
let isPatching = false

// DEPRECATED: viewstate-normalizer
// Plugins now emit both `center` and `longitude`/`latitude` so this file is a no-op kept
// for backward-compatibility only.

export function acquireViewStateNormalizer(_: any): () => void {
  return () => {}
}
