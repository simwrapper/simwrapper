<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { GeoJsonLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import globalStore from '@/store'

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
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
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
        layers: this.layers,
      })
    },

    'globalState.isDarkMode'() {
      const style = `/map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
      this.mymap?.setStyle(style)
    },

    'globalState.viewState'() {
      // if (this.mapIsIndependent) return
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
      const highlights = []
      if (this.activeZoneFeature) {
        highlights.push(this.activeZoneFeature)
        if (this.altZoneFeature) highlights.push(this.altZoneFeature)
      }

      const highlightColor = [255, 0, 224]
      const altColor = [255, 255, 128]

      const highlightLayer = new GeoJsonLayer({
        id: 'HighlightLayer',
        beforeId: 'water',
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
        parameters: {
          depthTest: false,
          fp64: false,
        },
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
        // useDevicePixels: false,
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
    const style = `/map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    // @ts-ignore
    this.mymap = new maplibregl.Map({
      center,
      zoom: 7,
      container,
      style,
    })
    this.mymap.on('move', this.handleMove)
    this.mymap.on('style.load', () => {
      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
        onClick: this.handleClick,
        onHover: this.getTooltip,
      })
      this.mymap?.addControl(this.deckOverlay)
    })
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
    this.mymap = null
  },

  methods: {
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
        latitude: center.lat,
        longitude: center.lng,
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
