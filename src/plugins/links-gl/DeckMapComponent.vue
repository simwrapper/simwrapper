<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { LineLayer } from '@deck.gl/layers'
import { COORDINATE_SYSTEM } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'
import { format } from 'mathjs'

import globalStore from '@/store'
import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'
import { DataTableColumn, LookupDataset, DataType } from '@/Globals'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'LinksglDeckMapComponent',
  props: {
    viewId: { type: Number, required: true },
    dark: { type: Boolean, required: true },
    mapIsIndependent: { type: Boolean, required: true },
    links: {
      type: Object as PropType<{ source: Float32Array; dest: Float32Array }>,
      required: true,
    },
    colorRampType: { type: Number, required: true },
    build: { type: Object as PropType<LookupDataset>, required: true },
    base: { type: Object as PropType<LookupDataset>, required: true },
    widths: { type: Object as PropType<LookupDataset> },
    widthsBase: { type: Object as PropType<LookupDataset>, required: true },
    newColors: { type: Uint8Array as PropType<Uint8Array>, required: true },
    newWidths: { type: Float32Array as PropType<Float32Array>, required: true },
    projection: { type: String },
    scaleWidth: { type: Number, required: true },
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
      }.json`
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
    widthDivisor() {
      return this.scaleWidth ? 1 / this.scaleWidth : 0
    },

    buildColumn() {
      return this.build?.dataTable[this.build.activeColumn]
    },

    baseColumn() {
      return this.base?.dataTable[this.base.activeColumn]
    },

    widthColumn() {
      return this.widths?.dataTable[this.widths.activeColumn]
    },

    isCategorical() {
      return this.colorRampType === 0 || this.buildColumn?.type == DataType.STRING
    },

    layers(): any[] {
      // Atlantis is pre-converted now in the RoadNetworkLoader to lng/lat
      // projection == 'Atlantis' ? COORDINATE_SYSTEM.METER_OFFSETS : COORDINATE_SYSTEM.DEFAULT
      const coordinateSystem = COORDINATE_SYSTEM.DEFAULT

      //@ts-ignore
      const layer = new LineOffsetLayer({
        id: 'linkLayer',
        data: {
          length: this.links.source.length / 2,
          attributes: {
            getSourcePosition: { value: this.links.source, size: 2 },
            getTargetPosition: { value: this.links.dest, size: 2 },
            getColor: { value: this.newColors, size: 4 },
            getWidth: { value: this.newWidths, size: 1 },
          },
        },
        widthUnits: 'pixels',
        widthScale: this.widthDivisor,
        widthMinPixels: 0.25,
        widthMaxPixels: 50,
        pickable: true,
        coordinateSystem,
        opacity: 1,
        autoHighlight: true,
        highlightColor: [255, 0, 224],
        offsetDirection: OFFSET_DIRECTION.RIGHT,
        onHover: this.getTooltip,
        updateTriggers: {
          getSourcePosition: [this.links.source],
          getTargetPosition: [this.links.dest],
          getColor: [this.newColors, this.dark],
          getWidth: [this.newWidths],
        },
        transitions: {
          getColor: 250,
          getWidth: 250,
          widthScale: 250,
        },
        parameters: {
          depthTest: false,
        } as any,
      })

      const showBackgroundMap = this.projection && this.projection !== 'Atlantis'

      return [layer]
    },
  },

  async mounted() {
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
    buildTooltipHtml(columnBuild: DataTableColumn, columnBase: DataTableColumn, geoOffset: number) {
      try {
        if (!columnBuild) return null

        const index = this.build.csvRowFromLinkRow[geoOffset]
        let value = columnBuild.values[index]

        if (this.isCategorical) {
          if (!Number.isFinite(value)) return null
          return `<b>${columnBuild.name}</b><p>${this.precise(value)}</p>`
        }

        let html = null

        if (Number.isFinite(value))
          html = `<b>${columnBuild.name}</b><p>Value: ${this.precise(value)}</p>`

        const baseIndex = this.base?.csvRowFromLinkRow[geoOffset]
        if (baseIndex) {
          let baseValue = this.base ? this.base.dataTable[columnBase.name].values[baseIndex] : null
          let diff = value - baseValue
          if (Number.isFinite(baseValue)) {
            html += `<p>Base: ${this.precise(baseValue)}</p>`
            html += `<p>+/- Base: ${this.precise(diff)}</p>`
          }
        }

        return html
      } catch (e) {
        return null
      }
    },

    getTooltip({ x, y, object, index }: { x: number; y: number; object: any; index: number }) {
      // tooltip will show values for color settings and for width settings.
      // if there is base data, it will also show values and diff vs. base for both color and width.

      try {
        // tooltip color values ------------
        let tooltip = this.buildTooltipHtml(this.buildColumn, this.baseColumn, index)

        // tooltip widths------------
        if (this.widthColumn && this.widthColumn.name !== this.buildColumn.name) {
          const widthTip = this.buildTooltipHtml(
            this.widthColumn,
            this.widthsBase.dataTable[this.widthsBase.activeColumn],
            index
          )
          if (widthTip) tooltip = tooltip ? tooltip + widthTip : widthTip
        }

        this.tooltipHTML = tooltip || ''
        this.tooltipStyle = {
          top: `${y + 12}px`,
          left: `${x + 12}px`,
        }
      } catch (e) {
        console.warn(e)
        return null
      }
    },

    precise(x: number) {
      return format(x, { lowerExp: -6, upperExp: 6, precision: 5 })
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
  background-color: var(--bgPanel);
  padding: 0.5rem 0.5rem;
  filter: drop-shadow(2px 4px 6px #00000060);
  line-height: 1.3rem;
}
</style>
