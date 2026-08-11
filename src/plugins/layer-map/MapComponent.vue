<template lang="pug">
.layer-map-canvas
  .map-container(:id="`map-${viewId}`")
</template>

<script lang="ts">
// This replaces AllLayers.tsx, the old @deck.gl/react + react-map-gl renderer. Neither
// package is installed anymore, so the layer-map plugin renders through maplibre +
// MapboxOverlay like every other migrated map plugin. See VUE3-MIGRATION.md.
import { defineComponent, markRaw } from 'vue'
import type { PropType } from 'vue'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'

import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'LayerMapComponent',

  props: {
    layers: { type: Array as PropType<any[]>, required: true },
    viewId: { type: Number, required: true },
    // 'off' | 'light' | 'dark' -- 'off' means no basemap at all
    background: { type: String, default: 'light' },
    cbError: { type: Function as PropType<(msg: any) => void>, required: false },
  },

  data() {
    return {
      globalState: globalStore.state,
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      resizer: null as ResizeObserver | null,
    }
  },

  computed: {
    mapStyle(): any {
      if (this.background === 'off') return { version: 8, sources: {}, layers: [] }
      return `${BASE_URL}map-styles/${this.background === 'dark' ? 'dark' : 'positron'}.json`
    },

    deckLayers(): any[] {
      // deck draws in array order; the configurator lists topmost layer first.
      return this.layers
        .map(layer => {
          try {
            return layer.deckLayer()
          } catch (e) {
            if (this.cbError) this.cbError(e)
            return null
          }
        })
        .filter(layer => !!layer)
        .reverse()
    },
  },

  watch: {
    deckLayers() {
      this.deckOverlay?.setProps({ layers: this.deckLayers })
    },

    mapStyle() {
      this.mymap?.setStyle(this.mapStyle)
    },

    'globalState.viewState'() {
      const incoming = this.globalState.viewState as any
      const center = this.mymap?.getCenter() as any
      if (!center) return
      if (
        incoming.longitude !== center.lng ||
        incoming.latitude !== center.lat ||
        incoming.zoom !== this.mymap?.getZoom() ||
        incoming.pitch !== this.mymap?.getPitch() ||
        incoming.bearing !== this.mymap?.getBearing()
      ) {
        this.mymap?.jumpTo(
          Object.assign({ center: { lng: incoming.longitude, lat: incoming.latitude } }, incoming)
        )
      }
    },
  },

  mounted() {
    const view = this.globalState.viewState as any

    // markRaw for the same reason as the deck overlay: maplibre freezes the `rgb` array
    // on the Color objects it parses out of a style, so a reactive map throws
    // "'get' on proxy: property 'rgb' is a read-only and non-configurable data property"
    // -- reproducible by switching the basemap theme, which re-parses the style.
    this.mymap = markRaw(
      new maplibregl.Map({
        container: `map-${this.viewId}`,
        style: this.mapStyle,
        center: [view.longitude, view.latitude],
        zoom: view.zoom,
        bearing: view.bearing || 0,
        pitch: view.pitch || 0,
        canvasContextAttributes: { preserveDrawingBuffer: true },
      })
    )

    // In a dashboard the card is still growing when we mount, so the map is created
    // against a zero-height container and paints nothing until something resizes it.
    this.resizer = new ResizeObserver(() => this.mymap?.resize())
    const container = document.getElementById(`map-${this.viewId}`)
    if (container) this.resizer.observe(container)

    this.mymap.on('move', this.handleMove)
    this.mymap.on('style.load', () => {
      // The overlay must be raw: deck.gl freezes each layer's props, and reading
      // layer.props.data back through a Vue proxy violates the proxy invariant and
      // throws during layer matching. See trap #7.
      if (!this.deckOverlay) {
        this.deckOverlay = markRaw(
          new MapboxOverlay({
            interleaved: true,
            layers: this.deckLayers,
            pickingRadius: 4,
            getCursor: ({ isDragging, isHovering }: any) =>
              isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab',
          })
        )
        this.mymap?.addControl(this.deckOverlay)
      }
    })
  },

  beforeUnmount() {
    this.resizer?.disconnect()
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
    this.mymap = null
  },

  methods: {
    handleMove() {
      const center = this.mymap?.getCenter() as any
      globalStore.commit('setMapCamera', {
        longitude: center.lng,
        latitude: center.lat,
        center: [center.lng, center.lat],
        zoom: this.mymap?.getZoom(),
        bearing: this.mymap?.getBearing(),
        pitch: this.mymap?.getPitch(),
        jump: true,
      })
    },
  },
})
</script>

<style scoped lang="scss">
.layer-map-canvas {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  inset: 0 0 0 0;
}
</style>
