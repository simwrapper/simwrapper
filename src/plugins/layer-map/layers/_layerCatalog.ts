// EVERY map layer must be registered here:

import arcs from './ArcLayer'
import lines from './LinesLayer'
import points from './PointsLayer'
import polygons from './PolygonsLayer'

const layers = {
  arcs,
  lines,
  points,
  polygons,
} as { [layerType: string]: any }

export default layers
