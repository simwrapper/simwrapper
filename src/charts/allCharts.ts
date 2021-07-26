// add every chart type here.
// the name of the import will be the chart "type" in YAML.

import area from './area.vue'
import bar from './bar.vue'
import bubble from './bubble.vue'
import line from './line.vue'
import links from './links.vue'
import map from './map-polygons.vue'
import pie from './pie.vue'
import scatter from './scatter.vue'

export default { area, links, map, pie, scatter, line, bar, bubble }
