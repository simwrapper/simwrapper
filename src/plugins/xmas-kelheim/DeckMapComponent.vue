<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-if="tooltipHTML" v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'

import globalStore from '@/store'
import DrtRequestLayer from './DrtRequestLayer'
import MovingIconsLayer, { ColorDepiction } from '@/layers/moving-icons/moving-icons-vehicles-layer'
import PathTraceLayer from '@/layers/PathTraceLayer'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'

const BASE_URL = import.meta.env.BASE_URL

const ICON_MAPPING = {
  circle: { x: 0, y: 0, width: 256, height: 256, mask: true },
  vehicle: { x: 256, y: 0, width: 256, height: 256, mask: true },
}

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0,
})

const pointLight = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [-74.05, 40.7, 8000],
})

const lightingEffect = new LightingEffect({ ambientLight, pointLight })

const THEMES = {
  dark: {
    vehicleColor: [200, 130, 250],
    trailColor0: [235, 235, 25],
    trailColor1: [23, 184, 190],
    effects: [lightingEffect],
  },
  light: {
    vehicleColor: [200, 130, 250],
    trailColor0: [235, 235, 25],
    trailColor1: [23, 184, 190],
    effects: [lightingEffect],
  },
}

const DRT_REQUEST = {
  time: 0,
  fromX: 1,
  fromY: 2,
  toX: 3,
  toY: 4,
  veh: 5,
  arrival: 6,
}

export default defineComponent({
  name: 'VehicleAnimationDeckComponent',
  props: {
    colors: { type: Object, required: true },
    dark: { type: Boolean, required: true },
    drtRequests: { type: Array as PropType<any[]>, required: true },
    leftside: { type: Boolean, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    onClick: { type: Function },
    paths: { type: Array as PropType<any[]>, required: true },
    searchEnabled: { type: Boolean, required: true },
    settingsShowLayers: { type: Object as PropType<{ [label: string]: boolean }>, required: true },
    simulationTime: { type: Number, required: true },
    traces: { type: Array as PropType<any[]>, required: true },
    vehicleLookup: { type: Array as PropType<any[]>, required: true },
    viewId: { type: Number, required: true },
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
    }
  },

  computed: {
    locale() {
      return this.globalState.locale
    },

    theme() {
      return THEMES[this.dark ? 'dark' : 'light']
    },

    iconAtlas() {
      // left-side driving icons are just vertically flipped
      const icon = this.leftside ? '-leftside' : ''
      return `${BASE_URL}images/icon-atlas-vehicles${icon}.png`
    },

    layers(): any[] {
      const layers = [] as any[]

      if (this.settingsShowLayers.routes)
        layers.push(
          //@ts-ignore:
          new PathTraceLayer({
            id: 'Routen',
            data: this.traces,
            currentTime: this.simulationTime,
            getSourcePosition: (d: any) => d.p0,
            getTargetPosition: (d: any) => d.p1,
            getTimeStart: (d: any) => d.t0,
            getTimeEnd: (d: any) => d.t1,
            getColor: (d: any) => this.colors[d.occ],
            getWidth: 1, // (d: any) => 3.0 * (d.occ + 1) - 1,
            opacity: 0.7,
            widthMinPixels: 1,
            rounded: false,
            shadowEnabled: false,
            searchFlag: this.searchEnabled ? 1.0 : 0.0,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 0, 255],
            // onHover: this.setHoverInfo,
          } as any)
        )

      if (this.settingsShowLayers.vehicles)
        layers.push(
          //@ts-ignore
          new MovingIconsLayer({
            autoHighlight: false,
            id: 'Vehicles',
            billboard: false,
            colorDepiction: ColorDepiction.VEH_OCCUPANCY,
            currentTime: this.simulationTime,
            data: this.paths,
            getPathStart: (d: any) => d.p0,
            getPathEnd: (d: any) => d.p1,
            getTimeStart: (d: any) => d.t0,
            getTimeEnd: (d: any) => d.t1,
            getColorCode: (d: any) => d.occ,

            // default vehicle icon is at x:256, y:0
            getBIconFrames: [256, 0, 256, 256],

            getSize: this.searchEnabled ? 36 : 16,
            highlightColor: [255, 0, 255, 255],
            iconAtlas: this.iconAtlas,
            iconMapping: ICON_MAPPING,
            latitudeCorrectionFactor: this.latitudeCorrectionFactor,
            iconMoving: 'vehicle',
            iconStill: 'circle',
            noAlloc: true,
            opacity: 1.0,
            parameters: { depthTest: false },
            pickable: true,
            positionFormat: 'XY',
            shadowEnabled: false,
            sizeScale: 1.0,
          })
        )

      if (this.settingsShowLayers.requests)
        layers.push(
          new DrtRequestLayer({
            id: 'DRT Requests',
            data: this.drtRequests,
            currentTime: this.simulationTime,
            getSourcePosition: (d: any) => [d[DRT_REQUEST.fromX], d[DRT_REQUEST.fromY]],
            getTargetPosition: (d: any) => [d[DRT_REQUEST.toX], d[DRT_REQUEST.toY]],
            getTimeStart: (d: any) => d[DRT_REQUEST.time],
            getTimeEnd: (d: any) => d[DRT_REQUEST.arrival],
            getSourceColor: [255, 0, 255],
            getTargetColor: [200, 255, 255],
            getWidth: 1,
            opacity: 0.5,
            searchFlag: this.searchEnabled ? 1.0 : 0.0,
          } as any)
        )

      return layers
    },

    latitudeCorrectionFactor() {
      // rotation factors are warped at high latitudes. Thanks, mercator
      const latitude =
        this.globalState.viewState.latitude ||
        (this.globalState.viewState.center && this.globalState.viewState.center[1]) ||
        35.0
      return Math.cos((latitude * Math.PI) / 180.0)
    },
  },

  watch: {
    layers() {
      this.deckOverlay?.setProps({
        layers: this.layers,
      })
    },

    dark() {
      const style = `${BASE_URL}map-styles/${this.dark ? 'dark' : 'positron'}.json`
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

  mounted() {
    const style = `${BASE_URL}map-styles/${this.dark ? 'dark' : 'positron'}.json`
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
      if (this.show3dBuildings && this.mymap) {
        enable3DBuildings(this.mymap)
      }

      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
        onClick: this.handleClick,
        getCursor: (c: any) => {
          return c.isHovering ? 'pointer' : 'grab'
        },
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
        this.tooltipHTML = ''
        return
      }

      let html = ''

      const vehicleId = this.vehicleLookup[object?.v]
      if (vehicleId) {
        html += `\
          <big><b>${vehicleId}</b></big><br/>
          <div>${this.locale !== 'en' ? 'Passagiere' : 'Pasengers'}
        `
      }
      this.tooltipStyle.top = `${y + 12}px`
      this.tooltipStyle.left = `${x + 12}px`
      this.tooltipHTML = html
    },

    handleClick(target: any) {
      this.tooltipStyle.display = 'none'
      if (this.onClick) this.onClick(target?.object?.v)
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
