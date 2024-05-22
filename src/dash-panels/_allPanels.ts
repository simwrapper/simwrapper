import { AsyncComponent, defineAsyncComponent } from 'vue'

// add every chart type here.
// the name of the import will be the chart "type" in YAML.

// resizable charts:
export const panelLookup: { [key: string]: AsyncComponent } = {
  aggregate: defineAsyncComponent(() => import('./aggregate-od.vue')),
  area: defineAsyncComponent(() => import('./area.vue')),
  bar: defineAsyncComponent(() => import('./bar.vue')),
  bubble: defineAsyncComponent(() => import('./bubble.vue')),
  csv: defineAsyncComponent(() => import('./table.vue')),
  gridmap: defineAsyncComponent(() => import('./gridmap.vue')),
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
  transit: defineAsyncComponent(() => import('./transit.vue')),
  vega: defineAsyncComponent(() => import('./vega.vue')),
  vehicles: defineAsyncComponent(() => import('./vehicles.vue')),
  video: defineAsyncComponent(() => import('./video.vue')),
  xml: defineAsyncComponent(() => import('./xml.vue')),

  // full-screen map visualizations:
  carriers: defineAsyncComponent(() => import('./carriers.vue')),
  flowmap: defineAsyncComponent(() => import('./flowmap.vue')),
  links: defineAsyncComponent(() => import('./links.vue')),
  map: defineAsyncComponent(() => import('./area-map.vue')),
  layers: defineAsyncComponent(() => import('./layermap.vue')),
  matrix: defineAsyncComponent(() => import('./matrix.vue')),
  xytime: defineAsyncComponent(() => import('./xytime.vue')),
}

// ----- EXPORT CHARTS HERE ---------------------------------------------------
// export all resizable charts here
export const plotlyCharts = {
  // aggregate,
  // area,
  // bar,
  // bubble,
  // csv,
  // heatmap,
  // hexagons,
  // image: slideshow, // both 'image' and 'slideshow' types work for images
  // line,
  // markdown: text,
  // pie,
  // plotly,
  // sankey,
  // slideshow,
  // text,
  // tile,
  // transit,
  // scatter,
  // vega,
  // video,
  // xml,
  // xytime,
}

// export all remaining charts/maps here:
// export default Object.assign({}, /*{ carriers, flowmap, links, map },*/ plotlyCharts)
// export default { panelLookup }

// ----- HELPER FUNCTIONS -----------------------------------------------------

export function buildCleanTitle(plotTitle: string, subfolder: string): string {
  let title = plotTitle

  if (subfolder) {
    title = subfolder.substring(1 + subfolder.lastIndexOf('/')) + ' - ' + title
  }

  title = title.replaceAll('/', '-')
  return title
}
