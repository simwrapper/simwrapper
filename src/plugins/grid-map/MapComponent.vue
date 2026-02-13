<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-show="tooltipHTML" v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { GridCellLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import { debounce } from 'debounce'

import globalStore from '@/store'
import { CompleteMapData } from './GridMap.vue'
import BackgroundLayers from '@/js/BackgroundLayers'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'

const BASE_URL = import.meta.env.BASE_URL

type TooltipStyle = {
  color: string
  backgroundColor: string
  top: string
  left: string
}

type Tooltip = {
  html: string
  style: TooltipStyle
} | null

export default defineComponent({
  name: 'MyDeckComponent',
  props: {
    viewId: { type: Number, required: true },
    dark: { type: Boolean, required: true },
    data: { type: Object as PropType<CompleteMapData>, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    colorRamp: { type: String, required: true },
    colorDataDigits: { type: Number, required: true },
    negativeValues: { type: Boolean, required: true },
    currentTimeIndex: { type: Number, required: true },
    maxHeight: { type: Number, required: true },
    cellSize: { type: Number, required: true },
    opacity: { type: Number, required: true },
    upperPercentile: { type: Number, required: true },
    cbTooltip: { type: Function, required: true },
    onClick: { type: Function, required: false },
    bgLayers: { type: Object as PropType<BackgroundLayers> },
    show3dBuildings: { type: Boolean, required: false, default: false },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      clearTooltip: null as any,
      tooltipHTML: '',
      tooltipStyle: {
        padding: '4px 8px',
        display: 'block',
        top: 0,
        left: 0,
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
      const style = `${BASE_URL}map-styles/${
        this.globalState.isDarkMode ? 'dark' : 'positron'
      }.json` as any
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
    rowData() {
      return this.data
    },

    layers(): any[] {
      const layers = []

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) layers.push(...extraLayers.layersBelow)

      // disable 3D if there are negative values, even if user asked for it
      const use3D = this.maxHeight > 0 && !this.negativeValues

      layers.push(
        new GridCellLayer({
          id: 'gridlayer',
          data: {
            length: this.data.mapData[this.currentTimeIndex].length,
            attributes: {
              getPosition: { value: this.data.mapData[this.currentTimeIndex].centroid, size: 2 },
              getFillColor: {
                value: this.data.mapData[this.currentTimeIndex].colorData,
                size: this.colorDataDigits,
              },
              // doesn't allow elevation to work if negative values are present. Will think of a better solution for this. - Brendan 15.05.2025
              getElevation: this.negativeValues
                ? { value: null }
                : { value: this.data.mapData[this.currentTimeIndex].values, size: 1 },
            },
          } as any,
          autoHighlight: true,
          beforeId: use3D ? undefined : 'water',
          cellSize: this.cellSize,
          elevationRange: [0, this.maxHeight],
          elevationScale: this.maxHeight,
          extruded: use3D,
          highlightColor: [255, 255, 255, 128],

          material: {
            ambient: 0.64,
            diffuse: 0.6,
            shininess: 32,
            specularColor: [51, 51, 51],
          },

          onHover: this.getTooltip as any,
          opacity: this.opacity,
          // { depthTest }  fixes the z-fighting problem but makes some issues with the opacity...
          parameters: {},
          pickable: true,
          transitions: { elevationScale: { type: 'interpolation', duration: 50 } },
          upperPercentile: this.upperPercentile,
        })
      )

      // ON-TOP layers
      if (extraLayers) layers.push(...extraLayers.layersOnTop)

      return layers
    },
  },

  mounted() {
    this.clearTooltip = debounce(() => {
      this.tooltipHTML = ''
    }, 2000)

    const style = `${BASE_URL}map-styles/${
      this.globalState.isDarkMode ? 'dark' : 'positron'
    }.json` as any

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    //@ts-ignore
    this.mymap = new maplibregl.Map({
      center,
      zoom: 9,
      container,
      style,
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
      })
      this.mymap?.addControl(this.deckOverlay)
    })
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    getTooltip(object: any) {
      if (!object?.coordinate) {
        this.tooltipHTML = ''
        return null
      }

      const currentData = this.data.mapData[this.currentTimeIndex]?.values
      if (!currentData) return null
      if (object.index == null || object.index < 0 || object.index >= currentData.length)
        return null
      if (!Number.isFinite(currentData[object.index])) return null

      const [lng, lat] = object.coordinate // Koordinaten (Längengrad, Breitengrad)
      const rawValue = currentData[object.index]
      const value = rawValue / (this.data.scaledFactor as number)
      const roundedValue = Number(value.toFixed(6))
      const unit = this.data.unit

      const latDisplay = Number.isFinite(lat) ? lat.toFixed(4) : ''
      const lngDisplay = Number.isFinite(lng) ? lng.toFixed(4) : ''

      const tooltipHtml = `<b>${roundedValue} ${unit}</b><br/>${latDisplay} / ${lngDisplay}<br/>
    `
      this.tooltipStyle.display = 'block'
      this.tooltipStyle.top = `${12 + Math.floor(object.y)}px`
      this.tooltipStyle.left = `${12 + Math.floor(object.x)}px`
      this.tooltipHTML = tooltipHtml

      // will clear after 2s
      this.clearTooltip()
    },

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

    handleClick(target: any, event: any) {
      this.tooltipHTML = ''
      if (this.onClick) this.onClick(target, event)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.deck-map {
  position: relative;
  width: 100%;
  height: 100%;
}

.map-container {
  position: absolute;
  inset: 0 0 0 0;
}

.deck-tooltip {
  background-color: var(--bgPanel);
  color: var(--text);
  position: absolute;
  top: 0;
  left: 0;
  z-index: 2;
  pointer-events: none;
  filter: $filterShadow;
}
</style>
