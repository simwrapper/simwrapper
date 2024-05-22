// EVERY map layer must be registered here:

import PointsLayer from './PointsLayer'

const layers = {
  points: PointsLayer,
} as { [layerType: string]: any }

export default layers
