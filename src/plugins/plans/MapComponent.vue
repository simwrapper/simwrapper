<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  MapTooltip.deck-tooltip(v-if="tip" :hoverInfo="tip" :style="tooltipCoord")
</template>

<script lang="ts">
// -------------------------------------------------------------
// Plan viz has several layers, top to bottom:
//
// - destination text on top of circles
// - destination circles
// - legs (path layer, each leg is its own path)
// - shipment link (dashed line on stopActivity link itself)

import { defineComponent, markRaw, PropType } from 'vue'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ArcLayer, PathLayer as SolidPathLayer, ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension, PathStyleExtension } from '@deck.gl/extensions'
import type { DataFilterExtensionProps } from '@deck.gl/extensions'
import type { Layer, LayerData } from '@deck.gl/core'
import PathLayer from '@/layers/PathOffsetLayer'
import BackgroundLayers from '@/js/BackgroundLayers'

import globalStore from '@/store'
import MapTooltip from './MapTooltip.vue'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'
import { LegModeColor, type Plan } from './PlansViewer.vue'
import { OPEN_END, activeAtFilter } from './planTime'
import {
  activeRoutes,
  arcsOfKinds,
  buildRoutePaths,
  type ArcSet,
  type OverviewData,
  type RoutePaths,
} from './overviewData'

const BASE_URL = import.meta.env.BASE_URL

// Shared by every plan layer: each object carries its [t0, t1) time window, and the time
// slider moves the filter range (a uniform), so dragging or playing never rebuilds data.
const timeFilterExtension = new DataFilterExtension({ filterSize: 2 })
const dashExtension = new PathStyleExtension({ dash: true })

// "Show everyone" uses the plan view's colors (see the plan layers below)
const HOME_COLOR = [24, 255, 255, 255]
const ACTIVITY_COLOR = [255, 64, 255, 255]
const ROUTE_DEFAULT_COLOR = [0, 128, 230, 255]
const ARC_DEFAULT_COLOR = [200, 200, 200, 192]

// Reusable buffers for the road paths under way at the current time, per overview. Outside
// Vue's reactivity on purpose: rewritten on every slider move, rendered only through deck.gl.
const routeScratch = new WeakMap<OverviewData, { ids: number[]; paths?: RoutePaths }>()

/** rgba per item from per-kind colors, as deck.gl's own color type (normalized 0-255). */
function colorsByKind(
  kinds: string[],
  kindOf: Uint16Array,
  colorOf: (kind: string) => number[]
): Uint8ClampedArray {
  const table = kinds.map(colorOf)
  const colors = new Uint8ClampedArray(4 * kindOf.length)
  for (let i = 0; i < kindOf.length; i++) colors.set(table[kindOf[i]], 4 * i)
  return colors
}

const modeColor = (fallback: number[]) => (mode: string) => {
  const c = LegModeColor[mode] || fallback
  return c.length === 4 ? c : [...c, 255]
}

// The three shapes a plan row can own on the map. PlansViewer tags every drawn geometry with
// the row it came from, and the highlight finds it back through `row`.
type HlLeg = { points: number[][]; row?: Plan }
type HlArc = { start: number[]; end: number[]; row?: Plan }
type HlActivity = { midpoint: number[]; ptFrom: number[]; ptTo: number[]; row?: Plan }

export default defineComponent({
  name: 'MyDeckComponent',
  components: { MapTooltip },
  props: {
    bgLayers: { type: Object as PropType<BackgroundLayers>, required: true },
    dark: { type: Boolean, required: true },
    legs: { type: Array, required: true },
    nonRoutedLegs: { type: Array, required: true },
    mapIsIndependent: { type: Boolean },
    onClick: { type: Function, required: true },
    settings: {
      type: Object as PropType<{
        simplifyTours: boolean
        scaleFactor: number
        shipmentDotsOnTourMap: boolean
        showWalkTrips?: boolean
      }>,
      required: true,
    },
    stopActivities: { type: Array, required: true },
    viewId: { type: Number, required: true },
    show3dBuildings: { type: Boolean, required: false, default: false },
    // time slider position (seconds): show only what is active then; 0 = no filter
    currentTime: { type: Number, default: 0 },
    // every selected plan in the file ("Show everyone"), or null
    overview: { type: Object as PropType<OverviewData | null>, default: null },
    // the plan-table row being hovered or locked: its leg / activity is drawn bright white
    highlightRow: { type: Object as PropType<Plan | null>, default: null },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      tip: null,
      tooltipCoord: { top: 0, left: 0, display: 'block' },
    }
  },

  computed: {
    // "Show everyone" data that only changes when a new overview loads (or a leg switch is
    // toggled) -- not when the time slider moves -- so its GPU buffers are uploaded once and
    // filtered by time on the GPU.
    overviewActivities(): LayerData<unknown> | null {
      const ov = this.overview
      if (!ov) return null
      const colors = colorsByKind(ov.kinds, ov.activities.kind, k =>
        k.startsWith('home') ? HOME_COLOR : ACTIVITY_COLOR
      )
      return {
        length: ov.activities.count,
        attributes: {
          getPosition: { value: ov.activities.positions, size: 2 },
          getFillColor: { value: colors, size: 4 },
          getFilterValue: { value: ov.activities.times, size: 2 },
        },
      }
    },

    // Which kinds (leg modes) of the overview to draw: all but walk when walk trips are off.
    overviewKindShown(): ((kind: number) => boolean) | null {
      const ov = this.overview
      if (!ov) return null
      const shown = ov.kinds.map(k => this.isModeShown(k))
      return (kind: number) => shown[kind]
    },

    overviewLegArcs(): { arcs: LayerData<unknown>; routeArcs: LayerData<unknown> } | null {
      const ov = this.overview
      const shown = this.overviewKindShown
      if (!ov || !shown) return null
      const asLayerData = (set: ArcSet, fallback: number[]): LayerData<unknown> => {
        const colors = colorsByKind(ov.kinds, set.kind, modeColor(fallback))
        return {
          length: set.count,
          attributes: {
            getSourcePosition: { value: set.source, size: 2 },
            getTargetPosition: { value: set.target, size: 2 },
            getSourceColor: { value: colors, size: 4 },
            getTargetColor: { value: colors, size: 4 },
            getFilterValue: { value: set.times, size: 2 },
          },
        }
      }
      return {
        arcs: asLayerData(arcsOfKinds(ov.arcs, shown), ARC_DEFAULT_COLOR),
        // routed legs as start-to-end arcs, for "simple tours"
        routeArcs: asLayerData(arcsOfKinds(ov.routes, shown), ROUTE_DEFAULT_COLOR),
      }
    },

    // The plan's legs, minus walk legs when walk trips are switched off.
    shownLegs(): unknown[] {
      return this.legs.filter(d => this.isModeShown((d as { mode: string }).mode))
    },
    shownNonRoutedLegs(): unknown[] {
      return this.nonRoutedLegs.filter(d => this.isModeShown((d as { mode: string }).mode))
    },

    // Road paths of the routed legs under way at the slider time, in deck.gl's binary path
    // format. Rebuilt whenever the slider moves (only these few thousand routes, not all).
    overviewRoutePaths(): LayerData<unknown> | null {
      const ov = this.overview
      if (!ov || this.settings.simplifyTours) return null
      let scratch = routeScratch.get(ov)
      if (!scratch) {
        scratch = { ids: [] }
        routeScratch.set(ov, scratch)
      }
      const shown = this.overviewKindShown
      const ids = activeRoutes(ov.routes, this.currentTime, scratch.ids)
      if (shown) {
        let n = 0
        for (const r of ids) if (shown(ov.routes.kind[r])) ids[n++] = r
        ids.length = n
      }
      const colorOf = modeColor(ROUTE_DEFAULT_COLOR)
      const kindColors = ov.kinds.map(colorOf)
      const paths = buildRoutePaths(
        ov.routes,
        ids,
        ov.linkCoords,
        k => kindColors[k],
        scratch.paths
      )
      scratch.paths = paths
      const vertices = paths.startIndices[paths.length]
      // fresh subarray views each time, so deck.gl sees new data and re-uploads it
      return {
        length: paths.length,
        startIndices: paths.startIndices.subarray(0, paths.length + 1),
        attributes: {
          getPath: { value: paths.positions.subarray(0, 2 * vertices), size: 2 },
          getColor: { value: paths.colors.subarray(0, 4 * vertices), size: 4 },
        },
      } as LayerData<unknown>
    },

    // "Show everyone" layers, styled like the plan layers below: legs without a link route as
    // arcs between their links, routed legs as road paths (or arcs, for "simple tours"), and
    // activity dots on top. Unlike a searched plan, everyone is always filtered by time --
    // even at 00:00 -- since every leg of the day at once would be millions of road segments.
    overviewLayers(): Layer[] {
      const activities = this.overviewActivities
      const legArcs = this.overviewLegArcs
      if (!activities || !legArcs) return []
      const timeFilter = { ...activeAtFilter(this.currentTime), filterEnabled: true }
      console.log('legArcs.arcs', legArcs.arcs)
      const layers: Layer[] = [
        new ArcLayer<unknown, DataFilterExtensionProps>({
          id: 'everyone-non-routed-leg-arcs',
          data: legArcs.arcs,
          getWidth: 2,
          getHeight: 0.6,
          numSegments: 13, // legArcs.arcs.length < 32768 ? 13 : 6,
          widthMinPixels: 1,
          widthMaxPixels: 40,
          widthUnits: 'pixels',
          opacity: 0.9,
          pickable: false,
          extensions: [timeFilterExtension],
          ...timeFilter,
        }),
      ]
      if (this.settings.simplifyTours) {
        layers.push(
          new ArcLayer<unknown, DataFilterExtensionProps>({
            id: 'everyone-leg-arcs',
            data: legArcs.routeArcs,
            getWidth: 2,
            numSegments: 5,
            getHeight: 0.5,
            widthMinPixels: 2,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            opacity: 0.9,
            pickable: false,
            extensions: [timeFilterExtension],
            ...timeFilter,
          })
        )
      } else if (this.overviewRoutePaths) {
        layers.push(
          new PathLayer({
            id: 'everyone-routes',
            data: this.overviewRoutePaths,
            _pathType: 'open', // binary paths: skip deck.gl's path normalization
            getWidth: 2,
            getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
            opacity: 1,
            widthMinPixels: 3,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            jointRounded: true,
            pickable: false,
            // PathOffsetLayer's getOffset isn't in deck.gl's PathLayer types
          } as ConstructorParameters<typeof PathLayer>[0])
        )
      }
      layers.push(
        new ScatterplotLayer<unknown, DataFilterExtensionProps>({
          id: 'everyone-activities',
          data: activities,
          radiusUnits: 'pixels',
          getRadius: 4,
          stroked: false,
          opacity: 0.9,
          pickable: false,
          visible: this.settings.shipmentDotsOnTourMap,
          extensions: [timeFilterExtension],
          ...timeFilter,
        })
      )
      return layers
    },

    // The map geometry drawn for the hovered/locked table row, found by row identity (each
    // drawn leg / activity keeps the plan row it came from). Undefined if that row is not
    // on the map (unknown links, walk legs switched off...).
    highlightGeometry(): { leg?: HlLeg; arc?: HlArc; activity?: HlActivity } {
      const row = this.highlightRow
      if (!row) return {}
      return {
        leg: (this.shownLegs as HlLeg[]).find(d => d.row === row),
        arc: (this.shownNonRoutedLegs as HlArc[]).find(d => d.row === row),
        activity: (this.stopActivities as HlActivity[]).find(d => d.row === row),
      }
    },

    // The highlighted leg or activity, redrawn on top of the plan layers in white: a thick
    // glow line/circle plus a thinner solid core. Not pickable, not time-filtered -- moving
    // the mouse over a row always shows where it is, even when the slider hides it.
    highlightLayers(): Layer[] {
      const HL_GLOW = [255, 255, 255, 192]
      const HL_CORE = this.globalState.isDarkMode ? [255, 255, 255, 255] : [83, 181, 137, 255]

      const { leg, arc, activity } = this.highlightGeometry
      const layers: Layer[] = []

      // one white polyline: a wide soft glow underneath a solid core, both in pixels
      const addPath = (id: string, paths: number[][][]) => {
        for (const [color, width] of [
          [HL_GLOW, 14],
          [HL_CORE, 8],
        ] as [number[], number][]) {
          layers.push(
            new SolidPathLayer({
              id: `${id}-${width}`,
              data: paths,
              getPath: (d: number[][]) => d,
              getColor: () => color,
              widthUnits: 'pixels',
              widthMinPixels: width,
              widthMaxPixels: 400,
              jointRounded: true,
              capRounded: true,
              shadowEnabled: false,
              opacity: 1,
              pickable: false,
              parameters: { depthTest: false },
              // SolidPathLayer's propTypes dislike our plain arrays of lonlats
            } as unknown as ConstructorParameters<typeof SolidPathLayer>[0])
          )
        }
      }

      const addArc = (id: string, ends: number[][]) => {
        for (const [color, width] of [
          [HL_GLOW, 24],
          [HL_CORE, 10],
        ] as [number[], number][]) {
          layers.push(
            new ArcLayer({
              id: `${id}-${width}`,
              data: [ends],
              getSourcePosition: (d: number[][]) => d[0],
              getTargetPosition: (d: number[][]) => d[1],
              getSourceColor: () => color,
              getTargetColor: () => color,
              getWidth: width,
              widthUnits: 'pixels',
              widthMinPixels: width,
              widthMaxPixels: 400,
              numSegments: 13,
              getHeight: 0.6,
              opacity: 1,
              pickable: false,
              parameters: { depthTest: false },
            } as unknown as ConstructorParameters<typeof ArcLayer>[0])
          )
        }
      }

      if (leg) {
        // "Simple tours" draws legs as arcs, so highlight the same shape
        if (this.settings.simplifyTours)
          addArc('highlight-leg', [leg.points[0], leg.points[leg.points.length - 1]])
        else addPath('highlight-leg', [leg.points])
      }
      if (arc) addArc('highlight-arc', [arc.start, arc.end])

      if (activity) {
        addPath('highlight-activity-link', [[activity.ptFrom, activity.ptTo]])
        for (const [color, radius] of [
          [HL_GLOW, 14],
          [HL_CORE, 8],
        ] as [number[], number][]) {
          layers.push(
            new ScatterplotLayer({
              id: `highlight-activity-${radius}`,
              data: [activity],
              getPosition: (d: HlActivity) => d.midpoint,
              getFillColor: () => color,
              radiusUnits: 'pixels',
              getRadius: radius,
              stroked: false,
              opacity: 1,
              pickable: false,
              parameters: { depthTest: false },
            } as unknown as ConstructorParameters<typeof ScatterplotLayer>[0])
          )
        }
      }

      return layers
    },

    layers() {
      const allLayers = [] as any[]

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) allLayers.push(...extraLayers.layersBelow)

      // everyone, below the searched plans
      allLayers.push(...this.overviewLayers)

      // spread into each plan layer, alongside its own extensions
      const timeFilter = {
        getFilterValue: (d: { t0?: number; t1?: number }) => [d.t0 ?? 0, d.t1 ?? OPEN_END],
        ...activeAtFilter(this.currentTime),
      }

      allLayers.push(
        new PathLayer({
          id: 'shipmentLocationDashedLine',
          data: this.stopActivities,
          getPath: (d: any) => [d.ptFrom, d.ptTo],
          getColor: [128, 128, 128],
          getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
          opacity: 1,
          getWidth: this.settings.scaleFactor / 2,
          widthMinPixels: 3,
          widthMaxPixels: 200,
          jointRounded: true,
          shadowEnabled: false,
          pickable: false,
          autoHighlight: false,
          highlightColor: [255, 255, 255],
          parameters: {},
          getDashArray: [3, 2],
          dashJustified: true,
          extensions: [dashExtension, timeFilterExtension],
          ...timeFilter,
        })
      )

      if (this.nonRoutedLegs.length) {
        allLayers.push(
          new ArcLayer({
            id: 'non-routed-leg-arcs',
            data: this.shownNonRoutedLegs,
            getSourcePosition: (d: any) => d.start,
            getTargetPosition: (d: any) => d.end,
            getSourceColor: (d: any) => LegModeColor[d.mode] || [200, 200, 200, 192],
            getTargetColor: (d: any) => LegModeColor[d.mode] || [200, 200, 200, 192],
            // scaledValue = targetMin + (inputValue - originalMin) * (targetMax - targetMin) / (originalMax - originalMin);
            getWidth: 2, // 2 + ((this.settings.scaleFactor - 0) * (40 - 2)) / (100 - 0),
            getHeight: 0.6,
            widthMinPixels: 1,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            numSegments: 8,
            // widthScale: widthScale,
            opacity: 0.9,
            parameters: { depthTest: false },
            updateTriggers: { getWidth: [this.settings.scaleFactor] },
            transitions: { getWidth: 150 },
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255], // [64, 255, 64],
            onHover: this.getTooltip,
            extensions: [timeFilterExtension],
            ...timeFilter,
            //TODO: ONHOVER
            // onHover: setHoverInfo,
          })
        )
      }

      if (this.settings.simplifyTours) {
        allLayers.push(
          new ArcLayer({
            id: 'leg-arcs',
            data: this.shownLegs,
            getSourcePosition: (d: any) => d.points[0],
            getTargetPosition: (d: any) => d.points[d.points.length - 1],
            getSourceColor: (d: any) => LegModeColor[d.mode] || [0, 128, 230], // d.color,
            getTargetColor: (d: any) => LegModeColor[d.mode] || [0, 128, 230], // d.color,
            getWidth: 2, //  + ((this.settings.scaleFactor - 0) * (40 - 2)) / (100 - 0),
            getHeight: 0.5,
            widthMinPixels: 2,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            // widthScale: widthScale,
            opacity: 0.9,
            numSegments: 7,
            parameters: { depthTest: false },
            updateTriggers: { getWidth: [this.settings.scaleFactor] },
            transitions: { getWidth: 150 },
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255], // [64, 255, 64],
            onHover: this.getTooltip,
            extensions: [timeFilterExtension],
            ...timeFilter,
            //TODO: ONHOVER
            // onHover: setHoverInfo,
          } as any)
        )
      } else {
        allLayers.push(
          new PathLayer({
            id: 'deliveryroutes',
            data: this.shownLegs,
            getPath: (d: any) => d.points,
            getColor: (d: any) => LegModeColor[d.mode] || [0, 128, 230], // d.color,
            // scaledValue = targetMin + (inputValue - originalMin) * (targetMax - targetMin) / (originalMax - originalMin);
            getWidth: 2, // 3 + ((this.settings.scaleFactor - 0) * (40 - 3)) / (100 - 0),
            getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
            opacity: 1,
            widthMinPixels: 3,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            // widthScale: widthScale,
            jointRounded: true,
            shadowEnabled: false,
            pickable: true,
            autoHighlight: true,
            numSegments: 5,
            highlightColor: [255, 255, 255], // [64, 255, 64],
            parameters: { depthTest: false },
            updateTriggers: { getWidth: [this.settings.scaleFactor] },
            transitions: { getWidth: 150 },
            onHover: this.getTooltip,
            extensions: [timeFilterExtension],
            ...timeFilter,
            // onHover: setHoverInfo,
          } as any)
        )
      }

      // destination labels
      allLayers.push(
        new ScatterplotLayer({
          id: 'activity-locations',
          data: this.stopActivities,
          getLineColor: [128, 128, 128],
          getFillColor: (d: any) => (d.type?.startsWith('home') ? [24, 255, 255] : [255, 64, 255]),
          getLineWidth: 0.5,
          stroked: false,
          getPosition: (d: any, i: number) => [...d.midpoint, (i + 1) * 4],
          getRadius: 4,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          opacity: 0.9,
          noAlloc: false,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255],
          visible: this.settings.shipmentDotsOnTourMap,
          onHover: this.getTooltip,
          extensions: [timeFilterExtension],
          ...timeFilter,
        })
      )

      // the row hovered or locked in the plan table, above every plan layer
      allLayers.push(...this.highlightLayers)

      // ON-TOP layers
      if (extraLayers) allLayers.push(...extraLayers.layersOnTop)

      // all done! Phew
      return allLayers
    },

    widthScale() {
      // range is (1/) 16384 - 0.000001
      // scaleFactor is 0-100, which we invert and shift to [14 to -6], then 2^value is widthScale.
      let scaleFactor = this.settings.scaleFactor
      let scale = scaleFactor == 0 ? 1e-6 : 1 / Math.pow(2, (100 - scaleFactor) / 5 - 6.0)
      return scale
    },
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

  async mounted() {
    const style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
    // const style = 'https://tiles.openfreemap.org/styles/dark'

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    const zoom = (this.globalState.viewState.zoom || 8) as number
    // markRaw: maplibre freezes the `rgb` array on the Color objects it parses out of a
    // style, and deck.gl freezes its layer props -- reading either back through a Vue
    // proxy violates the proxy invariant and throws. See trap #7.
    //@ts-ignore
    this.mymap = markRaw(
      new maplibregl.Map({
        center,
        zoom,
        // without these, the first map 'move' event overwrites the initial YAML bearing/pitch
        bearing: this.globalState.viewState.bearing || 0,
        pitch: this.globalState.viewState.pitch || 0,
        container,
        style,
      })
    )
    this.mymap.on('style.load', () => {
      if (this.show3dBuildings && this.mymap) {
        enable3DBuildings(this.mymap)
      }

      this.deckOverlay = markRaw(
        new MapboxOverlay({
          layers: this.layers,
          interleaved: true,
          pickingRadius: 2,
          onClick: this.handleClick,
          getCursor: ({ isDragging, isHovering }) =>
            isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab',
        })
      )
      this.mymap?.addControl(this.deckOverlay)
    })
    this.mymap.on('move', this.handleMove)
  },

  beforeUnmount() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    // false for walk legs when the "Walk trips" switch is off
    isModeShown(mode: string) {
      return this.settings.showWalkTrips !== false || mode !== 'walk'
    },

    handleMove() {
      if (this.mapIsIndependent) return
      const center = this.mymap?.getCenter() as any
      const view = {
        latitude: center.lat,
        longitude: center.lng,
        center,
        zoom: this.mymap?.getZoom(),
        bearing: this.mymap?.getBearing(),
        pitch: this.mymap?.getPitch(),
        jump: true,
      }
      globalStore.commit('setMapCamera', view)
    },

    getTooltip(tip: { x: number; y: number; object: any }) {
      const { x, y, object } = tip

      if (!object) {
        this.tooltipCoord.display = 'none'
        this.tip = null
        return
      }

      this.tip = { ...tip }

      this.tooltipCoord.display = 'block'
      this.tooltipCoord.top = `${y + 12}px`
      this.tooltipCoord.left = `${x + 12}px`
    },

    handleClick(event: any) {
      if (!this.onClick) return
      if (!event.object) {
        // no object: send null as message that blank area was clicked
        this.onClick(null)
      } else {
        this.onClick(event.object)
      }
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
  pointer-events: none;
}
</style>
