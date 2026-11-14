/** Default route color rules, shared by the transit worker and the component (legend). */
import { color as d3color } from 'd3-color'

import type { ColorRule } from './Interfaces'

export const DEFAULT_ROUTE_COLORS: ColorRule[] = [
  // ---------------------------------------------------
  // GTFS codes first, they are most accurate.
  { match: { gtfsRouteType: [3, 700, 701, 702, 703, 704] }, color: '#95276E', label: 'Bus (GTFS)' },
  { match: { gtfsRouteType: [109] }, color: '#408335', label: 'S-Bahn (GTFS)' },
  { match: { gtfsRouteType: [401, 402] }, color: '#115D91', label: 'U-Bahn (GTFS)' },
  {
    match: { gtfsRouteType: [0, 3, 900, 901, 902, 903, 904, 905, 906] },
    color: '#BE1414',
    label: 'Tram (GTFS)',
  },
  { match: { gtfsRouteType: [4, 1000, 1200] }, color: '#0480c1', label: 'Ferry (GTFS)' },
  // ---------------------------------------------------
  // MATSim transportMode and string-id next; less accurate but consistent.
  { match: { transportMode: ['rail', 'subway'], id: 'U*' }, color: '#115D91', label: 'U-Bahn' },
  { match: { transportMode: 'rail', id: 'S*' }, color: '#408335', label: 'S-Bahn' },
  { match: { transportMode: 'ferry' }, color: '#0480c1', label: 'Ferry' },
  { match: { transportMode: 'tram' }, color: '#9E1444', label: 'Tram' },
  { match: { transportMode: 'pt' }, color: '#05c', label: 'Public Transport' },
  { match: { transportMode: 'rail' }, color: '#EC0016 ', label: 'Train' },
  { match: { transportMode: 'train' }, color: '#0a0', label: 'Rail' },
  { match: { transportMode: 'bus' }, color: '#95276E', label: 'Bus' },
  { match: { id: '**' }, color: '#aae', label: 'Other' },
]

export function colorToRGB(colorString: string): number[] {
  try {
    const rgb = d3color(colorString) as any
    if (!rgb) return [0, 0, 0]
    return [rgb.r, rgb.g, rgb.b]
  } catch {
    return [0, 0, 0]
  }
}
