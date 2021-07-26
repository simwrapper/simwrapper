// add every chart type here.
// the name of the import will be the chart "type" in YAML.

import area from '@/charts/area.vue'
import links from '@/charts/links.vue'
import map from '@/charts/map-polygons.vue'
import pie from '@/charts/pie.vue'
import scatter from '@/charts/scatter.vue'
import line from '@/charts/line.vue'
import bar from '@/charts/bar.vue'
import bubble from '@/charts/bubble.vue'

export default { area, links, map, pie, scatter, line, bar, bubble }
