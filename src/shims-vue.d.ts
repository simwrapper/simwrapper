declare module '*.vue' {
  import Vue from 'vue'
  export default Vue
}

// this allows import of raw text files using raw-loader
// e.g: import myTxt from 'raw-loader!./mytextfile.txt'
declare module 'raw-loader!*' {
  const content: string
  export default content
}

declare module 'yaml-loader!*' {
  const content: any
  export default content
}

declare module '@statnett/vue-plotly'
declare module 'colormap'
declare module 'convert-seconds'
declare module 'd3-sankey-diagram'
declare module 'javascript-natural-sort'
declare module 'read-blob'
declare module 'vue-slide-bar'
declare module 'vue-table-component'
declare module 'vue-video-player'
declare module 'vuera'
declare module 'zip-loader'
declare module 'react-toggle'

declare module '@turf/point-to-line-distance'
declare module '@turf/nearest-point-to-line'
declare module '@/plugins/trip-viewer/triplayer'
declare module '@loaders.gl/images'
declare module '@deck.gl/aggregation-layers'
declare module '@deck.gl/extensions'
declare module '@deck.gl/core'
declare module '@deck.gl/react'
declare module '@deck.gl/layers'
declare module '@deck.gl/geo-layers'
declare module '@luma.gl/constants'
declare module '@luma.gl/core'
declare module '@math.gl/polygon'

declare module '@aftersim/pako'
