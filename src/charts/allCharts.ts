// add every chart type here.
// the name of the import will be the chart "type" in YAML.

// plotly charts:
import area from './area.vue'
import bar from './bar.vue'
import bubble from './bubble.vue'
import heatmap from './heatmap.vue'
import line from './line.vue'
import pie from './pie.vue'
import scatter from './scatter.vue'

// all other dashboard viz components:
import flowmap from './flowmap.vue'
import links from './links.vue'
import map from './map-polygons.vue'

// export the charts here - be sure to put plotly charts separately!

export const plotlyCharts = { area, bar, bubble, heatmap, line, pie, scatter }

export default Object.assign({ flowmap, links, map }, plotlyCharts)
