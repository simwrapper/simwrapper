<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  .deck-tooltip(v-if="tooltipHTML" v-html="tooltipHTML" :style="tooltipStyle")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { LineLayer, GeoJsonLayer, SolidPolygonLayer } from '@deck.gl/layers'
import { color } from 'd3-color'
import { COORDINATE_SYSTEM } from '@deck.gl/core'

import globalStore from '@/store'
import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'

export interface PieInfo {
  center: number[]
  radius: number
  slices: { value: number; color: string | number[] }[]
}

export interface PtLine {
  name: string
  a: number
  b: number
}

export default defineComponent({
  name: 'TransitDeckComponent',
  props: {
    handleClickEvent: { type: Function, required: true },
    isAtlantis: { type: Boolean, required: true },
    links: { type: Object, required: true },
    // mapIsIndependent: { type: Boolean, required: true },
    pieSlider: { type: Number, required: true },
    selectedFeatures: { type: Array as PropType<any[]>, required: true },
    stopMarkers: { type: Array as PropType<any[]>, required: true },
    transitLines: { type: Object as PropType<{ [id: string]: any }>, required: true },
    viewId: { type: Number, required: true },
    vizDetails: { type: Object, required: true },
    widthSlider: { type: Number, required: true },
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
      this.deckOverlay.setProps({
        layers: this.layers,
      })
    },

    'globalState.isDarkMode'() {
      let style
      if (this.isAtlantis) {
        style = { version: 8, sources: {}, layers: [] }
      } else {
        style = `/map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json` as any
      }
      this.mymap?.setStyle(style)
    },

    'globalState.viewState'() {
      const incoming = this.globalState.viewState as any
      const center = this.mymap?.getCenter() as any
      if (
        incoming.longitude !== center.lng ||
        incoming.latitude !== center.lat ||
        incoming.zoom !== this.mymap?.getZoom() ||
        incoming.pitch !== this.mymap?.getPitch() ||
        incoming.bearing !== this.mymap?.getBearing()
      ) {
        console.log(incoming.zoom, incoming.longitude, incoming.latitude, incoming.center)
        this.mymap?.jumpTo(
          Object.assign({ center: { lng: incoming.longitude, lat: incoming.latitude } }, incoming)
        )
      }
    },
  },

  computed: {
    dark() {
      return this.globalState.isDarkMode
    },

    locale() {
      return this.globalState.locale
    },

    hasBackgroundMap() {
      return !this.isAtlantis
    },

    power() {
      return 1 - (100 - this.widthSlider) / 100
    },

    scale() {
      return 1 // what is this actually??
    },

    data() {
      const linestrings = this.links.features.map((feature: any) => {
        return {
          source: [...feature.geometry.coordinates[0], feature.properties.sort],
          target: [...feature.geometry.coordinates[1], feature.properties.sort],
          color: feature.properties.currentColor,
          width: Math.pow(feature.properties.width, this.power),
        }
      })
      return linestrings
    },

    slices() {
      if (!this.vizDetails?.demand) return []

      // no boarding data? no pies.
      if (!this.stopMarkers.length || this.stopMarkers[0].boardings == undefined) return []

      // too many pies? show no pies.
      if (this.stopMarkers.length > 10000) return []

      const fullPies = this.stopMarkers.map(stop => {
        let selectedLineStopBoardingsCount = 0
        let selectedLineStopAlightingsCount = 0

        const stopPTLines = stop.ptLines as any
        if (stopPTLines) {
          Object.values(stopPTLines).forEach((stopLine: any) => {
            const selectedPtLine = this.transitLines[stopLine.name]
            if (selectedPtLine) {
              selectedLineStopBoardingsCount += stopLine.b
              selectedLineStopAlightingsCount += stopLine.a
            }
          })
        }

        return {
          center: stop.xy,
          radius:
            0.00002 *
            this.pieSlider *
            Math.sqrt(selectedLineStopBoardingsCount + selectedLineStopAlightingsCount),
          slices: [
            { label: 'boardings', color: 'gold', value: selectedLineStopBoardingsCount },
            { label: 'alightings', color: 'darkmagenta', value: selectedLineStopAlightingsCount },
          ],
        }
      })
      const individualSlices = this.calculatePieSlicePaths(fullPies)
      return individualSlices
    },

    layers() {
      const layers = []

      // TRANSIT LINKS
      layers.push(
        //@ts-ignore
        new LineOffsetLayer({
          id: 'linkLayer',
          data: this.data,
          getSourcePosition: (d: any) => d.source,
          getTargetPosition: (d: any) => d.target,
          getColor: (d: any) => d.color,
          getWidth: (d: any) => d.width,
          widthUnits: 'pixels',
          widthScale: this.scale, // 1.0, // widthSlider,
          widthMinPixels: 1,
          coordinateSystem: COORDINATE_SYSTEM.DEFAULT,
          widthMaxPixels: 100,
          pickable: true,
          opacity: 1,
          antialiasing: true,
          autoHighlight: false,
          offsetDirection: OFFSET_DIRECTION.RIGHT,
          parameters: { depthTest: true },
          transitions: {
            getColor: 200,
            getWidth: 200,
          },
        })
      )

      // YELLOW HIGHLIGHT LINES ---------
      if (this.selectedFeatures.length)
        layers.push(
          new GeoJsonLayer({
            id: 'selected-links',
            data: this.selectedFeatures,
            getLineColor: this.colorToRGB(this.dark ? '#fbff66' : '#ccff66'),
            getLineWidth: 1,
            lineWidthUnits: 'pixels',
            stroked: true,
            filled: false,
            pickable: false,
            opacity: 1,
            coordinateSystem: COORDINATE_SYSTEM.DEFAULT,
            autoHighlight: false,
            offsetDirection: OFFSET_DIRECTION.RIGHT,
            parameters: { depthTest: true },
          })
        )

      // PIE CHARTS
      layers.push(
        new SolidPolygonLayer({
          id: `stop-pie-charts-layer-${this.pieSlider}-${this.stopMarkers.length}`,
          data: this.slices,
          getPolygon: (d: any) => d.polygon,
          getFillColor: (d: any) => d.color,
          stroked: false,
          filled: true,
          pickable: true,
          extruded: false,
          opacity: 1,
          sizeScale: 1,
          autoHighlight: false,
          parameters: { depthTest: true },
        })
      )

      return layers
    },
  },

  mounted() {
    let style
    if (this.isAtlantis) {
      style = { version: 8, sources: {}, layers: [] }
    } else {
      style = `/map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json` as any
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
        interleaved: false,
        useDevicePixels: true,
        layers: this.layers,
        pickingRadius: 2,
        onClick: this.handleClick,
        onHover: this.getTooltip,
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
            color: this.colorToRGB(isDark ? 'black' : 'white'),
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
          const color = Array.isArray(slice.color) ? slice.color : this.colorToRGB(slice.color)
          return { polygon, color, width, values: tooltipValues }
        })
        polygons.push(vertices)
      }
      const flat = polygons.flat()

      // small pies on top!
      flat.sort((a, b) => (a.width <= b.width ? 1 : -1))
      return flat
    },

    colorToRGB(colorString: string) {
      try {
        const rgb = color(colorString)
        if (!rgb) return [0, 0, 0]
        // d3.color provides r, g, b properties directly
        return [rgb.r, rgb.g, rgb.b] as number[]
      } catch (error) {
        return [0, 0, 0]
      }
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

    getTooltip(tip: any) {
      if (tip.index == -1) {
        this.tooltipHTML = ''
        return
      }

      const { x, y, index, object, layer } = tip

      if (index == -1) return
      if (!object) return

      // ---------------
      if (layer.id.startsWith('stop-pie-charts-layer')) {
        let html = '<div class="map-popup">'
        const { boardings, alightings } = object.values
        object.values.total = boardings + alightings
        for (const [label, value] of Object.entries(object.values)) {
          html += `
        <div style="display: flex">
          <div>${label}:&nbsp;&nbsp;</div>
          <b style="margin-left: auto; text-align: right">${value}</b>
        </div>`
        }
        html += '</div>'

        this.tooltipHTML = html
        this.tooltipStyle = {
          top: y + 'px',
          left: x + 'px',
        }
      }

      // ---------------
      const metrics = [
        { field: 'pax', name_en: 'Passengers', name_de: 'Passagiere' },
        { field: 'departures', name_en: 'Departures', name_de: 'Abfahrten' },
        { field: 'cap', name_en: 'Capacity', name_de: 'Kapazität' },
        { field: 'loadfac', name_en: 'Load factor', name_de: 'Load factor' },
      ]

      try {
        let html = '<div class="map-popup">'

        const props = this.links.features[index].properties

        // no tooltip if greyed out link
        if (props.sort == 0) return null

        for (const metric of metrics) {
          let label = this.locale == 'de' ? metric.name_de : metric.name_en
          label = label.replaceAll(' ', '&nbsp;')

          if (Number.isFinite(props[metric.field]))
            html += `
            <div style="display: flex">
              <div>${label}:&nbsp;&nbsp;</div>
              <b style="margin-left: auto; text-align: right">${props[metric.field]}</b>
            </div>`
        }

        html += '</div>'
        this.tooltipHTML = html
        this.tooltipStyle = {
          top: y + 'px',
          left: x + 'px',
        }
      } catch (e) {
        // weird, no
        this.tooltipHTML = ''
        return null
      }
    },

    handleClick(event: any) {
      console.log('click!')
      if (this.handleClickEvent) this.handleClickEvent(event)
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
  color: var(--text);
  padding: 0.5rem 0.5rem;
  font-size: 0.9rem;
}
</style>
