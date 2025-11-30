<template lang="pug">
.hex-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-show="tooltipHTML" v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { ArcLayer } from '@deck.gl/layers'
import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { MapboxOverlay } from '@deck.gl/mapbox'
import colormap from 'colormap'
import maplibregl from 'maplibre-gl'

import globalStore from '@/store'
import { NewRowCache } from './CsvGzipParser.worker'
import BackgroundLayers from '@/js/BackgroundLayers'

const BASE_URL = import.meta.env.BASE_URL

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

export default defineComponent({
  name: 'XYHexMapComponent',
  props: {
    viewId: { type: Number, required: true },
    colorRamp: { type: String, required: true },
    coverage: { type: Number, required: true },
    dark: { type: Boolean, required: true },
    data: { type: Object as PropType<NewRowCache>, required: true },
    extrude: { type: Boolean, required: true },
    highlights: { type: Array, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    maxHeight: { type: Number, required: true },
    metric: { type: String, required: true },
    radius: { type: Number, required: true },
    selectedHexStats: { type: Object, required: false },
    upperPercentile: { type: Number, required: true },
    onClick: { type: Function, required: true },
    agg: { type: Number, required: true },
    group: { type: String, required: true },
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
        zIndex: 2,
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
      const style = `${BASE_URL}map-styles/${this.dark ? 'dark' : 'positron'}.json`
      this.mymap?.setStyle(style)
    },

    'globalState.viewState'() {
      if (this.mapIsIndependent) return
      if (!this.mymap) return

      const incoming = this.globalState.viewState as any
      const center = this.mymap?.getCenter() as any
      if (
        incoming.longitude !== center.lng ||
        incoming.latitude !== center.lat ||
        incoming.zoom !== this.mymap?.getZoom() ||
        incoming.pitch !== this.mymap?.getPitch() ||
        incoming.bearing !== this.mymap?.getBearing()
      ) {
        try {
          this.mymap?.jumpTo(incoming)
        } catch (e) {
          console.warn('' + e)
        }
      }
    },
  },

  computed: {
    weightedRowData() {
      let rows = [] as any
      // is data filtered or not?
      if (this.highlights.length) {
        return this.highlights.map((h: any) => h[0])
      } else if (!this.data || !Object.keys(this.data).length) {
        return rows
      } else {
        const rowCache = this.data[this.group]
        return { length: rowCache.positions[this.agg].length / 2 }
      }
    },

    colors(): any[] {
      const c = colormap({
        colormap: this.colorRamp,
        nshades: 10,
        format: 'rba',
        alpha: 1,
      }).map((c: number[]) => [c[0], c[1], c[2]])
      if (!this.dark) c.reverse()
      return c.slice(1)
    },

    layers(): any[] {
      const rowCache = this.data[this.group]
      const config = this.highlights.length
        ? { getPosition: (d: any) => d }
        : {
            getPosition: (_: any, o: any) =>
              rowCache.positions[this.agg].slice(o.index * 2, o.index * 2 + 2),
          }

      // don't do the shading color think if we just have a few points
      const numPoints = rowCache?.positions[this.agg].length / 2 || 0
      let brightcolors = null
      if (numPoints < 10) brightcolors = this.colors.slice(4, 5)

      const layers = [] as any[]

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) layers.push(...extraLayers.layersBelow)

      layers.push(
        new ArcLayer({
          id: 'arc-layer',
          data: this.highlights,
          getSourcePosition: (d: any) => d[0],
          getTargetPosition: (d: any) => d[1],
          pickable: false,
          opacity: 0.4,
          getHeight: 0,
          getWidth: 1,
          getSourceColor: this.dark ? [144, 96, 128] : [192, 192, 240],
          getTargetColor: this.dark ? [144, 96, 128] : [192, 192, 240],
        })
      )

      const hexLayerProps = Object.assign(config, {
        id: 'hexlayer',
        data: this.weightedRowData,
        // beforeId: 'water',
        colorRange: brightcolors || this.colors, // his.dark ? this.colors.slice(1) : this.colors.reverse().slice(1), //
        coverage: 0.98, // this.coverage,
        autoHighlight: true,
        elevationRange: [0, this.maxHeight],
        elevationScale: 25,
        // elevationScale: rowCache?.length ? 25 : 0,
        extruded: this.extrude,
        gpuAggregation: false, // need to aggregation on cpu for list of points
        selectedHexStats: this.selectedHexStats,
        material,
        opacity: this.dark && this.highlights.length ? 0.6 : 0.8,
        pickable: true,
        pickingRadius: 2,
        positionFormat: 'XY',
        radius: this.radius,
        upperPercentile: this.upperPercentile,
        updateTriggers: {
          // getElevationWeight: [this.group, this.agg],
          // getColorWeight: [this.group, this.agg],
        },
        transitions: {
          elevationScale: { type: 'interpolation', duration: 1000 },
          opacity: { type: 'interpolation', duration: 200 },
        },
        onHover: this.getTooltip,
      }) as any

      layers.push(new HexagonLayer(hexLayerProps))

      // ON-TOP layers
      if (extraLayers) layers.push(...extraLayers.layersOnTop)

      return layers
    },
  },

  mounted() {
    const style = `${BASE_URL}map-styles/${this.dark ? 'dark' : 'positron'}.json`
    const container = `map-${this.viewId}`
    const view = this.globalState.viewState
    //@ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      ...view,
    })

    //@ts-ignore
    this.mymap.on('style.load', () => {
      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
        onClick: this.handleClick,
      })
      this.mymap?.addControl(this.deckOverlay)
    })

    //@ts-ignore
    this.mymap?.on('move', () => {
      const center = this.mymap?.getCenter() as any
      const view = {
        // center: [center.lng, center.lat],
        latitude: center.lat,
        longitude: center.lng,
        zoom: this.mymap?.getZoom(),
        bearing: this.mymap?.getBearing(),
        pitch: this.mymap?.getPitch(),
        jump: true,
      }
      globalStore.commit('setMapCamera', view)
    })
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    getTooltip(tip: { x: number; y: number; object: any }) {
      const { x, y, object } = tip

      if (!object || !object.position || !object.position.length) {
        this.tooltipStyle.display = 'none'
        return
      }

      const lat = object.position[1]
      const lng = object.position[0]
      const count = object.pointIndices.length
      const html = `\
        <b>${this.highlights.length ? 'Count' : this.metric}: ${count} </b><br/>
        ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
        Number.isFinite(lng) ? lng.toFixed(4) : ''
      }
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
.hex-map {
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
  z-index: 0;
  pointer-events: none;
}
</style>
