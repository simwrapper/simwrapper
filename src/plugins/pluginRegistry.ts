import { VisualizationPlugin } from '@/Globals'
import { AsyncComponent, defineAsyncComponent } from 'vue'
// : VisualizationPlugin[]

// EVERY plugin must be registered here:

const plugins = [
  {
    kebabName: 'xmas-kelheim',
    filePatterns: ['**/xmas-kelheim*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./xmas-kelheim/VehicleAnimation.vue')),
  },
  {
    kebabName: 'x-y-t',
    filePatterns: ['**/viz-xyt-*.y?(a)ml', '**/*xyt.csv?(.gz)'],
    component: defineAsyncComponent(() => import('./xy-time/XyTime.vue')),
  },
  {
    kebabName: 'area-map',
    filePatterns: ['**/viz-map*.y?(a)ml', '**/*.geojson?(.gz)', '**/*.shp'],
    component: defineAsyncComponent(() => import('./shape-file/ShapeFile.vue')),
  },
  {
    kebabName: 'carriers',
    filePatterns: ['**/*carriers.xml*', '**/viz-carrier*.y?(a)ml*'],
    component: defineAsyncComponent(() => import('./carrier-viewer/CarrierViewer.vue')),
  },
  {
    kebabName: 'vehicle-view',
    filePatterns: ['**/viz-vehicles*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./vehicle-animation/VehicleAnimation.vue')),
  },
  {
    kebabName: 'summary-table',
    filePatterns: ['(topsheet|table)*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./calculation-table/CalculationTable.vue')),
  },
  {
    kebabName: 'xy-hexagons',
    filePatterns: ['**/viz-xy-*.y?(a)ml', '*output_trips.csv?(.gz)'],
    component: defineAsyncComponent(() => import('./xy-hexagons/XyHexagons.vue')),
  },
  {
    kebabName: 'network',
    component: defineAsyncComponent(() => import('./links-gl/NetworkLinks.vue')),
    filePatterns: [
      '**/*network.xml?(.gz)',
      '**/*network.geo?(.)json?(.gz)',
      '**/viz-gl-link*.y?(a)ml',
      '**/viz-link*.y?(a)ml',
    ],
  },
  {
    kebabName: 'transit',
    filePatterns: ['viz-pt*.y?(a)ml', '*transitschedule.xml?(.gz)'],
    component: defineAsyncComponent(() => import('./transit-demand/TransitDemand.vue')),
  },
  {
    kebabName: 'aggregate-od',
    filePatterns: ['**/viz-od*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./aggregate-od/AggregateOd.vue')),
  },
  {
    kebabName: 'flowmap',
    filePatterns: ['**/viz-flowmap*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./flowmap/Flowmap.vue')),
  },
  {
    kebabName: 'plotly',
    filePatterns: ['**/plotly*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./flowmap/Flowmap.vue')),
  },
  {
    kebabName: 'vega-chart',
    filePatterns: ['**/*.vega.json'],
    component: defineAsyncComponent(() => import('./vega-lite/VegaLite.vue')),
  },
  {
    kebabName: 'sankey',
    filePatterns: ['**/sankey*.y?(a)ml', '**/viz-sankey*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./sankey/SankeyDiagram.vue')),
  },
  {
    kebabName: 'events',
    filePatterns: ['**/viz-events*.y?(a)ml', '**/*events.xml?(.gz)'],
    component: defineAsyncComponent(() => import('./event-viewer/EventViewer.vue')),
  },
  {
    kebabName: 'image-view',
    filePatterns: ['!(*thumbnail*).(png|jpg)'], // skip thumbnails!
    component: defineAsyncComponent(() => import('./image/ImageView.vue')),
  },
  {
    kebabName: 'video-player',
    filePatterns: ['*.mp4'],
    component: defineAsyncComponent(() => import('./video-player/VideoPlayer.vue')),
  },
  {
    kebabName: 'xml-viewer',
    filePatterns: ['**/*.xml*'],
    component: defineAsyncComponent(() => import('./xml-viewer/XmlViewer.vue')),
  },
]

//   CarrierViewer: defineAsyncComponent(() => import('@/plugins/carrier-viewer/CarrierViewer.vue')),
//   Vehicles: defineAsyncComponent(() => import('@/plugins/vehicle-animation/VehicleAnimation.vue')),
//   Summary: defineAsyncComponent(() => import('@/plugins/calculation-table/CalculationTable.vue')),
//   Hexagons: defineAsyncComponent(() => import('@/plugins/xy-hexagons/XyHexagons.vue')),
//   Network: defineAsyncComponent(() => import('@/plugins/links-gl/NetworkLinks.vue')),
//   Transit: defineAsyncComponent(() => import('@/plugins/transit-demand/TransitDemand.vue')),
//   AggregateOd: defineAsyncComponent(() => import('@/plugins/aggregate-od/AggregateOd.vue')),
//   Flowmap: defineAsyncComponent(() => import('@/plugins/flowmap/Flowmap.vue')),
//   Plotly: defineAsyncComponent(() => import('@/plugins/flowmap/Flowmap.vue')),
//   VegaLite: defineAsyncComponent(() => import('@/plugins/vega-lite/VegaLite.vue')),
//   Sankey: defineAsyncComponent(() => import('@/plugins/sankey/SankeyDiagram.vue')),
//   Events: defineAsyncComponent(() => import('@/plugins/event-viewer/EventViewer.vue')),
//   ImageView: defineAsyncComponent(() => import('@/plugins/image/ImageView.vue')),
//   VidPlayer: defineAsyncComponent(() => import('@/plugins/video-player/VideoPlayer.vue')),
//   XmlViewer: defineAsyncComponent(() => import('@/plugins/xml-viewer/XmlViewer.vue')),
// }

//   XYT: defineAsyncComponent(() => import('@/plugins/xy-time/XyTime.vue')),
//   AreaMap: defineAsyncComponent(() => import('@/plugins/shape-file/ShapeFile.vue')),
//   XmasKelheim: defineAsyncComponent(() => import('@/plugins/xmas-kelheim/VehicleAnimation.vue')),

export const pluginComponents: { [key: string]: AsyncComponent } = {}
plugins.forEach(p => {
  pluginComponents[p.kebabName] = p.component
})

export default plugins
