<template>
  <div ref="reactRoot"></div>
</template>

<script lang="tsx">
import React from 'react'
import ReactDOM from 'react-dom/client'
import { defineComponent } from 'vue'

import H5TableViewer from './H5TableViewer'

export default defineComponent({
  name: 'H5TableWrapper',
  props: {
    filename: String,
    blob: File,
  },

  data() {
    return {
      root: null as any,
    }
  },

  mounted() {
    const container = this.$refs.reactRoot
    this.root = ReactDOM.createRoot(container)
    this.root.render(<H5TableViewer filename={this.filename} blob={this.blob} />)
  },

  beforeDestroy() {
    this.root?.unmount()
  },
})
</script>
