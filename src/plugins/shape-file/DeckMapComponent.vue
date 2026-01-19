<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import { GeoJsonLayer, LineLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import { MapboxOverlay } from '@deck.gl/mapbox'
import maplibregl from 'maplibre-gl'
import { rgb } from 'd3-color'

import globalStore from '@/store'
import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'
import GeojsonOffsetLayer from '@/layers/GeojsonOffsetLayer'
import Screenshots from '@/js/screenshots'
import BackgroundLayers from '@/js/BackgroundLayers'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'

const BASE_URL = import.meta.env.BASE_URL

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default defineComponent({
  name: 'GeojsonDeckComponent',
  props: {
    features: { type: Array },
    bgLayers: { type: Object as PropType<BackgroundLayers> },
    cbTooltip: { type: Function, required: true },
    cbClickEvent: { type: Function, required: true },
    dark: { type: Boolean, required: true },
    featureFilter: { type: Float32Array, required: true },
    fillColors: { type: [String, Uint8ClampedArray], required: true }, //  = '#59a14f' as string | Uint8Array,
    fillHeights: { type: [Number, Float32Array], required: true }, //  = 0 as number | Float32Array,
    highlightedLinkIndex: { type: Number },
    initialView: { type: Object },
    isRGBA: { type: Boolean, required: true },
    isAtlantis: { type: Boolean, required: true },
    lineColors: { type: [String, Uint8ClampedArray] }, //  = '#4e79a7' as string | Uint8Array,
    lineWidths: { type: [Number, Float32Array], required: true }, //  = 0 as number | Float32Array,
    mapIsIndependent: { type: Boolean, required: true },
    opacity: { type: Number, required: true },
    pointRadii: { type: [Number, Float32Array], required: true }, //  = 4 as number | Float32Array,
    redraw: { type: Number, required: true },
    screenshot: { type: Number, required: true },
    viewId: { type: Number, required: true },
    show3dBuildings: { type: Boolean, required: false, default: false },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      screenshotCount: this.screenshot,
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
    screenshot() {
      if (this.mymap && this.deckOverlay) {
        Screenshots.saveMapWithOverlay(this.mymap)
      }
    },

    layers() {
      if (!this.deckOverlay) return

      this.deckOverlay.setProps({
        layers: this.layers,
      })
    },

    dark() {
      let style: any
      if (this.hasBackgroundMap) {
        style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
      } else {
        style = { version: 8, sources: {}, layers: [] }
      }
      this.mymap?.setStyle(style)
    },

    show3dBuildings() {
      if (!this.mymap || !this.hasBackgroundMap) return
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
        const jump = Object.assign(
          { center: { lng: incoming.longitude, lat: incoming.latitude } },
          incoming
        )
        this.mymap?.jumpTo(jump)
      }
    },
  },

  computed: {
    isTakingScreenshot() {
      return this.screenshot > this.screenshotCount
    },

    isStroked() {
      return !!this.lineColors && this.lineWidths !== 0
    },

    hasBackgroundMap() {
      return !this.isAtlantis
    },

    cbFillColor() {
      let fillColor // can be callback OR a plain string in simple mode
      if (typeof this.fillColors == 'string') {
        // simple color mode
        const color = rgb(this.fillColors)
        fillColor = [color.r, color.g, color.b]
      } else {
        // array of colors
        fillColor = (_: any, o: DeckObject) => {
          if (this.isRGBA) {
            return [
              this.fillColors[o.index * 4 + 0], // r
              this.fillColors[o.index * 4 + 1], // g
              this.fillColors[o.index * 4 + 2], // b
              this.fillColors[o.index * 4 + 3], // a
            ]
          } else {
            return [
              this.fillColors[o.index * 3 + 0], // r
              this.fillColors[o.index * 3 + 1], // g
              this.fillColors[o.index * 3 + 2], // b
              255, // no opacity data
            ]
          }
        }
      }
      return fillColor
    },

    cbLineColor() {
      let lineColor // can be callback OR a plain string in simple mode
      if (typeof this.lineColors == 'string') {
        // simple color mode
        const color = rgb(this.lineColors)
        lineColor = [color.r, color.g, color.b]
        if (!this.isStroked) lineColor.push(0) // totally transparent
      } else {
        // array of colors
        lineColor = (_: any, o: DeckObject) => {
          if (!o?.index) return [0, 0, 0, 0]
          // if (f[o.index].properties._hide) return [0, 0, 0, 0]
          if (!this.lineColors) return [0, 0, 0, 0]
          return [
            this.lineColors[o.index * 3 + 0], // r
            this.lineColors[o.index * 3 + 1], // g
            this.lineColors[o.index * 3 + 2], // b
            255, // no opacity, for now
          ]
        }
      }
      return lineColor
    },

    cbLineWidth() {
      let lineWidth // can be callback OR a plain string in simple mode
      if (typeof this.lineWidths == 'number') {
        // simple width mode
        lineWidth = this.lineWidths
      } else {
        // array of widths
        lineWidth = (_: any, o: DeckObject) => {
          // this is what we really want
          //@ts-ignore
          return this.lineWidths[o.index]
        }
      }
      return lineWidth
    },

    cbPointRadius() {
      let pointRadius // can be callback OR a plain string in simple mode
      if (typeof this.pointRadii == 'number') {
        // simple radius mode
        pointRadius = this.pointRadii
      } else {
        pointRadius = (_: any, o: DeckObject) => {
          //@ts-ignore
          return this.pointRadii[o.index]
        }
      }
      return pointRadius
    },

    cbFillHeight() {
      let fillHeight // can be callback OR a plain string in simple mode
      if (typeof this.fillHeights == 'number') {
        // simple mode
        fillHeight = this.fillHeights
      } else {
        // array function
        fillHeight = (_: any, o: DeckObject) => {
          //@ts-ignore
          return this.fillHeights[o.index]
        }
      }
      return fillHeight
    },

    // ================= LAYERS ================

    lineLayers() {
      // POLYGON BORDER LAYER
      // The Deck.gl Path "tesselator" is painfully slow on large datasets and
      // re-tesselates on EVERY FRAME, gahh!!!!
      // Always turn off "stroke" on the Geojson layer, and build
      // our own polygon border using the LinkLayer instead.
      // Thick links will not smoothly "flow" around bends, but it's far far faster.

      // const { linksData, hasPolygons, filterValues } = useMemo(() => {
      // no strokes? no links. we're done
      if (!this.isStroked) return { linksData: [], hasPolygons: true }

      const linksData: any[] = []
      let hasPolygons = false

      const filterValues = [] as number[]

      const feat = this.features || ([] as any[])

      feat.forEach((feature, f) => {
        let coords
        switch (feature.geometry.type) {
          case 'Polygon':
            coords = feature.geometry.coordinates[0]
            hasPolygons = true
            break
          case 'MultiPolygon':
            coords = feature.geometry.coordinates[0][0]
            hasPolygons = true
            break
          case 'LineString':
            coords = feature.geometry.coordinates
            break
          case 'MultiLineString':
            coords = feature.geometry.coordinates[0]
            break
          case 'Point':
          case 'MultiPoint':
          default:
            hasPolygons = true
            return { linksData: [], hasPolygons } // no link data
        }

        if (!coords) {
          console.warn(`---Feature ${f + 1} has no coordinates:`)
          console.warn(feature)
          return { linksData: [], hasPolygons } // no link data
        }

        const hasColorData = !Array.isArray(this.cbLineColor)
        const hasWidthData = typeof this.cbLineWidth !== 'number'

        for (let i = 1; i < coords.length; i++) {
          const element = { path: [coords[i - 1], coords[i]] } as any
          //@ts-ignore
          if (hasColorData) element.color = this.cbLineColor(null, { index: f } as any)
          //@ts-ignore
          if (hasWidthData) element.width = this.cbLineWidth(null, { index: f } as any)
          element.feature_idx = f

          // filter values - duplicate filter 0/-1 for each coordinate
          if (this.featureFilter.length) filterValues.push(this.featureFilter[f])

          linksData.push(element)
        }
      })
      return { linksData, hasPolygons, filterValues }
    },

    layers() {
      const finalLayers = []

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) finalLayers.push(...extraLayers.layersBelow)

      // MAIN GEOJSON LAYER
      if (this.lineLayers.hasPolygons) {
        finalLayers.push(
          new GeojsonOffsetLayer({
            id: 'geoJsonOffsetLayer',
            beforeId: 'water',
            data: this.features,
            // function callbacks: --------------
            getLineWidth: this.cbLineWidth, // 0, // no borders
            getLineColor: this.cbLineColor,
            getFillColor: this.cbFillColor,
            getPointRadius: this.cbPointRadius,
            getElevation: this.cbFillHeight,
            // settings: ------------------------
            extruded: !!this.fillHeights,
            highlightedObjectIndex:
              this.highlightedLinkIndex == -1 ? null : this.highlightedLinkIndex,
            autoHighlight: true,
            highlightColor: [255, 255, 255, 160],
            lineWidthUnits: 'pixels',
            lineWidthScale: 1,
            lineWidthMinPixels: 0, //  typeof lineWidths === 'number' ? 0 : 1,
            lineWidthMaxPixels: 50,
            getOffset: OFFSET_DIRECTION.RIGHT,
            opacity: this.opacity,
            pickable: true,
            pointRadiusUnits: 'pixels',
            pointRadiusMinPixels: 2,
            // pointRadiusMaxPixels: 50,
            stroked: this.isStroked,
            // useDevicePixels: this.isTakingScreenshot,
            // fp64: false,
            // material: false,
            updateTriggers: {
              getFillColor: this.fillColors,
              getLineColor: this.lineColors,
              getLineWidth: this.lineWidths,
              getPointRadius: this.pointRadii,
              getElevation: this.fillHeights,
              getFilterValue: this.featureFilter,
            },
            transitions: {
              getFillColor: 300,
              getLineColor: 300,
              getLineWidth: 300,
              getPointRadius: 300,
            },
            parameters: {
              depthTest: !!this.fillHeights,
              fp64: false,
            },
            // filter shapes
            extensions: [new DataFilterExtension({ filterSize: 1 })],
            filterRange: [0, 1], // set filter to -1 to filter element out
            getFilterValue: (_: any, o: DeckObject) => {
              return this.featureFilter[o.index]
            },
          }) as any
        )
      }

      // --------- LINE LAYER -- on top of main Geojson layer
      if (this.isStroked) {
        // if useMemo did some filter processing, use the new filter values
        const theFilter = this.lineLayers.filterValues || this.featureFilter
        const lineLayer = typeof this.cbLineWidth == 'number' ? LineLayer : LineOffsetLayer
        const gColor = Array.isArray(this.cbLineColor) ? this.cbLineColor : (d: any) => d.color

        finalLayers.push(
          //@ts-ignore
          new lineLayer({
            id: 'linksLayer',
            data: this.lineLayers.linksData,
            getColor: gColor,
            getWidth: typeof this.cbLineWidth == 'number' ? this.cbLineWidth : (d: any) => d.width,
            getSourcePosition: (d: any) => d.path[0],
            getTargetPosition: (d: any) => d.path[1],
            pickable: true,
            autoHighlight: true,
            highlightedObjectIndex:
              this.highlightedLinkIndex == -1 ? null : this.highlightedLinkIndex,
            highlightColor: [255, 255, 255, 160], // [255, 0, 204, 255],
            opacity: 1,
            widthUnits: 'pixels',
            widthMinPixels: 1,
            offsetDirection: OFFSET_DIRECTION.RIGHT,
            transitions: {
              getColor: 300,
              getWidth: 300,
            },
            parameters: {
              depthTest: !!this.fillHeights,
              fp64: false,
            },
            // filter shapes
            extensions: [new DataFilterExtension({ filterSize: 1 })],
            filterRange: [0, 1], // set filter to -1 to filter element out
            getFilterValue: (_: any, o: DeckObject) => {
              return theFilter[o.index]
            },
          } as any)
        )
      }

      // ON-TOP layers
      if (extraLayers) finalLayers.push(...extraLayers.layersOnTop)

      // all done! whoosh!!
      return finalLayers
    },
    // ================= END LAYERS ================
    // ================= END LAYERS ================
  },

  mounted() {
    let style: any
    if (this.hasBackgroundMap) {
      style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
    } else {
      style = { version: 8, sources: {}, layers: [] }
    }

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    const zoom = this.globalState.viewState.zoom

    //@ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      center,
      zoom,
      canvasContextAttributes: { preserveDrawingBuffer: true },
    })

    this.mymap.on('move', this.handleMove)
    this.mymap.on('style.load', () => {
      if (this.hasBackgroundMap && this.show3dBuildings && this.mymap) {
        enable3DBuildings(this.mymap)
      }

      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
        onClick: this.handleClick,
        onHover: this.handleHover,
        onDrag: this.handleHover,
        pickingRadius: 2,
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
    this.mymap = null
  },

  methods: {
    handleMove() {
      if (this.mapIsIndependent) return
      const center = this.mymap?.getCenter() as any
      const view = {
        center: [center.lng, center.lat],
        zoom: this.mymap?.getZoom(),
        bearing: this.mymap?.getBearing(),
        pitch: this.mymap?.getPitch(),
        jump: true,
      }
      globalStore.commit('setMapCamera', view)
    },

    getTooltip({ object, index }: { object: any; index: number }) {
      let offset = index
      if (object && 'feature_idx' in object) {
        offset = object.feature_idx
      }
      // always call this even if we're blank so tooltip goes away
      if (this.cbTooltip) this.cbTooltip(offset, object)
    },

    handleClick(target: any, event: any) {
      // this.tooltipStyle.display = 'none'
      if (this.cbClickEvent) this.cbClickEvent(target)
    },

    handleHover(target: any, event: any) {
      if (target.index == -1) {
        this.cbTooltip(-1, null)
        return
      }
      // console.log('hover', target, event)
      this.getTooltip(target)
      // this.tooltipStyle.display = 'none'
      // if (this.cbClickEvent) this.cbClickEvent(event)
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
