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
import hexagons from './hexagons.vue'
import links from './links.vue'
import sankey from './sankey.vue'
import map from './map-polygons.vue'

// ----- EXPORT CHARTS HERE ---------------------------------------------------

// export all plotly charts here - be sure to put plotly charts separately!
export const plotlyCharts = { area, bar, bubble, heatmap, hexagons, line, pie, sankey, scatter }

// export all remaining charts here:
export default Object.assign({ flowmap, links, map }, plotlyCharts)

// ----- HELPER FUNCTIONS -----------------------------------------------------

export function buildCleanTitle(plotTitle: string, subfolder: string): string {
  let title = plotTitle

  if (subfolder) {
    title = subfolder.substring(1 + subfolder.lastIndexOf('/')) + ' - ' + title
  }

  title = title.replaceAll('/', '-')
  return title
}
