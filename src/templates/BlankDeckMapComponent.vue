<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { ArcLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'

import globalStore from '@/store'

export default defineComponent({
  name: 'MyDeckComponent',
  props: {
    viewId: { type: Number, required: true },
    dark: { type: Boolean, required: true },
    data: { type: Array, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    onClick: { type: Function, required: true },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      tooltipHTML: '',
      tooltipStyle: {
        position: 'absolute',
        padding: '4px 8px',
        display: 'block',
        top: 0,
        left: 0,
        color: this.dark ? '#ccc' : '#223',
        backgroundColor: this.dark ? '#2a3c4f' : 'white',
        zIndex: 20000,
      } as any,
    }
  },

  watch: {
    layers() {
      this.deckOverlay?.setProps({
        layers: this.layers,
      })
    },

    dark() {
      const style = `/map-styles/${this.dark ? 'dark' : 'positron'}.json`
      this.mymap?.setStyle(style)
    },

    'globalState.viewState'() {
      if (this.mapIsIndependent) return
      const incoming = this.globalState.viewState as any
      const center = this.mymap?.getCenter() as any
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

  computed: {
    layers(): any[] {
      const layers = [
        new ArcLayer({
          id: 'arc-layer',
          data: this.data,
          getSourcePosition: (d: any) => d[0],
          getTargetPosition: (d: any) => d[1],
          pickable: false,
        }),
      ]
      return layers
    },
  },

  mounted() {
    const style = `/map-styles/${this.dark ? 'dark' : 'positron'}.json`
    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    //@ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      center,
      zoom: 7,
    })
    this.mymap.on('move', this.handleMove)
    this.mymap.on('style.load', () => {
      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
        onClick: this.handleClick,
      })
      this.mymap?.addControl(this.deckOverlay)
    })
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    handleMove() {
      if (this.mapIsIndependent) return
      const center = this.mymap?.getCenter() as any
      const view = {
        latitude: center.lat,
        longitude: center.lng,
        zoom: this.mymap?.getZoom(),
        bearing: this.mymap?.getBearing(),
        pitch: this.mymap?.getPitch(),
        jump: true,
      }
      globalStore.commit('setMapCamera', view)
    },

    getTooltip(tip: { x: number; y: number; object: any }) {
      const { x, y, object } = tip

      if (!object || !object.position || !object.position.length) {
        this.tooltipStyle.display = 'none'
        return
      }

      const lat = object.position[1]
      const lng = object.position[0]
      const html = `\
        <b>tooltip</b> \
      `
      this.tooltipStyle.display = 'block'
      this.tooltipStyle.top = `${y + 12}px`
      this.tooltipStyle.left = `${x + 12}px`
      this.tooltipHTML = html
    },

    handleClick(target: any, event: any) {
      this.tooltipStyle.display = 'none'
      if (this.onClick) this.onClick(target, event)
    },
  },
})
</script>

<style lang="scss">
.deck-map {
  position: absolute;
  inset: 0 0 0 0;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  inset: 0 0 0 0;
}

.deck-tooltip {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10000;
  pointer-events: none;
}
</style>
