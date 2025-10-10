<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-if="tooltipHTML" :v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { DataFilterExtension } from '@deck.gl/extensions'
import maplibregl from 'maplibre-gl'

import globalStore from '@/store'
import MovingIconsLayer from '@/layers/moving-icons/moving-icons-vehicles-layer'
import { ColorDepiction } from '@/layers/moving-icons/moving-icons-vehicles-layer'

const BASE_URL = import.meta.env.BASE_URL

const ICON_MAPPING = {
  vehicle: { x: 0, y: 0, width: 256, height: 256, mask: false },
}

export default defineComponent({
  name: 'EventDeckComponent',
  props: {
    breakpoints: { type: Array as PropType<number[]>, required: true },
    dark: { type: Boolean, required: true },
    dotsize: { type: Number, required: true },
    eventData: { type: Array as PropType<{ data: any; timeRange: number[] }[]>, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    projection: { type: String, required: true },
    simulationTime: { type: Number, required: true },
    tick: { type: Number, required: true },
    viewId: { type: Number, required: true },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      dataFilter: new DataFilterExtension({ filterSize: 1 }),
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
      if (!this.deckOverlay) return
      this.deckOverlay.setProps({
        layers: this.layers,
      })
    },

    dark() {
      let style
      if (this.projection == 'Atlantis') {
        style = { version: 8, sources: {}, layers: [] }
      } else {
        style = `${BASE_URL}map-styles/${
          this.globalState.isDarkMode ? 'dark' : 'positron'
        }.json` as any
      }
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
    latitudeCorrectionFactor() {
      // rotation factors are warped at high latitudes. Thanks, mercator
      const viewState = this.globalState.viewState
      const latitude = viewState.latitude || (viewState.center && viewState.center[1]) || 35.0
      return Math.cos((latitude * Math.PI) / 180.0)
    },

    layers(): any[] {
      const vehicleLayers = [] as any[]

      let numActiveLayers = 0
      this.eventData.forEach((layer, layerIndex) => {
        // The entire layer can be hidden if all of its trips are completely outside the current simulationTime
        // Add 2 seconds to make sure there is overlap
        const outOfRange =
          this.simulationTime < layer.timeRange[0] - 5 ||
          this.simulationTime > layer.timeRange[1] + 5

        if (!outOfRange) numActiveLayers++

        vehicleLayers.push(
          //@ts-ignore
          new MovingIconsLayer({
            data: {
              length: layer.data.t0.length,
              attributes: {
                getTimeStart: layer.data.t0,
                getTimeEnd: layer.data.t1,
                getPathStart: layer.data.p0,
                getPathEnd: layer.data.p1,
                getColorCode: layer.data.colors,
              },
            },
            id: 'vehicles' + layerIndex,
            iconMoving: 'vehicle',
            iconStill: 'vehicle',
            colorDepiction: ColorDepiction.REL_SPEED,
            getSize: this.dotsize, // searchEnabled ? 56 : 44,
            opacity: 1,
            latitudeCorrectionFactor: this.latitudeCorrectionFactor,
            currentTime: this.simulationTime,
            shadowEnabled: false,
            iconAtlas: `${BASE_URL}images/veh-curvy5.png`, // BASE_URL + '/images/icon-atlas.png',
            iconMapping: ICON_MAPPING,
            sizeScale: 1,
            billboard: false,
            positionFormat: 'XY',
            pickable: false,
            autoHighlight: false,
            highlightColor: [255, 255, 255, 140],
            parameters: { depthTest: false },
            visible: !outOfRange,
          })
        )
      })
      return vehicleLayers
    },
  },

  mounted() {
    let style
    if (this.projection == 'Atlantis') {
      style = { version: 8, sources: {}, layers: [] }
    } else {
      style = `${BASE_URL}map-styles/${
        this.globalState.isDarkMode ? 'dark' : 'positron'
      }.json` as any
    }

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    const zoom = (this.globalState.viewState.zoom || 8) as number
    //@ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      center,
      zoom,
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
      this.tooltipHTML = ''
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
