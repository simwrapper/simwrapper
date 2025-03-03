declare module '*.vue' {
  import Vue from 'vue'
  export default Vue
}

declare module '*.vert' {
  const content: string
  export default content
}

declare module '*.frag' {
  const content: string
  export default content
}

// import markdown files directly, they become vue components using vue-plugin-md
declare module '*.md' {
  import { ComponentOptions } from 'vue'
  const Component: ComponentOptions
  export default Component
}

declare module '@/js/avro'
declare module 'react-aria-menubutton'
declare module 'colormap'
declare module 'convert-seconds'
declare module 'd3-color'
declare module 'epsg'
declare module 'epsg-index'
declare module 'is-dark-color'
declare module 'javascript-natural-sort'
declare module 'katex'
declare module 'markdown-it-texmath'
declare module 'numcodecs'
declare module 'plotly.js/dist/plotly-cartesian'
declare module 'plotly.js/dist/plotly'
declare module 'read-blob'
declare module 'reproject'
declare module 'shallow-equal'
declare module 'vue-table-component'
declare module 'vue-video-player'
declare module 'vueperslides'
declare module 'vuera'
declare module 'react-toggle'
declare module 'vue-good-table'
declare module 'vue-virtual-scroll-list'
declare module 'zip-loader'

declare module '@turf/point-to-line-distance'
declare module '@turf/nearest-point-to-line'
declare module '@loaders.gl/images'
declare module '@deck.gl/aggregation-layers'
declare module '@deck.gl/extensions'
declare module '@deck.gl/core'
declare module '@deck.gl/layers/src/geojson-layer/sub-layer-map'
declare module '@deck.gl/react'
declare module '@deck.gl/layers'
declare module '@deck.gl/geo-layers'
declare module '@luma.gl/constants'
declare module '@luma.gl/core'
declare module '@math.gl/polygon'
declare module '@simwrapper/d3-sankey-diagram'
declare module '@simwrapper/papaparse'
declare module '@simwrapper/shp-write'
