import { AsyncComponent, defineAsyncComponent } from 'vue'

// EVERY plugin must be registered here:

const plugins = [
  {
    kebabName: 'layers',
    filePatterns: ['**/viz-layers*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./layer-map/LayerMap.vue')),
  },
  {
    kebabName: 'xytime',
    filePatterns: ['**/viz-xyt-*.y?(a)ml', '**/*xyt.csv?(.gz)'],
    component: defineAsyncComponent(() => import('./xy-time/XyTime.vue')),
  },
  {
    kebabName: 'layer-map',
    filePatterns: [],
    component: defineAsyncComponent(() => import('./layer-map/LayerMap.vue')),
  },
  {
    kebabName: 'area-map',
    filePatterns: [
      '**/viz-map*.y?(a)ml',
      '**/*.geojson?(.gz)',
      '**/*network*.avro',
      '**/*network.xml?(.gz)',
      '**/*.shp',
      '**/*.gpkg',
      '**/*.gmns',
      '**/*.gmns.zip',
    ],
    component: defineAsyncComponent(() => import('./shape-file/ShapeFile.vue')),
  },
  {
    kebabName: 'pie-layer',
    filePatterns: ['**/viz-pie*.y?(a)ml*'],
    component: defineAsyncComponent(() => import('./pie-chart/PieChartDemo.vue')),
  },
  {
    kebabName: 'carriers',
    filePatterns: ['**/*carriers.xml*', '**/viz-carrier*.y?(a)ml*'],
    component: defineAsyncComponent(() => import('./carrier-viewer/CarrierViewer.vue')),
  },
  {
    kebabName: 'gridmap',
    filePatterns: ['**/viz-grid*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./grid-map/GridMap.vue')),
  },
  {
    kebabName: 'vehicles',
    filePatterns: ['**/viz-vehicles*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./vehicle-animation/VehicleAnimation.vue')),
  },
  {
    kebabName: 'summary-table',
    filePatterns: ['(topsheet|table)*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./calculation-table/CalculationTable.vue')),
  },
  {
    kebabName: 'hexagons',
    filePatterns: ['**/viz-xy-*.y?(a)ml', '*output_trips.csv?(.gz)'],
    component: defineAsyncComponent(() => import('./xy-hexagons/XyHexagons.vue')),
  },
  {
    kebabName: 'links',
    component: defineAsyncComponent(() => import('./links-gl/NetworkLinks.vue')),
    filePatterns: [
      // deprecated! Use shapefile/map viewer instead
      // '**/*network.xml?(.gz)',
      // '**/*network.geo?(.)json?(.gz)',
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
    kebabName: 'aggregate',
    filePatterns: ['**/viz-od*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./aggregate-od/AggregateOd.vue')),
  },
  {
    kebabName: 'flowmap',
    filePatterns: ['**/viz-flowmap*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./flowmap/Flowmap.vue')),
  },
  {
    kebabName: 'matrix',
    filePatterns: ['**/viz-matrix*.y?(a)ml', '**/*.h5', '**/*.omx'],
    component: defineAsyncComponent(() => import('./matrix/MatrixViewer.vue')),
  },
  {
    kebabName: 'plotly',
    filePatterns: ['**/plotly*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./plotly/PlotlyDiagram.vue')),
  },
  {
    kebabName: 'vega',
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
    kebabName: 'xml',
    filePatterns: ['**/*config*.xml*'],
    component: defineAsyncComponent(() => import('./xml-viewer/XmlViewer.vue')),
  },
  {
    kebabName: 'xmas-kelheim',
    filePatterns: ['**/xmas-kelheim*.y?(a)ml'],
    component: defineAsyncComponent(() => import('./xmas-kelheim/VehicleAnimation.vue')),
  },
  {
    kebabName: 'logistics',
    filePatterns: ['**/*lsps.xml*', '**/viz-logistic*.y?(a)ml*'],
    component: defineAsyncComponent(() => import('./logistics/LogisticsViewer.vue')),
  },
]

export const pluginComponents: { [key: string]: AsyncComponent } = {}

plugins.forEach(p => {
  pluginComponents[p.kebabName] = p.component
})

export default plugins
