<template>
  <div ref="reactRoot" class="h5-react-root"></div>
</template>

<script lang="ts">
// Vue <-> React bridge for the h5web table/heatmap viewer.
//
// Deliberately plain `lang="ts"` with React.createElement instead of `lang="tsx"`: the
// JSX lives in H5TableViewer.tsx, where the .tsx loader and tsconfig's `jsx` setting
// unambiguously apply. A JSX block inside an SFC depends on how @vitejs/plugin-vue hands
// the script off to esbuild, which is one more thing to get wrong for no benefit.
import React from 'react'
import ReactDOM from 'react-dom/client'
import { defineComponent, markRaw, toRaw } from 'vue'

import H5TableViewer from './H5TableViewer'

export default defineComponent({
  name: 'H5TableWrapper',
  props: {
    filename: String,
    blob: File,
  },

  data() {
    return {
      root: null as null | ReactDOM.Root,
    }
  },

  mounted() {
    const container = this.$refs.reactRoot as HTMLElement
    if (!container) return
    // markRaw: a React root holds fibers that React compares by identity and mutates
    // in place. Wrapped in a Vue proxy it is a trap #7 waiting to happen, and nothing
    // here needs it to be reactive.
    this.root = markRaw(ReactDOM.createRoot(container))
    this.renderReact()
  },

  beforeUnmount() {
    // Vue 2's `beforeDestroy` is silently dead in Vue 3. Without this the React tree --
    // and the h5wasm worker H5WasmLocalFileProvider spins up -- leaks on every unmount.
    this.root?.unmount()
    this.root = null
  },

  watch: {
    // React does not re-render on its own when the Vue props change; the bridge has to
    // push a new element in. MatrixViewer swaps `blob` for a freshly fabricated HDF5
    // File every time the user picks another table.
    blob() {
      this.renderReact()
    },
    filename() {
      this.renderReact()
    },
  },

  methods: {
    renderReact() {
      // toRaw: props are shallowReactive, so these come through raw today -- but the
      // File goes on to h5wasm, which structuredClones it into a worker, and a Proxy
      // there throws DataCloneError.
      this.root?.render(
        React.createElement(H5TableViewer, {
          filename: toRaw(this.filename),
          blob: toRaw(this.blob),
        })
      )
    },
  },
})
</script>

<style scoped lang="scss">
.h5-react-root {
  display: flex;
  flex-direction: column;
  min-height: 0;
}
</style>
