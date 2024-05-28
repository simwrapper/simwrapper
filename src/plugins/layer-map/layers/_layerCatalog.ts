// EVERY map layer must be registered here:

import ArcLayer from './ArcLayer'
import PointsLayer from './PointsLayer'

const layers = {
  arcs: ArcLayer,
  points: PointsLayer,
} as { [layerType: string]: any }

export default layers
