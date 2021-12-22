// add every chart type here.
// the name of the import will be the chart "type" in YAML.

// resizable charts:
import area from './area.vue'
import bar from './bar.vue'
import bubble from './bubble.vue'
import heatmap from './heatmap.vue'
import hexagons from './hexagons.vue'
import line from './line.vue'
import pie from './pie.vue'
import sankey from './sankey.vue'
import scatter from './scatter.vue'
import transit from './transit.vue'
import vega from './vega.vue'

// full-screen map visualizations:
import carriers from './carriers.vue'
import flowmap from './flowmap.vue'
import links from './links.vue'
import map from './map-polygons.vue'

// ----- EXPORT CHARTS HERE ---------------------------------------------------
// export all resizable charts here
export const plotlyCharts = {
  area,
  bar,
  bubble,
  heatmap,
  hexagons,
  line,
  pie,
  sankey,
  transit,
  scatter,
  vega,
}

// export all remaining charts/maps here:
export default Object.assign({ carriers, flowmap, links, map }, plotlyCharts)

// ----- HELPER FUNCTIONS -----------------------------------------------------

export function buildCleanTitle(plotTitle: string, subfolder: string): string {
  let title = plotTitle

  if (subfolder) {
    title = subfolder.substring(1 + subfolder.lastIndexOf('/')) + ' - ' + title
  }

  title = title.replaceAll('/', '-')
  return title
}
