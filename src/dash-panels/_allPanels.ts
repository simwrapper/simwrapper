import { Component, defineAsyncComponent } from 'vue'

// add every chart type here.
// the name of the import will be the chart "type" in YAML.

// resizable charts:

export const panelLookup: { [key: string]: Component } = {
  area: defineAsyncComponent(() => import('./area.vue')),
  bar: defineAsyncComponent(() => import('./bar.vue')),
  bubble: defineAsyncComponent(() => import('./bubble.vue')),
  csv: defineAsyncComponent(() => import('./table.vue')),
  heatmap: defineAsyncComponent(() => import('./heatmap.vue')),
  hexagons: defineAsyncComponent(() => import('./hexagons.vue')),
  line: defineAsyncComponent(() => import('./line.vue')),
  pie: defineAsyncComponent(() => import('./pie.vue')),
  plotly: defineAsyncComponent(() => import('./plotly.vue')),
  sankey: defineAsyncComponent(() => import('./sankey.vue')),
  scatter: defineAsyncComponent(() => import('./scatter.vue')),
  slideshow: defineAsyncComponent(() => import('./slideshow.vue')),
  text: defineAsyncComponent(() => import('./text.vue')),
  tile: defineAsyncComponent(() => import('./tile.vue')),
  vega: defineAsyncComponent(() => import('./vega.vue')),
  video: defineAsyncComponent(() => import('./video.vue')),
  xml: defineAsyncComponent(() => import('./xml.vue')),

  // full-screen map visualizations:

  // aequilibrae: defineAsyncComponent(() => import('./aequilibrae-map.vue')),
  // aggregate: defineAsyncComponent(() => import('./aggregate-od.vue')),
  // carriers: defineAsyncComponent(() => import('./carriers.vue')),
  // flowmap: defineAsyncComponent(() => import('./flowmap.vue')),
  // gridmap: defineAsyncComponent(() => import('./gridmap.vue')),
  // layers: defineAsyncComponent(() => import('./layermap.vue')),
  // links: defineAsyncComponent(() => import('./links.vue')),
  // map: defineAsyncComponent(() => import('./area-map.vue')),
  // matrix: defineAsyncComponent(() => import('./matrix.vue')),
  // transit: defineAsyncComponent(() => import('./transit.vue')),
  // vehicles: defineAsyncComponent(() => import('./vehicles.vue')),
  // xytime: defineAsyncComponent(() => import('./xytime.vue')),
}

// ----- HELPER FUNCTIONS -----------------------------------------------------

export function buildCleanTitle(plotTitle: string, subfolder: string): string {
  let title = plotTitle

  if (subfolder) {
    title = subfolder.substring(1 + subfolder.lastIndexOf('/')) + ' - ' + title
  }

  title = title.replaceAll('/', '-')
  return title
}
