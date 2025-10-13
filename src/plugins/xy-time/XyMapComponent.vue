<template lang="pug">
.deck-map.flex-col
  .map-container(:id="viewId")
  .deck-tooltip(v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { DataFilterExtension } from '@deck.gl/extensions'
import ScatterplotColorBinsLayer from './ScatterplotColorBinsLayer'
import maplibregl from 'maplibre-gl'
import * as timeConvert from 'convert-seconds'

import globalStore from '@/store'
import BackgroundLayers from '@/js/BackgroundLayers'

const BASE_URL = import.meta.env.BASE_URL

const dataFilter = new DataFilterExtension({ filterSize: 1 })

export default defineComponent({
  name: 'MyDeckComponent',
  props: {
    viewId: { type: String, required: true },
    dark: { type: Boolean, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    onClick: { type: Function, required: false },
    timeFilter: { type: Array as PropType<number[]>, required: true },
    colors: { type: Array as PropType<number[][]>, required: true },
    breakpoints: { type: Array as PropType<number[]>, required: true },
    radius: { type: Number, required: true },
    bgLayers: { type: Object as PropType<BackgroundLayers> },
    pointLayers: {
      type: Array as PropType<
        {
          coordinates: Float32Array
          time: Float32Array
          color: Uint8Array
          value: Float32Array
          timeRange: number[]
        }[]
      >,
      required: true,
    },
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
      const style = `${BASE_URL}map-styles/${this.dark ? 'dark' : 'positron'}.json`
      this.mymap?.setStyle(style)
    },
  },

  computed: {
    layers(): any[] {
      const xlayers = [] as any[]

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) xlayers.push(...extraLayers.layersBelow)

      // add a scatterplotlayer for each set of points in pointLayers

      const pointLayers = this.pointLayers.map((points, layerIndex) => {
        // The entire layer can be hidden if all of its points
        // are beyond the timeFilter range that is being shown.
        const outOfRange =
          points.timeRange[0] > this.timeFilter[1] || points.timeRange[1] < this.timeFilter[0]

        //@ts-ignore
        return new ScatterplotColorBinsLayer({
          data: {
            length: points.time.length,
            attributes: {
              getPosition: { value: points.coordinates, size: 2 },
              getFilterValue: { value: points.time, size: 1 },
              getValue: { value: points.value, size: 1 },
            },
          },
          autoHighlight: true,
          breakpoints: this.breakpoints,
          colors: this.colors,
          extensions: [dataFilter],
          id: `scatterplot-${layerIndex}`,
          filled: true,
          filterRange: this.timeFilter.length ? this.timeFilter : null,
          getRadius: this.radius,
          highlightColor: [255, 255, 255, 192],
          opacity: 1,
          parameters: { depthTest: false } as any,
          pickable: true,
          radiusScale: 1,
          stroked: false,
          updateTriggers: {
            getPosition: this.pointLayers,
            getFillColor: this.pointLayers,
            getFilterValue: this.timeFilter,
            getValue: [this.colors],
          },
          // hide layers that are entirely outside the time window filter:
          visible: !outOfRange,
        } as any)
      })

      xlayers.push(...pointLayers)

      // ON-TOP layers
      if (extraLayers) xlayers.push(...extraLayers.layersOnTop)

      return xlayers
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

  async mounted() {
    const style = `${BASE_URL}map-styles/${this.dark ? 'dark' : 'positron'}.json`
    const container = this.viewId
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
    convertSecondsToClockTimeMinutes(index: number) {
      const seconds = index

      try {
        const hms = timeConvert(seconds)
        const minutes = ('00' + hms.minutes).slice(-2)
        return `${hms.hours}:${minutes}`
      } catch (e) {
        return '00:00'
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

    getTooltip(element: any, click: boolean) {
      if (element.index < 0) return null

      const layerId = element?.layer?.id
      if (layerId === undefined) return null

      const time = this.pointLayers[layerId].time[element.index]
      const humanTime = this.convertSecondsToClockTimeMinutes(time)

      const value = this.pointLayers[layerId].value[element.index]
      const cleanValue = Math.round(1e6 * value) / 1e6
      return {
        html: `\
        <table style="font-size: 0.9rem">
        <tr>
          <td>Value</td>
          <td style="padding-left: 0.5rem;"><b>${cleanValue}</b></td>
        </tr><tr>
          <td style="text-align: right;">Time</td>
          <td style="padding-left: 0.5rem;"><b>${humanTime}</b></td>
        </tr>
        </table>
      `,
        style: this.dark
          ? { color: '#ccc', backgroundColor: '#2a3c4f' }
          : { color: '#223', backgroundColor: 'white' },
      }
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
