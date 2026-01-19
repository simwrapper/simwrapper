import maplibregl from 'maplibre-gl'

// Fixed id so we can find/remove/update the layer.
export const THREE_D_BUILDINGS_LAYER_ID = 'simwrapper-3d-buildings'

// Hard-coded defaults.
const BUILDINGS_SOURCE_LAYER = 'building'
const DEFAULT_MIN_ZOOM = 14
const DEFAULT_OPACITY = 0.85

// building colors for light and dark mode
const LIGHT_COLOR = '#e6e6e6'
const DARK_COLOR = '#2c2c2c'

// Key to track if a retry is already scheduled on the map object.
// (see scheduleRetry())
const RETRY_PENDING_KEY = '__simwrapper3dBuildingsRetryPending'

/**
 * This method checks for known building source IDs in the map style.
 * @param map maplibregl.Map
 * @returns The source ID if found, otherwise undefined.
 */
function getBuildingsSourceId(map: maplibregl.Map): string | undefined {
  if (map.getSource('openmaptiles')) return 'openmaptiles'
  if (map.getSource('openfreemap')) return 'openfreemap'
  return undefined
}

/**
 * This method checks if the map style is a dark style based on the background color.
 * @param map maplibregl.Map
 * @returns True if the style is dark, otherwise false.
 */
function isDarkStyle(map: maplibregl.Map): boolean {
  const layers = map.getStyle()?.layers || []
  const backgroundLayer = layers.find(l => l.type === 'background') as any
  const color = backgroundLayer?.paint?.['background-color']

  // The current `dark.json` uses an rgb background.
  // the current `positron.json` uses a hex background.
  return typeof color === 'string' && color.startsWith('rgb(')
}

/**
 * This method returns the paint properties for the 3D buildings layer based on the map style.
 * @param map maplibregl.Map
 * @returns The paint properties object.
 */
function getPaint(map: maplibregl.Map) {
  // Keep heights stable across different zoom levels.
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

/**
 * This method schedules a retry to enable 3D buildings after the style is loaded.
 * This is important because the style may not be fully loaded when this is first called.
 * @param map maplibregl.Map
 * @returns void
 */
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

export function enable3DBuildings(m: any) {
  const map = m as maplibregl.Map
  if (!map?.getStyle?.()) return

  // wait untilr the style is fully loaded
  const style = map.getStyle()
  if (!style?.layers?.length) {
    scheduleRetry(map)
    return
  }

  // If the layer already exists, refresh paint for the current style
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

  // sets the source ID for the buildings layer
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

/**
 * This method disables/removes the 3D buildings layer from the map.
 * @param map maplibregl.Map
 * @returns void
 */
export function disable3DBuildings(m: any) {
  const map = m as maplibregl.Map
  if (!map?.getLayer?.(THREE_D_BUILDINGS_LAYER_ID)) return
  try {
    map.removeLayer(THREE_D_BUILDINGS_LAYER_ID)
  } catch {}
}
