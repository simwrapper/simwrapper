<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-show="!!tooltipHTML" v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import globalStore from '@/store'
import { FlowmapLayer, FlowmapLayerPickingInfo, PickingType } from '@flowmap.gl/layers'

export default defineComponent({
  name: 'FlowmapDeckComponent',
  props: {
    viewId: { type: Number, required: true },
    dark: { type: Boolean, required: true },
    vizDetails: { type: Object, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    locations: { type: Array, required: true },
    flows: { type: Array, required: true },
    elapsed: { type: Number, required: true },
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
        this.mymap?.jumpTo(incoming)
      }
    },
  },

  computed: {
    layers(): any[] {
      const layers = [] as any[]
      layers.push(
        new FlowmapLayer({
          data: { locations: this.locations, flows: this.flows },
          id: 'my-flowmap-' + this.viewId,
          getLocationId: (location: any) => location.id,
          getLocationLat: (location: any) => location.lat,
          getLocationLon: (location: any) => location.lon,
          getLocationName: (location: any) => location.id,
          getFlowOriginId: (flow: any) => flow.o,
          getFlowDestId: (flow: any) => flow.d,
          getFlowMagnitude: (flow: any) => flow.v || null,
          adaptiveScalesEnabled: true,
          parameters: { depthTest: false },
          colorScheme: this.vizDetails.colorScheme,
          animationEnabled: this.vizDetails.animationEnabled,
          clusteringEnabled: this.vizDetails.clustering,
          clusteringAuto: this.vizDetails.clustering,
          clusteringLevel: this.vizDetails.clusteringLevel,
          darkMode: this.dark,
          drawOutline: false,
          fadeEnabled: true,
          opacity: 1,
          pickable: true,
          onHover: this.getTooltip,
        })
      )
      return layers
    },
  },

  mounted() {
    const style = `/map-styles/${this.dark ? 'dark' : 'positron'}.json`
    const container = `map-${this.viewId}`
    const view = this.globalState.viewState
    //@ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      ...view,
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
      // if (this.onClick) this.onClick(target, event)
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
