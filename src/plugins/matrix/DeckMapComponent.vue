<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { GeoJsonLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'

import { debounce } from '@/js/util'
import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL
const DEFAULT_FILL = [32, 64, 128, 255]

export default defineComponent({
  name: 'MyDeckComponent',
  props: {
    viewId: { type: Number, required: true },
    features: { type: Array, required: true },
    cbTooltip: { type: Function },
    clickedZone: { type: Function },
    activeZoneFeature: { type: Object },
    altZoneFeature: { type: Object },
    isLoading: { type: Boolean, required: true },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      debounceSaveLocation: null as null | Function,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      highlightOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      tooltipHTML: '',
      tooltipStyle: {
        position: 'absolute',
        padding: '4px 8px',
        display: 'block',
        top: 0,
        left: 0,
        color: globalStore.state.isDarkMode ? '#ccc' : '#223',
        backgroundColor: globalStore.state.isDarkMode ? '#2a3c4f' : 'white',
        zIndex: 20000,
      } as any,
    }
  },

  watch: {
    layers() {
      this.deckOverlay?.setProps({
        layers: [this.layers[0]],
      })
      this.highlightOverlay?.setProps({
        layers: [this.layers[1]],
      })
    },

    'globalState.isDarkMode'() {
      const style = `${BASE_URL}map-styles/${
        this.globalState.isDarkMode ? 'dark' : 'positron'
      }.json`
      this.mymap?.setStyle(style)
    },

    'globalState.viewState'() {
      // if (this.mapIsIndependent) return
      const incoming = this.globalState.viewState as any
      const center = this.mymap?.getCenter() as any
      if (
        incoming.center.lng !== center.lng ||
        incoming.center.lat !== center.lat ||
        incoming.zoom !== this.mymap?.getZoom() ||
        incoming.pitch !== this.mymap?.getPitch() ||
        incoming.bearing !== this.mymap?.getBearing()
      ) {
        this.mymap?.jumpTo(incoming)
      }
      this.debounceSaveLocation?.(incoming)
    },
  },

  computed: {
    layers(): any[] {
      const highlights = []
      if (this.activeZoneFeature) {
        highlights.push(this.activeZoneFeature)
        if (this.altZoneFeature) highlights.push(this.altZoneFeature)
      }

      const highlightColor = [255, 0, 224]
      const altColor = [255, 255, 128]

      const highlightLayer = new GeoJsonLayer({
        id: 'HighlightLayer',
        data: highlights,
        getLineWidth: 6,
        getLineColor: (_: any, o: any) => (o.index === 0 ? highlightColor : altColor),
        getFillColor: [0, 0, 0, 0], // fully transparent
        lineJointRounded: true,
        lineWidthUnits: 'pixels',
        lineWidthScale: 1,
        opacity: 1.0,
        pickable: false,
        fp64: false,
        parameters: { depthTest: false, fp64: false },
      } as any)

      const layer = new GeoJsonLayer({
        id: 'ZonalLayer',
        beforeId: 'water',
        data: this.features,
        getFillColor: (d: any) => d.properties.color || DEFAULT_FILL,
        autoHighlight: true,
        opacity: this.isLoading ? 0.8 : 1.0, // fillHeights ? 1.0 : 0.8, // 3D must be opaque
        pickable: true,
        stroked: false,
        highlightColor: [255, 255, 255, 128],
        fp64: false,
        material: false,
        transitions: {
          getFillColor: 250,
        },
        parameters: {
          depthTest: false,
          fp64: false,
        },
        glOptions: {
          // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
          preserveDrawingBuffer: true,
          fp64: false,
        },
      } as any)

      return [layer, highlightLayer]
    },
  },

  async mounted() {
    this.debounceSaveLocation = debounce(this.saveLocation, 1000)

    const style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
    const container = `map-${this.viewId}`
    const view = this.globalState.viewState
    // @ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      ...view,
    })

    this.mymap.on('move', this.handleMove)
    this.mymap.on('style.load', () => {
      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: [this.layers[0]],
        onClick: this.handleClick,
        onHover: this.getTooltip,
      })
      this.mymap?.addControl(this.deckOverlay)
      this.highlightOverlay = new MapboxOverlay({
        interleaved: false,
        layers: [this.layers[1]],
      })
      this.mymap?.addControl(this.highlightOverlay)
    })
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    if (this.highlightOverlay) this.mymap?.removeControl(this.highlightOverlay)
    this.mymap?.remove()
    this.mymap = null
  },

  methods: {
    // save map location to local storage - but not so often
    saveLocation(incoming: any) {
      localStorage.setItem('H5MapViewer_view', JSON.stringify(incoming))
    },

    // CLICK  ---------------------------------------------------------------------
    handleClick(e: any) {
      console.log('click!')
      if (!e.object) return
      if (this.clickedZone) this.clickedZone({ index: e.index, properties: e.object.properties })
    },

    handleMove() {
      // if (this.mapIsIndependent) return
      const center = this.mymap?.getCenter() as any
      const view = {
        center,
        zoom: this.mymap?.getZoom(),
        bearing: this.mymap?.getBearing(),
        pitch: this.mymap?.getPitch(),
        jump: true,
      }
      globalStore.commit('setMapCamera', view)
    },

    // TOOLTIP ------------------------------------------------------------------
    getTooltip(event: any) {
      const { index, object, x, y } = event
      if (this.cbTooltip) this.cbTooltip({ index, object, x, y })
    },

    OLDgetTooltip(tip: { x: number; y: number; object: any }) {
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

    // handleClick(target: any, event: any) {
    //   this.tooltipStyle.display = 'none'
    //   if (this.onClick) this.onClick(target, event)
    // },
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
