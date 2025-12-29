import maplibregl from 'maplibre-gl'

/**
 * Simple 3D buildings helper for MapLibre.
 *
 * What this does:
 * - Adds one `fill-extrusion` layer for buildings.
 * - Uses fixed defaults (no options).
 *
 * Assumptions:
 * - The style already has a vector source called `openmaptiles` or `openfreemap`.
 * - The buildings data is in the source layer `building`.
 * - Height fields are `render_height` and `render_min_height`.
 *
 * Notes:
 * - Styles load async. If the style is not ready, we wait for `style.load` and try again once.
 * - When you switch styles (dark/light), the custom layer is removed by MapLibre.
 *   The caller should call `enable3DBuildings(map)` again after `setStyle()`.
 */

// Fixed id so we can find/remove/update the layer.
export const THREE_D_BUILDINGS_LAYER_ID = 'simwrapper-3d-buildings'

// Hard-coded defaults.
const BUILDINGS_SOURCE_LAYER = 'building'
const DEFAULT_MIN_ZOOM = 14
const DEFAULT_OPACITY = 0.85

// Only two colors: one for light mode and one for dark mode.
const LIGHT_COLOR = '#e6e6e6'
const DARK_COLOR = '#2c2c2c'

// We store a flag on the map object so we do not attach multiple listeners.
const RETRY_PENDING_KEY = '__simwrapper3dBuildingsRetryPending'

function getBuildingsSourceId(map: maplibregl.Map): string | undefined {
  if (map.getSource('openmaptiles')) return 'openmaptiles'
  if (map.getSource('openfreemap')) return 'openfreemap'
  return undefined
}

function isDarkStyle(map: maplibregl.Map): boolean {
  const layers = map.getStyle()?.layers || []
  const backgroundLayer = layers.find(l => l.type === 'background') as any
  const color = backgroundLayer?.paint?.['background-color']

  // Our current `dark.json` uses an rgb(...) background.
  // Our current `positron.json` uses a hex background.
  return typeof color === 'string' && color.startsWith('rgb(')
}

function getPaint(map: maplibregl.Map) {
  // Keep heights stable across zoom. Visibility is controlled by `minzoom` on the layer.
  const heightValue = ['to-number', ['get', 'render_height'], 0]
  const baseValue = ['to-number', ['get', 'render_min_height'], 0]
  const color = isDarkStyle(map) ? DARK_COLOR : LIGHT_COLOR

  return {
    'fill-extrusion-color': color,
    'fill-extrusion-height': heightValue,
    'fill-extrusion-base': baseValue,
    'fill-extrusion-opacity': DEFAULT_OPACITY,
  } as any
}

function scheduleRetry(map: maplibregl.Map) {
  const anyMap = map as any
  if (anyMap[RETRY_PENDING_KEY]) return
  anyMap[RETRY_PENDING_KEY] = true

  if (typeof map.once !== 'function') return

  const retry = () => {
    anyMap[RETRY_PENDING_KEY] = false
    enable3DBuildings(map)
  }
  map.once('style.load', retry)
}

export function enable3DBuildings(map: maplibregl.Map) {
  if (!map?.getStyle?.()) return

  // Wait until the style is loaded enough to have layers.
  const style = map.getStyle()
  if (!style?.layers?.length) {
    scheduleRetry(map)
    return
  }

  // If the layer already exists, refresh paint for the current style (light/dark).
  const existingLayer = map.getLayer(THREE_D_BUILDINGS_LAYER_ID)
  if (existingLayer) {
    const paint = getPaint(map)
    map.setPaintProperty(
      THREE_D_BUILDINGS_LAYER_ID,
      'fill-extrusion-color',
      paint['fill-extrusion-color']
    )
    map.setPaintProperty(
      THREE_D_BUILDINGS_LAYER_ID,
      'fill-extrusion-opacity',
      paint['fill-extrusion-opacity']
    )
    return
  }

  // We need a buildings source in the style.
  const sourceId = getBuildingsSourceId(map)
  if (!sourceId) {
    scheduleRetry(map)
    return
  }

  // Add the 3D buildings layer.
  map.addLayer({
    id: THREE_D_BUILDINGS_LAYER_ID,
    source: sourceId,
    'source-layer': BUILDINGS_SOURCE_LAYER,
    type: 'fill-extrusion',
    minzoom: DEFAULT_MIN_ZOOM,
    paint: getPaint(map),
  } as any)
}

export function disable3DBuildings(map: maplibregl.Map) {
  if (!map?.getLayer?.(THREE_D_BUILDINGS_LAYER_ID)) return
  try {
    map.removeLayer(THREE_D_BUILDINGS_LAYER_ID)
  } catch {}
}
