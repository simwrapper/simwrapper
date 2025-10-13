<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { GridCellLayer } from '@deck.gl/layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import colormap from 'colormap'

import globalStore from '@/store'
import { CompleteMapData } from './GridMap.vue'
import BackgroundLayers from '@/js/BackgroundLayers'

const BASE_URL = import.meta.env.BASE_URL

type TooltipStyle = {
  color: string
  backgroundColor: string
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
      const style = `${BASE_URL}map-styles/${
        this.globalState.isDarkMode ? 'dark' : 'positron'
      }.json` as any
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
    colors(): any[] {
      const c = colormap({
        colormap: this.colorRamp,
        nshades: 10,
        format: 'rba',
        alpha: 1,
      }).map((c: number[]) => [c[0], c[1], c[2]])
      return c
      // if (!this.dark) c.reverse()
      // return c.slice(1)
    },

    rowData() {
      return this.data
    },

    layers(): any[] {
      const layers = []

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) layers.push(...extraLayers.layersBelow)

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
          beforeId: this.maxHeight ? undefined : 'water',
          colorRange: this.dark ? this.colors.slice(1) : this.colors.reverse().slice(1),
          coverage: 1,
          autoHighlight: true,
          elevationRange: [0, this.maxHeight],
          elevationScale: this.maxHeight,
          pickable: true,
          opacity: this.opacity,
          cellSize: this.cellSize,
          upperPercentile: this.upperPercentile,
          material: false,
          transitions: {
            elevationScale: { type: 'interpolation', duration: 50 },
          },
          parameters: {
            // fixes the z-fighting problem but makes some issues with the opacity...
            // depthTest: false,
          },
        })
      )

      // ON-TOP layers
      if (extraLayers) layers.push(...extraLayers.layersOnTop)

      return layers
    },
  },

  mounted() {
    const style = `${BASE_URL}map-styles/${
      this.globalState.isDarkMode ? 'dark' : 'positron'
    }.json` as any

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    //@ts-ignore
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
      })
      this.mymap?.addControl(this.deckOverlay)
    })
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    getTooltip(object: any): Tooltip | undefined {
      if (!object?.coordinate) {
        if (this.cbTooltip) this.cbTooltip()
        return null
      }

      const currentData = this.data.mapData[this.currentTimeIndex]?.values
      if (!currentData || !currentData[object.index]) return null

      const [lng, lat] = object.coordinate // Koordinaten (Längengrad, Breitengrad)
      const rawValue = currentData[object.index]
      const value = rawValue / (this.data.scaledFactor as number)
      const roundedValue = Number(value.toFixed(6))
      const unit = this.data.unit

      const latDisplay = Number.isFinite(lat) ? lat.toFixed(4) : ''
      const lngDisplay = Number.isFinite(lng) ? lng.toFixed(4) : ''

      const tooltipHtml = `<b>${roundedValue} ${unit}</b><br/>${latDisplay} / ${lngDisplay}<br/>
    time value: ${this.data.mapData[this.currentTimeIndex].time}<br/>
    metric value: ${this.data.mapData[this.currentTimeIndex].values[object.index]}<br/>
    opacity value: ${this.data.mapData[this.currentTimeIndex].opacityValues[object.index]}
    `
      const tooltipStyle: TooltipStyle = this.dark
        ? { color: '#ccc', backgroundColor: '#2a3c4f' }
        : { color: '#223', backgroundColor: 'white' }

      const tip = {
        html: tooltipHtml,
        style: tooltipStyle,
      }

      if (this.cbTooltip) {
        this.cbTooltip(tip, object)
      } else {
        return tip
      }
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

    // getTooltip(tip: { x: number; y: number; object: any }) {
    //   const { x, y, object } = tip

    //   if (!object || !object.position || !object.position.length) {
    //     this.tooltipStyle.display = 'none'
    //     return
    //   }

    //   const lat = object.position[1]
    //   const lng = object.position[0]
    //   const html = `\
    //     <b>tooltip</b> \
    //   `
    //   this.tooltipStyle.display = 'block'
    //   this.tooltipStyle.top = `${y + 12}px`
    //   this.tooltipStyle.left = `${x + 12}px`
    //   this.tooltipHTML = html
    // },

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
