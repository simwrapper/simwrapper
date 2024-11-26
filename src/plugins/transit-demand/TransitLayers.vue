<template lang="pug">
.geomap(:id="mapID")
</template>

<script lang="ts">
import { Deck, MapView } from '@deck.gl/core'
import { BASEMAP } from '@deck.gl/carto'
import { Map, NavigationControl } from 'maplibre-gl'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer, SolidPolygonLayer, LineLayer, GeoJsonLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'

import { colorToRGB } from '@/js/ColorsAndWidths'
import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

export interface PieInfo {
  center: number[]
  radius: number
  slices: { value: number; color: string | number[] }[]
}

export default {
  name: 'transit-layers',
  props: {
    viewId: Number,
    links: { type: Array, required: true },
    selectedFeatures: { type: Array, required: true },
    stopMarkers: { type: Array, required: true },
    // mapIsIndependent: { type: Boolean, required: true },
    pieSlider: { type: Number, required: true },
    widthSlider: { type: Number, required: true },
  },

  data() {
    return {
      map: null as any,
      deck: null as null | DeckOverlay,
      deckOverlay: null as any,
      mapID: 'mapID',
    }
  },

  watch: {
    allLayers() {
      if (this.deck) this.deck.setProps({ layers: this.allLayers })
    },
  },

  computed: {
    isDark() {
      return globalStore.state.isDarkMode
    },

    allSlices() {
      // No boarding data? no pies.
      const markers = this.stopMarkers as any[]
      if (!markers.length || !('boardings' in markers[0])) return []

      // First generate the pie chart data for each pie
      const fullPies = this.stopMarkers.map((stop: any) => {
        return {
          center: stop.xy,
          radius: 0.00001 * this.pieSlider * Math.sqrt(stop.boardings + stop.alightings),
          slices: [
            { label: 'boardings', color: 'gold', value: stop.boardings },
            { label: 'alightings', color: 'darkmagenta', value: stop.alightings },
          ],
        }
      })
      // Generate the individual slices of every pie
      const individualSlices = this.calculatePieSlicePaths(fullPies)
      return individualSlices
    },

    // new line data -- Vue doesn't want internal so we have to do copies
    lineSegments() {
      const linedata = this.links.map((feature: any) => {
        return {
          source: [...feature.geometry.coordinates[0], feature.properties.sort],
          target: [...feature.geometry.coordinates[1], feature.properties.sort],
          color: feature.properties.currentColor,
          width: feature.properties.width,
        }
      })
      return linedata
    },

    allLayers() {
      const layers = []
      // ---------- Transit route segments
      if (this.lineSegments.length)
        layers.push(
          new LineLayer({
            id: 'linkLayer',
            data: this.lineSegments,
            getSourcePosition: (d: any) => d.source,
            getTargetPosition: (d: any) => d.target,
            getColor: (d: any) => d.color,
            getWidth: (d: any) => d.width,
            widthUnits: 'pixels',
            widthScale: this.widthSlider / 50,
            widthMinPixels: 1.5,
            widthMaxPixels: 50,
            pickable: true,
            opacity: 1,
            autoHighlight: false,
            // offsetDirection: OFFSET_DIRECTION.RIGHT,
            parameters: { depthTest: true }, // need this for proper highlighting
            transitions: {
              getColor: 200,
              getWidth: 200,
            },
          })
        )

      // ---------- Pie slices
      if (this.allSlices.length)
        layers.push(
          new SolidPolygonLayer({
            id: `stop-pie-charts-layer-${Math.random()}`,
            data: this.allSlices,
            getPolygon: (d: any) => d.polygon,
            getFillColor: (d: any) => d.color,
            stroked: false,
            filled: true,
            pickable: true,
            opacity: 1,
            sizeScale: 1,
            autoHighlight: false,
            parameters: { depthTest: false },
          })
        )

      // ---------- YELLOW Highlight Lines
      if (this.selectedFeatures.length)
        layers.push(
          new GeoJsonLayer({
            id: 'selected-links',
            data: this.selectedFeatures,
            getLineColor: colorToRGB(this.isDark ? '#fbff66' : '#ccff66'),
            getLineWidth: 1,
            lineWidthUnits: 'pixels',
            stroked: true,
            filled: false,
            pickable: false,
            opacity: 1,
            autoHighlight: false,
            // offsetDirection: OFFSET_DIRECTION.RIGHT,
            parameters: { depthTest: false },
          })
        )

      return layers
    },
  },

  beforeDestroy() {
    console.log('###DIESTRY')
    this.map.off('move', this.syncMapCamera)
    if (this.deck) {
      this.deck.setProps({ layers: [] })
      this.deck.finalize()
    }
    this.map.remove()
  },

  mounted() {
    this.initMap()
  },

  methods: {
    syncMapCamera() {
      if (!this.map || !this.deck) return

      const center = this.map.getCenter()
      this.deck.setProps({
        pickingRadius: 3,
        parameters: { blend: false },
        getCursor: ({ isDragging, isHovering }: any) =>
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab',
        viewState: {
          longitude: center.lng,
          latitude: center.lat,
          zoom: this.map.getZoom(),
          pitch: this.map.getPitch(),
          bearing: this.map.getBearing(),
        },
      })
    },

    initMap() {
      this.map = new Map({
        container: `${this.mapID}`,
        style: BASEMAP.POSITRON_NOLABELS, // DARK_MATTER_NOLABELS,
        interactive: true,
        center: [13.45, 52.5],
        zoom: 9,
      })

      // keep map in sync
      this.map.on('move', this.syncMapCamera)
      this.deck = new DeckOverlay({})
      this.map.addControl(this.deck)
    },

    calculatePieSlicePaths(pies: PieInfo[], scl?: number) {
      const polygons = []

      const scalingFactor = scl || 0.05

      // loop on each piechart ------
      for (const piechart of pies) {
        const { center, radius, slices } = piechart
        const width = radius * scalingFactor

        let startAngle = Math.PI / 2
        let endAngle = startAngle
        const curviness = 48

        // lat/long are only perfectly symmetric at the equator. This makes the circles round
        const roundnessRatio = Math.cos((center[1] * Math.PI) / 180)

        // user values might not add to 1.000...
        const total = slices.reduce((a, b) => a + b.value, 0)

        slices.forEach(slice => {
          //@ts-ignore
          slice.percent = slice.value / total
        })

        // for tooltip
        const tooltipValues = slices.reduce((obj, slice) => {
          //@ts-ignore
          obj[slice.label] = slice.value
          return obj
        }, {} as any)

        // background circle (we can't use lineWidth because of the internal pie slice lines)
        const bgCircle = []
        const bgWidth = width * 1.02
        for (let i = 0; i <= curviness * 2; i++) {
          endAngle = startAngle + (i / (curviness * 2)) * Math.PI * 2
          bgCircle.push([
            center[0] + (bgWidth * Math.cos(endAngle)) / roundnessRatio,
            center[1] + bgWidth * Math.sin(endAngle),
          ])
        }
        const isDark = globalStore.state.isDarkMode

        polygons.push([
          {
            polygon: bgCircle,
            color: colorToRGB(isDark ? 'black' : 'white'),
            width: width + 1e-5, // to fix firefox sort
            values: tooltipValues,
          },
        ])

        // loop on each slice --------------
        const vertices = slices.map(slice => {
          // start at center
          const polygon = [center]

          for (let i = 0; i <= curviness; i++) {
            // @ts-ignore
            const percent = slice.percent || 0
            endAngle = startAngle + (i / curviness) * percent * Math.PI * 2
            polygon.push([
              center[0] + (width * Math.cos(endAngle)) / roundnessRatio,
              center[1] + width * Math.sin(endAngle),
            ])
          }
          polygon.push(center)
          startAngle = endAngle

          // convert css colors to rgb[]
          const color = Array.isArray(slice.color) ? slice.color : colorToRGB(slice.color)
          return { polygon, color, width, values: tooltipValues }
        })
        polygons.push(vertices)
      }
      const flat = polygons.flat()

      // small pies on top!
      flat.sort((a, b) => (a.width <= b.width ? 1 : -1))
      return flat
    },
  },
}
</script>

<style scoped lang="scss">
.geomap {
  pointer-events: auto;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 1;
}
</style>
