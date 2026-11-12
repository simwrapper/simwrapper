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
import type { PathLayerProps } from '@deck.gl/layers'
import { DataFilterExtension, PathStyleExtension } from '@deck.gl/extensions'
import type { DataFilterExtensionProps, PathStyleExtensionProps } from '@deck.gl/extensions'
import type { Accessor, Color, Layer, LayerData, PickingInfo } from '@deck.gl/core'
import PathLayer from '@/layers/PathOffsetLayer'
import BackgroundLayers from '@/js/BackgroundLayers'

import globalStore from '@/store'
import MapTooltip from './MapTooltip.vue'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'
import { type ActivityStop, type DrawnLeg, type NonRoutedLeg, type Plan } from './PlansViewer.vue'
import { OPEN_END, activeAtFilter } from './planTime'
import {
  ARC_DEFAULT_COLOR,
  ACTIVITY_COLOR,
  ROUTE_DEFAULT_COLOR,
  planColors,
  type PlanColors,
  type RGBA,
} from './planColors'
import { planKey, type HoverRow } from './planHover'
import {
  activeRoutes,
  buildRoutePaths,
  overviewHoverRow,
  overviewPlanGeometry,
  overviewPlanIndex,
  type ArcSet,
  type OverviewData,
  type LonLat,
  type OverviewSet,
  type PlanGeometry,
  type RoutePaths,
} from './overviewData'

const BASE_URL = import.meta.env.BASE_URL

// more segments smoother! fewer segments faster :-)
const ARC_SEGMENTS = 13

// Every plan except the hovered one: medium grey, mostly transparent (#80808040)
const DIMMED_COLOR: RGBA = [128, 128, 128, 64]
// ...but only once the mouse has rested on a plan this long, so sweeping across the map
// doesn't flash everything grey; and colors fade in and out rather than switching
const DIM_DELAY_MS = 1000
const DIM_FADE_MS = 250
const COLOR_FADE = {
  getColor: DIM_FADE_MS,
  getSourceColor: DIM_FADE_MS,
  getTargetColor: DIM_FADE_MS,
  getFillColor: DIM_FADE_MS,
}

// Shared by every plan layer: each object carries its [t0, t1) time window, and the time
// slider moves the filter range (a uniform), so dragging or playing never rebuilds data.
const timeFilterExtension = new DataFilterExtension({ filterSize: 2 })
const dashExtension = new PathStyleExtension({ dash: true })

// Reusable buffers for the road paths under way at the current time, per overview. Outside
// Vue's reactivity on purpose: rewritten on every slider move, rendered only through deck.gl.
const routeScratch = new WeakMap<OverviewData, { ids: number[]; paths?: RoutePaths }>()

// the e2e hook (see updateTestData)
type TestWindow = Window & { __testdata__?: unknown }

// deck.gl's picking tolerance, in pixels
const PICKING_RADIUS = 2
// "Show everyone" is too big to pick on every mouse move (tens of ms per pick for a large
// file: every item is redrawn into the picking buffer). So deck.gl's own picking skips it (see
// layerFilter), and it is picked once the mouse has rested this long, or on a click...
const REST_PICK_MS = 100
// ...and the item found there keeps its tooltip until the mouse moves this far away
const REST_LEAVE_PX = 4

// "Show everyone" layer id -> what its picked index counts (see pickedObject)
const OVERVIEW_PICKS: Record<string, OverviewSet> = {
  'everyone-activities': 'activity',
  'everyone-non-routed-leg-arcs': 'arc',
  'everyone-leg-arcs': 'route',
  'everyone-routes': 'route',
}

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

// deck.gl binary data: a length plus ready-made attribute buffers
type BinaryData = {
  length: number
  attributes: Record<string, { value: ArrayLike<number>; size: number }>
}

// PathOffsetLayer adds getOffset to deck.gl's PathLayer, but its class carries only the base
// (untyped-data) PathLayer props: check the props against the data here, then hand them over.
type OffsetPathProps<D> = PathLayerProps<D> &
  DataFilterExtensionProps<D> &
  PathStyleExtensionProps<D> & {
    getOffset?: Accessor<D, number>
    shadowEnabled?: boolean // read by deck.gl's shadow pass, missing from its prop types
  }
function offsetPathLayer<D>(props: OffsetPathProps<D>) {
  return new PathLayer(props as ConstructorParameters<typeof PathLayer>[0])
}

export default defineComponent({
  name: 'MyDeckComponent',
  components: { MapTooltip },
  props: {
    bgLayers: { type: Object as PropType<BackgroundLayers> },
    dark: { type: Boolean, required: true },
    legs: { type: Array as PropType<DrawnLeg[]>, required: true },
    nonRoutedLegs: { type: Array as PropType<NonRoutedLeg[]>, required: true },
    mapIsIndependent: { type: Boolean },
    onClick: { type: Function, required: true },
    settings: {
      type: Object as PropType<{
        simplifyTours: boolean
        scaleFactor: number
        shipmentDotsOnTourMap: boolean
        showTeleportedTrips?: boolean
      }>,
      required: true,
    },
    stopActivities: { type: Array as PropType<ActivityStop[]>, required: true },
    viewId: { type: Number, required: true },
    show3dBuildings: { type: Boolean, required: false, default: false },
    // time slider position (seconds): show only what is active then; 0 = no filter
    currentTime: { type: Number, default: 0 },
    // every selected plan in the file ("Show everyone"), or null
    overview: { type: Object as PropType<OverviewData | null>, default: null },
    // the plan-table row being hovered or locked: its leg / activity is drawn bright white
    highlightRow: { type: Object as PropType<Plan | null>, default: null },
    // activity/leg colors and the activity radius (built-in, or from the viz YAML); markRaw'd
    colors: { type: Object as PropType<PlanColors>, default: () => planColors(undefined) },
  },

  // the plan-table row under the mouse on the map (null when nothing hoverable is)
  emits: ['hover-row'],

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      // the tooltip: where, and the leg/activity under the mouse (its plan-table row)
      tip: null as { x: number; y: number; object: { row?: HoverRow } } | null,
      // the plan ("person/plan") every other plan is drawn grey around: the hovered one,
      // once the mouse has rested on it for DIM_DELAY_MS
      dimPlan: null as string | null,
      // the plan under the mouse right now, and the timer that will make it dimPlan
      hoverPlan: null as string | null,
      dimTimer: 0,
      // the "Show everyone" item found by the last resting-mouse pick, and where it was picked
      overviewHit: null as { layerId: string; index: number; x: number; y: number } | null,
      restTimer: 0,
      // true only while pickOverview() runs: lets "Show everyone" into deck.gl's picking
      pickingOverview: false,
      tooltipCoord: { top: '0px', left: '0px', display: 'block' },
    }
  },

  computed: {
    // "Show everyone" data that only changes when a new overview loads -- not when the time slider moves -- so its GPU buffers are uploaded once and
    // filtered by time on the GPU.
    // (Each also comes without its colors, for drawing everyone grey: the same typed arrays,
    // so deck.gl only re-uploads the color buffer.)
    overviewActivities(): { colored: BinaryData; plain: BinaryData } | null {
      const ov = this.overview
      if (!ov) return null
      const colors = colorsByKind(ov.kinds, ov.activities.kind, this.activityColor)
      const attributes = {
        getPosition: { value: ov.activities.positions, size: 2 },
        getFilterValue: { value: ov.activities.times, size: 2 },
      }
      return {
        colored: {
          length: ov.activities.count,
          attributes: { ...attributes, getFillColor: { value: colors, size: 4 } },
        },
        plain: { length: ov.activities.count, attributes },
      }
    },

    overviewLegArcs(): {
      arcs: { colored: BinaryData; plain: BinaryData }
      routeArcs: { colored: BinaryData; plain: BinaryData }
    } | null {
      const ov = this.overview
      if (!ov) return null
      const asLayerData = (set: ArcSet, fallback: RGBA) => {
        const colors = colorsByKind(ov.kinds, set.kind, this.legColor(fallback))
        const attributes = {
          getSourcePosition: { value: set.source, size: 2 },
          getTargetPosition: { value: set.target, size: 2 },
          getFilterValue: { value: set.times, size: 2 },
        }
        return {
          colored: {
            length: set.count,
            attributes: {
              ...attributes,
              getSourceColor: { value: colors, size: 4 },
              getTargetColor: { value: colors, size: 4 },
            },
          },
          plain: { length: set.count, attributes },
        }
      }
      return {
        arcs: asLayerData(ov.arcs, ARC_DEFAULT_COLOR),
        // routed legs as start-to-end arcs, for "simple tours"
        routeArcs: asLayerData(ov.routes, ROUTE_DEFAULT_COLOR),
      }
    },

    // The plan's teleported (non-routed) legs, drawn as arcs: none when the
    // "Teleported trips" switch is off.
    shownNonRoutedLegs(): NonRoutedLeg[] {
      return this.showTeleportedTrips ? this.nonRoutedLegs : []
    },
    showTeleportedTrips(): boolean {
      return this.settings.showTeleportedTrips !== false
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
      const ids = activeRoutes(ov.routes, this.currentTime, scratch.ids)
      const colorOf = this.legColor(ROUTE_DEFAULT_COLOR)
      const kindColors = ov.kinds.map(k => (this.dimPlan ? DIMMED_COLOR : colorOf(k)))
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
    //
    // Everyone is pickable: hovering shows the plan's tooltip and, once the mouse rests, greys
    // out every other plan (overviewFocusLayers redraws the hovered one in color on top).
    overviewLayers(): Layer[] {
      const activities = this.overviewActivities
      const legArcs = this.overviewLegArcs
      if (!activities || !legArcs) return []
      const timeFilter = { ...activeAtFilter(this.currentTime), filterEnabled: true }
      const dim = !!this.dimPlan
      // Picked only by pickOverview(), not deck.gl's hover, so deck.gl's autoHighlight
      // never sees the item: highlight the one found there by its index instead.
      const hit = this.overviewHit
      const picking = (id: string) => ({
        id,
        pickable: true,
        highlightColor: [255, 255, 255, 255] as RGBA,
        highlightedObjectIndex: hit?.layerId === id ? hit.index : -1,
      })
      // the grey stands in for the per-item color attributes left out of the `plain` data
      const greyArcs = dim ? { getSourceColor: DIMMED_COLOR, getTargetColor: DIMMED_COLOR } : {}
      const layers: Layer[] = [
        new ArcLayer<unknown, DataFilterExtensionProps>({
          ...picking('everyone-non-routed-leg-arcs'),
          data: (dim ? legArcs.arcs.plain : legArcs.arcs.colored) as LayerData<unknown>,
          ...greyArcs,
          getWidth: 2,
          getHeight: 0.6,
          numSegments: legArcs.arcs.colored.length < 1000 ? 50 : ARC_SEGMENTS,
          widthMinPixels: 1,
          widthMaxPixels: 40,
          widthUnits: 'pixels',
          opacity: 0.9,
          visible: this.showTeleportedTrips,
          extensions: [timeFilterExtension],
          ...timeFilter,
        }),
      ]
      if (this.settings.simplifyTours) {
        layers.push(
          new ArcLayer<unknown, DataFilterExtensionProps>({
            ...picking('everyone-leg-arcs'),
            data: (dim ? legArcs.routeArcs.plain : legArcs.routeArcs.colored) as LayerData<unknown>,
            ...greyArcs,
            getWidth: 2,
            numSegments: legArcs.routeArcs.colored.length < 1000 ? 50 : ARC_SEGMENTS,
            getHeight: 0.5,
            widthMinPixels: 2,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            opacity: 0.9,
            extensions: [timeFilterExtension],
            ...timeFilter,
          })
        )
      } else if (this.overviewRoutePaths) {
        layers.push(
          new PathLayer({
            ...picking('everyone-routes'),
            data: this.overviewRoutePaths,
            _pathType: 'open', // binary paths: skip deck.gl's path normalization
            getWidth: 2,
            getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
            opacity: 1,
            widthMinPixels: 3,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            jointRounded: true,
            // PathOffsetLayer's getOffset isn't in deck.gl's PathLayer types
          } as ConstructorParameters<typeof PathLayer>[0])
        )
      }
      layers.push(
        new ScatterplotLayer<unknown, DataFilterExtensionProps>({
          ...picking('everyone-activities'),
          data: (dim ? activities.plain : activities.colored) as LayerData<unknown>,
          ...(dim ? { getFillColor: DIMMED_COLOR } : {}),
          radiusUnits: 'pixels',
          getRadius: this.colors.activityRadius,
          stroked: false,
          opacity: 0.9,
          visible: this.settings.shipmentDotsOnTourMap,
          extensions: [timeFilterExtension],
          ...timeFilter,
        })
      )
      layers.push(...this.overviewFocusLayers)
      return layers
    },

    // The plan everyone else is greyed out around, as "Show everyone" draws it: a few plain
    // objects (each with its tooltip row), so it can be drawn in color above the grey. Its
    // whole day is drawn, not just what is under way at the slider time.
    overviewFocus(): {
      activities: (PlanGeometry['activities'][number] & { row: HoverRow })[]
      arcs: (PlanGeometry['arcs'][number] & { row: HoverRow })[]
      routes: (PlanGeometry['routes'][number] & { row: HoverRow })[]
    } | null {
      const ov = this.overview
      const key = this.dimPlan
      if (!ov || !key) return null
      const slash = key.lastIndexOf('/')
      const plan = overviewPlanIndex(ov, key.slice(0, slash), Number(key.slice(slash + 1)))
      if (plan < 0) return null
      const geometry = overviewPlanGeometry(ov, plan)
      const withRow = <T extends { index: number }>(set: OverviewSet, items: T[]) =>
        items.map(d => ({ ...d, row: overviewHoverRow(ov, set, d.index) }))
      return {
        activities: withRow('activity', geometry.activities),
        arcs: withRow('arc', geometry.arcs),
        routes: withRow('route', geometry.routes),
      }
    },

    overviewFocusLayers(): Layer[] {
      const focus = this.overviewFocus
      if (!focus) return []
      type Arc = (typeof focus.arcs)[number]
      type Route = (typeof focus.routes)[number]
      type Activity = (typeof focus.activities)[number]
      const picking = {
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 255, 255, 255] as RGBA,
        onHover: this.getTooltip,
      }
      const arcColor = this.legColor(ARC_DEFAULT_COLOR)
      const routeColor = this.legColor(ROUTE_DEFAULT_COLOR)
      const layers: Layer[] = [
        new ArcLayer<Arc>({
          id: 'everyone-focus-arcs',
          data: focus.arcs,
          getSourcePosition: d => d.start,
          getTargetPosition: d => d.end,
          getSourceColor: d => arcColor(d.kind),
          getTargetColor: d => arcColor(d.kind),
          getWidth: 2,
          getHeight: 0.6,
          numSegments: 50,
          widthMinPixels: 1,
          widthMaxPixels: 40,
          widthUnits: 'pixels',
          opacity: 0.9,
          ...picking,
          visible: this.showTeleportedTrips,
        }),
      ]
      if (this.settings.simplifyTours) {
        layers.push(
          new ArcLayer<Route>({
            id: 'everyone-focus-route-arcs',
            data: focus.routes,
            getSourcePosition: d => d.points[0],
            getTargetPosition: d => d.points[d.points.length - 1],
            getSourceColor: d => routeColor(d.kind),
            getTargetColor: d => routeColor(d.kind),
            getWidth: 2,
            getHeight: 0.5,
            numSegments: 50,
            widthMinPixels: 2,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            opacity: 0.9,
            ...picking,
          })
        )
      } else {
        layers.push(
          new PathLayer({
            id: 'everyone-focus-routes',
            data: focus.routes,
            getPath: (d: Route) => d.points,
            getColor: (d: Route) => routeColor(d.kind),
            getWidth: 2,
            getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
            opacity: 1,
            widthMinPixels: 3,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            jointRounded: true,
            ...picking,
            // PathOffsetLayer's getOffset isn't in deck.gl's PathLayer types
          } as unknown as ConstructorParameters<typeof PathLayer>[0])
        )
      }
      layers.push(
        new ScatterplotLayer<Activity>({
          id: 'everyone-focus-activities',
          data: focus.activities,
          getPosition: d => d.position,
          getFillColor: d => this.activityColor(d.kind),
          radiusUnits: 'pixels',
          getRadius: this.colors.activityRadius,
          stroked: false,
          opacity: 0.9,
          ...picking,
          visible: this.settings.shipmentDotsOnTourMap,
        })
      )
      return layers
    },

    // The map geometry drawn for the hovered/locked table row, found by row identity (each
    // drawn leg / activity keeps the plan row it came from). Undefined if that row is not
    // on the map (unknown links, teleported trips switched off...).
    highlightGeometry(): { leg?: DrawnLeg; arc?: NonRoutedLeg; activity?: ActivityStop } {
      const row = this.highlightRow
      if (!row) return {}
      return {
        leg: this.legs.find(d => d.row === row),
        arc: this.shownNonRoutedLegs.find(d => d.row === row),
        activity: this.stopActivities.find(d => d.row === row),
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
      const addPath = (id: string, paths: LonLat[][]) => {
        for (const [color, width] of [
          [HL_GLOW, 14],
          [HL_CORE, 8],
        ] as [number[], number][]) {
          layers.push(
            new SolidPathLayer({
              id: `${id}-${width}`,
              data: paths,
              getPath: (d: LonLat[]) => d,
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

      const addArc = (id: string, ends: LonLat[]) => {
        for (const [color, width] of [
          [HL_GLOW, 24],
          [HL_CORE, 10],
        ] as [number[], number][]) {
          layers.push(
            new ArcLayer({
              id: `${id}-${width}`,
              data: [ends],
              getSourcePosition: (d: LonLat[]) => d[0],
              getTargetPosition: (d: LonLat[]) => d[1],
              getSourceColor: () => color,
              getTargetColor: () => color,
              getWidth: width,
              widthUnits: 'pixels',
              widthMinPixels: width,
              widthMaxPixels: 400,
              numSegments: 50,
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
              getPosition: (d: ActivityStop) => d.midpoint,
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
      const allLayers: Layer[] = []

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) allLayers.push(...extraLayers.layersBelow)

      // everyone, below the searched plans
      allLayers.push(...this.overviewLayers)

      const arcColor = this.legColor(ARC_DEFAULT_COLOR)
      const routeColor = this.legColor(ROUTE_DEFAULT_COLOR)

      // spread into each plan layer, alongside its own extensions
      const timeFilter = {
        getFilterValue: (d: { t0?: number; t1?: number }) => [d.t0 ?? 0, d.t1 ?? OPEN_END],
        ...activeAtFilter(this.currentTime),
      }

      allLayers.push(
        offsetPathLayer<ActivityStop>({
          id: 'shipmentLocationDashedLine',
          data: this.stopActivities,
          getPath: d => [d.ptFrom, d.ptTo],
          getColor: d => this.planColor(d, [128, 128, 128]),
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
          updateTriggers: { getColor: [this.dimPlan] },
          transitions: COLOR_FADE,
          extensions: [dashExtension, timeFilterExtension],
          ...timeFilter,
        })
      )

      if (this.nonRoutedLegs.length) {
        allLayers.push(
          new ArcLayer<NonRoutedLeg, DataFilterExtensionProps<NonRoutedLeg>>({
            id: 'non-routed-leg-arcs',
            data: this.shownNonRoutedLegs,
            getSourcePosition: d => d.start,
            getTargetPosition: d => d.end,
            getSourceColor: d => this.planColor(d, arcColor(d.mode)),
            getTargetColor: d => this.planColor(d, arcColor(d.mode)),
            // scaledValue = targetMin + (inputValue - originalMin) * (targetMax - targetMin) / (originalMax - originalMin);
            getWidth: 2, // 2 + ((this.settings.scaleFactor - 0) * (40 - 2)) / (100 - 0),
            getHeight: 0.6,
            widthMinPixels: 1,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            numSegments: this.shownNonRoutedLegs.length < 1000 ? 50 : ARC_SEGMENTS,
            // widthScale: widthScale,
            opacity: 0.9,
            updateTriggers: {
              getWidth: [this.settings.scaleFactor],
              getColor: [this.dimPlan, this.colors],
              getSourceColor: [this.dimPlan, this.colors],
              getTargetColor: [this.dimPlan, this.colors],
            },
            transitions: { getWidth: 150, ...COLOR_FADE },
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
          new ArcLayer<DrawnLeg, DataFilterExtensionProps<DrawnLeg>>({
            id: 'leg-arcs',
            data: this.legs,
            getSourcePosition: d => d.points[0],
            getTargetPosition: d => d.points[d.points.length - 1],
            getSourceColor: d => this.planColor(d, routeColor(d.mode)),
            getTargetColor: d => this.planColor(d, routeColor(d.mode)),
            getWidth: 2, //  + ((this.settings.scaleFactor - 0) * (40 - 2)) / (100 - 0),
            getHeight: 0.5,
            widthMinPixels: 2,
            widthMaxPixels: 40,
            widthUnits: 'pixels',
            // widthScale: widthScale,
            opacity: 0.9,
            numSegments: this.legs.length < 1000 ? 50 : ARC_SEGMENTS,
            updateTriggers: {
              getWidth: [this.settings.scaleFactor],
              getColor: [this.dimPlan, this.colors],
              getSourceColor: [this.dimPlan, this.colors],
              getTargetColor: [this.dimPlan, this.colors],
            },
            transitions: { getWidth: 150, ...COLOR_FADE },
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
      } else {
        allLayers.push(
          offsetPathLayer<DrawnLeg>({
            id: 'deliveryroutes',
            data: this.legs,
            getPath: d => d.points,
            getColor: d => this.planColor(d, routeColor(d.mode)),
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
            highlightColor: [255, 255, 255], // [64, 255, 64],
            updateTriggers: {
              getWidth: [this.settings.scaleFactor],
              getColor: [this.dimPlan, this.colors],
              getSourceColor: [this.dimPlan, this.colors],
              getTargetColor: [this.dimPlan, this.colors],
            },
            transitions: { getWidth: 150, ...COLOR_FADE },
            onHover: this.getTooltip,
            extensions: [timeFilterExtension],
            ...timeFilter,
            // onHover: setHoverInfo,
          })
        )
      }

      // destination labels
      allLayers.push(
        new ScatterplotLayer<ActivityStop, DataFilterExtensionProps<ActivityStop>>({
          id: 'activity-locations',
          data: this.stopActivities,
          getLineColor: [128, 128, 128],
          getFillColor: d => this.planColor(d, this.activityColor(this.activityValue(d))),
          updateTriggers: { getFillColor: [this.dimPlan, this.colors] },
          transitions: COLOR_FADE,
          getLineWidth: 0.5,
          stroked: false,
          getPosition: d => d.midpoint,
          getRadius: this.colors.activityRadius,
          radiusUnits: 'pixels',
          lineWidthUnits: 'pixels',
          opacity: 0.9,
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
    // the slider moved: the rested-on item may be gone, and road paths are re-indexed
    currentTime() {
      this.clearOverviewHit()
    },

    layers() {
      this.deckOverlay?.setProps({
        layers: this.layers,
      })
      this.updateTestData()
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
      const incoming = this.globalState.viewState
      const center = this.mymap?.getCenter()
      if (!center) return
      if (
        incoming.longitude !== center.lng ||
        incoming.latitude !== center.lat ||
        incoming.zoom !== this.mymap?.getZoom() ||
        incoming.pitch !== this.mymap?.getPitch() ||
        incoming.bearing !== this.mymap?.getBearing()
      ) {
        // (the store keeps center and longitude/latitude in step)
        this.mymap?.jumpTo({
          center: { lng: incoming.longitude, lat: incoming.latitude },
          zoom: incoming.zoom,
          pitch: incoming.pitch,
          bearing: incoming.bearing,
        })
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

      // style.load fires again on every setStyle() (theme switch); build the overlay once
      if (!this.deckOverlay) {
        this.deckOverlay = markRaw(
          new MapboxOverlay({
            layers: this.layers,
            interleaved: true,
            pickingRadius: PICKING_RADIUS,
            onClick: this.handleClick,
            layerFilter: this.layerFilter,
            getCursor: ({ isDragging, isHovering }) =>
              isDragging ? 'grabbing' : isHovering || this.overviewHit ? 'pointer' : 'grab',
          })
        )
        this.mymap?.addControl(this.deckOverlay)
      }
    })
    this.mymap.on('move', this.handleMove)
    this.mymap.on('mousemove', this.handleMouseMove)
    this.mymap.on('mouseout', this.handleMouseOut)
  },

  beforeUnmount() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
    window.clearTimeout(this.dimTimer)
    window.clearTimeout(this.restTimer)
    delete (window as TestWindow).__testdata__
  },

  methods: {
    // e2e hook: what each deck layer was handed (CPU side only -- not what the GPU drew)
    updateTestData() {
      const layers: Record<string, { count: number | null; visible: boolean }> = {}
      for (const layer of this.layers as Layer[]) {
        const data = layer.props.data as { length?: number } | null
        layers[layer.id] = {
          count: data && typeof data === 'object' ? data.length ?? null : null,
          visible: layer.props.visible,
        }
      }
      ;(window as TestWindow).__testdata__ = {
        layers,
        dimPlan: this.dimPlan,
        // [lon, lat] -> pixels within the map container, to aim the mouse at a plan
        project: (lngLat: [number, number]) => {
          const p = this.mymap?.project(lngLat)
          return p ? [p.x, p.y] : null
        },
      }
    },

    // Grey out the other plans once the mouse rests on this one; leaving every plan
    // restores the colors straight away (both fade, see COLOR_FADE)
    setHoverPlan(plan: string | null) {
      if (plan === this.hoverPlan) return // another leg/activity of the same plan
      this.hoverPlan = plan
      window.clearTimeout(this.dimTimer)
      if (!plan) this.dimPlan = null
      else if (plan !== this.dimPlan) {
        this.dimTimer = window.setTimeout(() => (this.dimPlan = plan), DIM_DELAY_MS)
      }
    },

    // An activity's color, by its value in the configured column (e.g. its activity_type)
    activityColor(value: unknown): RGBA {
      return this.colors.activities.colorOf(value, ACTIVITY_COLOR)
    },

    // The value a plan-view activity is colored by. (Its plan row has every column; the
    // "Show everyone" overview loads just this one, as its `kind`.)
    activityValue(d: ActivityStop): unknown {
      const row = d.row as Record<string, unknown> | undefined
      return row ? row[this.colors.activities.column] : d.type
    },

    // A leg's color by mode; `fallback` when nothing matches and the config has no default
    legColor(fallback: RGBA) {
      return (mode: unknown) => this.colors.legs.colorOf(mode, fallback)
    },

    // A plan object's own color, or grey when another plan is being hovered
    planColor(d: { row?: { person_id: string; plan_num: number } }, color: Color): Color {
      if (!this.dimPlan || !d.row || planKey(d.row) === this.dimPlan) return color
      return DIMMED_COLOR
    },

    handleMove() {
      if (this.mapIsIndependent) return
      const center = this.mymap?.getCenter()
      if (!center) return
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

    // The object under the mouse. "Show everyone" layers hold binary data, so deck.gl only
    // hands over an index: turn it into a stand-in object carrying that item's tooltip row.
    pickedObject(info: Pick<PickingInfo, 'object' | 'index' | 'layer'>): { row?: HoverRow } | null {
      if (info.object) return info.object
      const set = info.layer ? OVERVIEW_PICKS[info.layer.id] : undefined
      const ov = this.overview
      if (!set || !ov || info.index == null || info.index < 0) return null
      let index = info.index
      // road paths: only the routes under way are drawn, in this order
      if (info.layer!.id === 'everyone-routes') index = routeScratch.get(ov)?.ids[index] ?? -1
      if (index < 0) return null
      return { row: overviewHoverRow(ov, set, index) }
    },

    // deck.gl's picking leaves "Show everyone" out, except while pickOverview() runs
    layerFilter({ layer, isPicking }: { layer: Layer; isPicking: boolean }) {
      return !isPicking || this.pickingOverview || !(layer.id in OVERVIEW_PICKS)
    },

    // One pick of everything at (x, y), "Show everyone" included: the topmost item wins.
    pickOverview(x: number, y: number): PickingInfo | null {
      this.pickingOverview = true
      try {
        return this.deckOverlay?.pickObject({ x, y, radius: PICKING_RADIUS }) ?? null
      } finally {
        this.pickingOverview = false
      }
    },

    // Mouse moves only (re)start the rest timer; a rested-on "Show everyone" item keeps its
    // tooltip until the mouse leaves it. Searched plans are picked by deck.gl as usual.
    handleMouseMove(e: maplibregl.MapMouseEvent) {
      window.clearTimeout(this.restTimer)
      const { x, y } = e.point
      const hit = this.overviewHit
      if (hit && Math.hypot(x - hit.x, y - hit.y) > REST_LEAVE_PX) this.clearOverviewHit()
      if (!this.overview || e.originalEvent.buttons) return
      this.restTimer = window.setTimeout(() => this.pickAtRest(x, y), REST_PICK_MS)
    },

    handleMouseOut() {
      window.clearTimeout(this.restTimer)
      this.clearOverviewHit()
    },

    pickAtRest(x: number, y: number) {
      const info = this.pickOverview(x, y)
      // a searched plan (or the hovered one) on top: deck.gl's own hover already has it
      if (!info?.layer || !(info.layer.id in OVERVIEW_PICKS)) {
        this.clearOverviewHit()
        return
      }
      this.overviewHit = { layerId: info.layer.id, index: info.index, x, y }
      this.showTooltip(this.pickedObject(info), x, y)
    },

    clearOverviewHit() {
      if (!this.overviewHit) return
      this.overviewHit = null
      this.showTooltip(null, 0, 0)
    },

    // deck.gl's hover (searched plans, the hovered plan's own layers)
    getTooltip(info: PickingInfo) {
      const object = this.pickedObject(info)
      // e.g. the rested-on plan, now redrawn in color on top: deck.gl's hover takes over
      if (object) this.overviewHit = null
      this.showTooltip(object, info.x, info.y)
    },

    showTooltip(object: { row?: HoverRow } | null, x: number, y: number) {
      // the plan-table row behind this leg/activity, so the table can light it up (null clears)
      this.$emit('hover-row', object?.row ?? null)
      this.setHoverPlan(object?.row ? planKey(object.row) : null)

      if (!object) {
        this.tooltipCoord.display = 'none'
        this.tip = null
        return
      }

      // just what the tooltip needs: the pick info also holds deck.gl's (frozen) layer
      this.tip = { x, y, object }

      this.tooltipCoord.display = 'block'
      this.tooltipCoord.top = `${y + 18}px`
      this.tooltipCoord.left = `${x + 12}px`
    },

    handleClick(event: PickingInfo) {
      if (!this.onClick) return
      let object = this.pickedObject(event)
      // deck.gl's click pick leaves "Show everyone" out: look there too
      if (!object && this.overview) {
        const info = this.pickOverview(event.x, event.y)
        if (info) object = this.pickedObject(info)
      }
      // no object: send null as message that blank area was clicked
      this.onClick(object)
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
