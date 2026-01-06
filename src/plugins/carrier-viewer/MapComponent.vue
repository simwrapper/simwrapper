<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  MapTooltip.deck-tooltip(v-if="tip" :hoverInfo="tip" :style="tooltipStyle")
</template>

<script lang="ts">
// -------------------------------------------------------------
// Tour viz has several layers, top to bottom:
//
// - shipments (arc layer, orig->destination)
// - destination text on top of circles
// - destination circles
// - delivery legs (path layer, each leg is its own path)
// - shipment link (dashed line on stopActivity link itself)

import { defineComponent, PropType } from 'vue'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ArcLayer, ScatterplotLayer, IconLayer, TextLayer } from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'
import PathLayer from '@/layers/PathOffsetLayer'
import BackgroundLayers from '@/js/BackgroundLayers'

import globalStore from '@/store'
import MapTooltip from './MapTooltip.vue'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'

const BASE_URL = import.meta.env.BASE_URL

interface Shipment {
  $id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
}

interface ShipmentDetails {
  type: string
  coord: number[]
  shipmentIds: string[]
}

const ActivityColor = {
  pickup: [0, 150, 255],
  delivery: [240, 0, 60],
  service: [255, 64, 255],
}

export default defineComponent({
  name: 'MyDeckComponent',
  components: { MapTooltip },
  props: {
    activeTab: { type: String, required: true },
    bgLayers: { type: Object as PropType<BackgroundLayers> },
    dark: { type: Boolean, required: true },
    depots: { type: Array as PropType<{ link: string; midpoint: number[]; coords: number[] }[]> },
    legs: { type: Array, required: true },
    mapIsIndependent: { type: Boolean },
    numSelectedTours: { type: Number, required: true },
    onClick: { type: Function },
    services: { type: Boolean, required: true },
    settings: {
      type: Object as PropType<{
        simplifyTours: boolean
        scaleFactor: number
        shipmentDotsOnTourMap: boolean
      }>,
      required: true,
    },
    shipments: { type: Array as PropType<Shipment[]>, required: true },
    stopActivities: { type: Array, required: true },
    viewId: { type: Number, required: true },
    show3dBuildings: { type: Boolean, required: false, default: false },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      tip: null as any,
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
    layers() {
      const allLayers = [] as any[]

      const extraLayers = this.bgLayers?.layers()
      if (extraLayers) allLayers.push(...extraLayers.layersBelow)

      if (this.activeTab == 'tours') {
        allLayers.push(
          //@ts-ignore:
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
            parameters: { depthTest: false },
            getDashArray: [3, 2],
            dashJustified: true,
            extensions: [new PathStyleExtension({ dash: true })],
          } as any)
        )

        if (this.settings.simplifyTours) {
          allLayers.push(
            //@ts-ignore:
            new ArcLayer({
              id: 'leg-arcs',
              data: this.legs,
              getSourcePosition: (d: any) => d.points[0],
              getTargetPosition: (d: any) => d.points[d.points.length - 1],
              getSourceColor: (d: any) => d.color, // [200, 32, 224],
              getTargetColor: (d: any) => d.color, // [200, 32, 224],
              // scaledValue = targetMin + (inputValue - originalMin) * (targetMax - targetMin) / (originalMax - originalMin);
              getWidth: 2 + ((this.settings.scaleFactor - 0) * (40 - 2)) / (100 - 0),
              getHeight: 0.5,
              widthMinPixels: 2,
              widthMaxPixels: 40,
              widthUnits: 'pixels',
              // widthScale: widthScale,
              opacity: 0.9,
              parameters: { depthTest: false },
              updateTriggers: { getWidth: [this.settings.scaleFactor] },
              transitions: { getWidth: 150 },
              pickable: true,
              autoHighlight: true,
              highlightColor: [255, 255, 255], // [64, 255, 64],
              onHover: this.getTooltip,
              //TODO: ONHOVER
              // onHover: setHoverInfo,
            } as any)
          )
        } else {
          allLayers.push(
            //@ts-ignore:
            new PathLayer({
              id: 'deliveryroutes',
              data: this.legs,
              getPath: (d: any) => d.points,
              getColor: (d: any) => d.color,
              // scaledValue = targetMin + (inputValue - originalMin) * (targetMax - targetMin) / (originalMax - originalMin);
              getWidth: 3 + ((this.settings.scaleFactor - 0) * (40 - 3)) / (100 - 0),
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
              parameters: { depthTest: false },
              updateTriggers: { getWidth: [this.settings.scaleFactor] },
              transitions: { getWidth: 150 },
              onHover: this.getTooltip,
              // onHover: setHoverInfo,
            } as any)
          )
        }

        // destination labels
        allLayers.push(
          //@ts-ignore
          new TextLayer({
            id: 'dest-labels',
            background: true,
            data: this.stopActivities,
            backgroundPadding: this.numSelectedTours !== 1 ? [2, 1, 2, 1] : [3, 2, 3, 1],
            getColor: [255, 255, 255],
            getBackgroundColor: (d: any) => {
              const pickups = d.visits.reduce(
                (prev: number, visit: any) => prev + visit.pickup.length,
                0
              )
              const deliveries = d.visits.reduce(
                (prev: number, visit: any) => prev + visit.delivery.length,
                0
              )
              if (pickups && deliveries) return [0, 0, 255]
              if (pickups) return ActivityColor.pickup
              if (deliveries) return ActivityColor.delivery
              return [240, 130, 0]
            },
            getPosition: (d: any) => d.midpoint,
            getText: (d: any) =>
              d.label == 'Depot' ? d.label : this.numSelectedTours !== 1 ? ' ' : `${d.label}`,
            getSize: (d: any) => (d.label == 'Depot' ? 11 : this.numSelectedTours !== 1 ? 4 : 11),
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            opacity: 1,
            noAlloc: false,
            billboard: true,
            sizeScale: 1,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255],
            visible: this.settings.shipmentDotsOnTourMap,
            onHover: this.getTooltip,
          } as any)
        )
      }

      // shipment panel
      if (this.activeTab == 'shipments') {
        allLayers.push(
          //@ts-ignore:
          new ScatterplotLayer({
            id: 'deliveries',
            data: this.pickupsAndDeliveries.deliveries,
            getPosition: (d: any) => d.coord,
            getFillColor: ActivityColor.delivery,
            getRadius: 3,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
            onHover: this.getTooltip,
            // onHover: setHoverInfo,
          } as any)
        )
        allLayers.push(
          //@ts-ignore:
          new ScatterplotLayer({
            id: 'pickups',
            data: this.pickupsAndDeliveries.pickups,
            getPosition: (d: any) => d.coord,
            getFillColor: ActivityColor.pickup,
            getRadius: 2,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
            onHover: this.getTooltip,
            // onHover: setHoverInfo,
          } as any)
        )

        const opacity = this.shipments.length > 1 ? 32 : 255

        if (this.services) {
          allLayers.push(
            //@ts-ignore:
            new ScatterplotLayer({
              id: 'services',
              data: this.shipments,
              getPosition: (d: any) => [d.toX, d.toY],
              getColor: [240, 0, 60, 224],
              getRadius: 4,
              opacity: 0.9,
              parameters: { depthTest: false },
              pickable: true,
              radiusUnits: 'pixels',
              onHover: this.getTooltip,
              // onHover: setHoverInfo,
            } as any)
          )
        } else {
          allLayers.push(
            //@ts-ignore:
            new ArcLayer({
              id: 'shipments',
              data: this.shipments,
              getSourcePosition: (d: any) => [d.fromX, d.fromY],
              getTargetPosition: (d: any) => [d.toX, d.toY],
              getSourceColor: [0, 228, 255, opacity],
              getTargetColor: [240, 0, 60, 224],
              // scaledValue = targetMin + (inputValue - originalMin) * (targetMax - targetMin) / (originalMax - originalMin);
              getWidth: 1 + ((this.settings.scaleFactor - 0) * (50 - 1)) / (100 - 0),
              widthUnits: 'pixels',
              getHeight: 0.5,
              opacity: 0.9,
              parameters: { depthTest: false },
              // widthScale: widthScale,
              widthMinPixels: 1,
              widthMaxPixels: 50,
              updateTriggers: { getWidth: [this.settings.scaleFactor] },
              transitions: { getWidth: 200 },
              onHover: this.getTooltip,
            } as any)
          )
        }
      }

      if (this.activeTab == 'services') {
        if (this.services) {
          allLayers.push(
            //@ts-ignore:
            new ScatterplotLayer({
              id: 'services',
              data: this.shipments,
              getPosition: (d: any) => [d.toX, d.toY],
              getColor: [240, 0, 60, 224],
              getRadius: 4,
              opacity: 0.9,
              parameters: { depthTest: false },
              pickable: true,
              radiusUnits: 'pixels',
              onHover: this.getTooltip,
              // onHover: setHoverInfo,
            } as any)
          )
        }
      }

      // DEPOTS ------
      allLayers.push(
        //@ts-ignore:
        new TextLayer({
          id: 'depots',
          data: this.depots,
          background: true,
          backgroundPadding: [3, 2, 3, 1],
          getColor: [255, 255, 255],
          getBackgroundColor: [0, 150, 240],
          getPosition: (d: any) => d.midpoint,
          getText: (d: any) => 'Depot',
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          getSize: 11,
          opacity: 1,
          noAlloc: false,
          billboard: true,
          sizeScale: 1,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255],
          onHover: this.getTooltip,
          // onHover: setHoverInfo,
        } as any)
      )

      // ON-TOP layers
      if (extraLayers) allLayers.push(...extraLayers.layersOnTop)

      // all done! Phew
      return allLayers
    },

    pickupsAndDeliveries() {
      const pickups: { [xy: string]: ShipmentDetails } = {}
      const deliveries: { [xy: string]: ShipmentDetails } = {}

      this.shipments.forEach(shipment => {
        let xy = `${shipment.fromX}-${shipment.fromY}`
        if (!pickups[xy])
          pickups[xy] = { type: 'pickup', shipmentIds: [], coord: [shipment.fromX, shipment.fromY] }
        pickups[xy].shipmentIds.push(shipment.$id)

        xy = `${shipment.toX}-${shipment.toY}`
        if (!deliveries[xy])
          deliveries[xy] = {
            type: 'delivery',
            shipmentIds: [],
            coord: [shipment.toX, shipment.toY],
          }
        deliveries[xy].shipmentIds.push(shipment.$id)
      })

      return {
        type: 'activity',
        pickups: Object.values(pickups),
        deliveries: Object.values(deliveries),
      }
    },

    widthScale() {
      // range is (1/) 16384 - 0.000001
      // scaleFactor is 0-100, which we invert and shift to [14 to -6], then 2^value is widthScale.
      let scaleFactor = this.settings.scaleFactor
      let scale = scaleFactor == 0 ? 1e-6 : 1 / Math.pow(2, (100 - scaleFactor) / 5 - 6.0)
      return scale
    },
  },

  async mounted() {
    const style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    const zoom = (this.globalState.viewState.zoom || 8) as number
    //@ts-ignore
    this.mymap = new maplibregl.Map({
      center,
      zoom,
      container,
      style,
    })
    this.mymap.on('style.load', () => {
      if (this.show3dBuildings && this.mymap) {
        enable3DBuildings(this.mymap)
      }

      this.deckOverlay = new MapboxOverlay({
        layers: this.layers,
        interleaved: true,
        onClick: this.handleClick,
      })
      this.mymap?.addControl(this.deckOverlay)
    })
    this.mymap.on('move', this.handleMove)
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
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
        this.tooltipStyle.display = 'none'
        this.tip = null
        return
      }

      this.tip = { ...tip }

      this.tooltipStyle.display = 'block'
      this.tooltipStyle.top = `${y + 12}px`
      this.tooltipStyle.left = `${x + 12}px`
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
  z-index: 10000;
  pointer-events: none;
}
</style>
