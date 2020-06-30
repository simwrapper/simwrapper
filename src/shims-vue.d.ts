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

declare module 'convert-seconds'
declare module 'vue-slide-bar'
declare module 'vue-table-component'
declare module '@statnett/vue-plotly'
declare module 'zip-loader'
