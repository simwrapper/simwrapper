// EVERY map layer must be registered here:

import ArcLayer from './ArcLayer'
import PointsLayer from './PointsLayer'
import PolygonsLayer from './PolygonsLayer'

const layers = {
  arcs: ArcLayer,
  points: PointsLayer,
  polygons: PolygonsLayer,
} as { [layerType: string]: any }

export default layers
