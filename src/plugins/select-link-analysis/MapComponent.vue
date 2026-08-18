<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { ArcLayer, PathLayer, LineLayer } from '@deck.gl/layers'
import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'

import { MapboxOverlay } from '@deck.gl/mapbox'
import * as d3 from "d3";
import { color } from "d3-color";
import maplibregl from 'maplibre-gl'
import GeojsonOffsetLayer from '@/layers/GeojsonOffsetLayer'
import globalStore from '@/store'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'


interface DeckObject {
  index: number
  target: number[]
  data: any
}


export default defineComponent({
  name: 'MyDeckComponent',
  props: {
    cbTooltip: { type: Function, required: true },
    cbClickEvent: { type: Function, required: false },
    viewId: { type: Number, required: true },
    selectedLinkPaths: { type: Object as PropType<Map<number, number>>, required: false },
    dark: { type: Boolean, required: true },
    data: { type: Array, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    features: { type: Array },
    lineColors: { type: [String, Uint8ClampedArray] }, //  = '#4e79a7' as string | Uint8Array,
    lineWidths: { type: [Number, Float32Array], required: true },
    highlightedLinkIndex: { type: Number },
    // onClick: { type: Function, required: true },
    show3dBuildings: { type: Boolean, required: false, default: false },
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
      maxVehicleCount: 0,
      minVehicleCount: 0,
    }
  },

  watch: {
    layers() {
      console.log('updating layers:', this.layers)
      console.log('deckOverlay?', this.deckOverlay)
      this.deckOverlay?.setProps({
        layers: this.layers,
      })
    },

    features(val) {
      console.log('features changed:', val?.length)

    },

    dark() {
      const style = `/map-styles/${this.dark ? 'dark' : 'positron'}.json`
      this.mymap?.setStyle(style)
    },

    show3dBuildings() {
      if (!this.mymap) return
      if (this.show3dBuildings) enable3DBuildings(this.mymap)
      else disable3DBuildings(this.mymap)
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

    isStroked() {
      return !!this.lineColors && this.lineWidths !== 0
    },

    countMap(): Map<string, number> {
      if (!this.selectedLinkPaths) return new Map()
      if (this.selectedLinkPaths instanceof Map) return this.selectedLinkPaths as any
      let result = new Map(Object.entries(this.selectedLinkPaths).map(([k, v]) => [k, v as number]))
      this.maxVehicleCount = Math.max(...result.values(), 0)
      this.minVehicleCount = Math.min(...result.values(), 0)
      return result
    },

    // ================= LAYERS ================

    layers() {
      // console.log('layers computed fired, features:', this.features?.length)

      const finalLayers = []

      finalLayers.push(

        new LineOffsetLayer({
          id: 'linksLayer',
          data: this.features,
          getColor: (feature: any) => {
            const value = this.countMap.get(feature.id.toString())
            if (value === undefined) return [80, 80, 80, 80]  // grey = no data
            return this.getLinkColorScale(value)
          },
          getWidth: (feature: any) => {
            const value = this.countMap.get(feature.id.toString())
            return value ? Math.sqrt(value) : 0.5
          },
          updateTriggers: {
            getColor: [this.countMap],
            getWidth: [this.countMap],
          },
          getSourcePosition: (d: any) => d.geometry.coordinates[0],
          getTargetPosition: (d: any) => d.geometry.coordinates[1],
          pickable: true,
          autoHighlight: true,
          highlightedObjectIndex:
            this.highlightedLinkIndex == -1 ? null : this.highlightedLinkIndex,
          highlightColor: [255, 255, 255, 160], // [255, 0, 204, 255],
          opacity: 1,
          widthMinPixels: 1,
          transitions: {
            getColor: 300,
            getWidth: 300,
          },
        } as any)
      )
      return finalLayers

    },
  },

  mounted() {

    const style = `/map-styles/${this.dark ? 'dark' : 'positron'}.json`
    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as any
    const zoom = this.globalState.viewState.zoom

    // check coords before failing
    console.log({ center, zoom })
    if (center.lng > 180 || center.lat > 90) {
      this.$emit('error', 'Invalid coordinates: long/lat out of range')
      return
    }

    //@ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      center,
      zoom,
      canvasContextAttributes: { preserveDrawingBuffer: true },
      pixelRatio: window.devicePixelRatio,

    })
    // console.log('map container dimensions:',
    //   document.getElementById(container)?.offsetWidth,
    //   document.getElementById(container)?.offsetHeight
    // )
    this.mymap.on('move', this.handleMove)
    this.mymap.on('style.load', () => {
      if (this.show3dBuildings && this.mymap) {
        enable3DBuildings(this.mymap)
      }

      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
        pickingRadius: 10,
        onHover: this.handleHover,
        onClick: this.handleClick,
      })
      this.mymap?.addControl(this.deckOverlay)
      // console.log('overlay added, layers count:', this.layers.length)

      this.$nextTick(() => {
        this.deckOverlay?.setProps({ layers: this.layers })
      })

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

    getTooltip({ object, index }: { object: any; index: number }) {
      let offset = index
      if (object && 'feature_idx' in object) {
        offset = object.feature_idx
      }
      // always call this even if we're blank so tooltip goes away
      if (this.cbTooltip) this.cbTooltip(offset, object)
    },

    handleClick(target: any, event: any) {
      // this.tooltipStyle.display = 'none'
      console.log('click', target, event)
      this.$emit('selectedLink', { link: target.object, index: target.index })
      this.getTooltip(target)
    },

    handleHover(target: any, event: any) {

      target.color = [255, 0, 0, 255]
      if (target.index == -1) {
        this.cbTooltip(-1, null)
        return
      }
      this.getTooltip(target)
      // this.tooltipStyle.display = 'none'
      // if (this.cbClickEvent) this.cbClickEvent(event)
    },
    getLinkColorScale(vehicleCount: number) {
      if (vehicleCount === undefined || this.maxVehicleCount === this.minVehicleCount) {
        return [80, 80, 80, 255]
      }
      const t = (vehicleCount - this.minVehicleCount) / (this.maxVehicleCount - this.minVehicleCount)
      const colorStr = d3.scaleSequential(d3.interpolateYlOrRd)(t);
      const c = color(colorStr)?.rgb();

      return c ? [c.r, c.g, c.b, 255] : [80, 80, 80, 255];
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
