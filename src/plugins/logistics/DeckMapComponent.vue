<template lang="pug">
.deck-map.flex-col
  .map-container(:id="`map-${viewId}`")
  MapTooltip.deck-tooltip(v-if="tip"
    :hoverInfo="tip" :style="tooltipStyle" :totalShipmentsPerHub="totalShipmentsPerHub"
  )
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'
import maplibregl from 'maplibre-gl'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { ArcLayer, ScatterplotLayer, PathLayer, TextLayer } from '@deck.gl/layers'
import { PathStyleExtension } from '@deck.gl/extensions'

import globalStore from '@/store'
import MapTooltip from './MapTooltip.vue'

const BASE_URL = import.meta.env.BASE_URL

// -------------------------------------------------------------
// Tour viz has several layers, top to bottom:
//
// - shipments (arc layer, orig->destination)
// - destination text on top of circles
// - destination circles
// - delivery legs (path layer, each leg is its own path)
// - shipment link (dashed line on stopActivity link itself)

interface Shipment {
  $id: string
  fromX: number
  fromY: number
  toX: number
  toY: number
}

interface LspShipmentChain {
  chainId: string
  from: number
  hubs: []
  isDirectChain: boolean
  shipmentId: string
  toX: number
  toY: number
  fromX: number
  fromY: number
  route: []
  color: number
  hubsChains: any[]
  directChains: any[]
}

const ActivityColor = {
  pickup: [0, 150, 255],
  delivery: [240, 0, 60],
  service: [255, 64, 255],
}

interface hubShipment {
  hubId: String
  shipmentTotal: number
}

export default defineComponent({
  name: 'LogisticsDeckComponent',
  components: { MapTooltip },
  props: {
    activeTab: { type: String, required: true },
    carrierServices: { type: Set },
    carrierTours: { type: Array as PropType<LspShipmentChain[]>, required: true },
    center: { type: Array as PropType<number[]> },
    dark: { type: Boolean, required: true },
    depots: { type: Array as PropType<{ link: string; midpoint: number[]; coords: number[] }[]> },
    hubLocation: { type: Array as PropType<any[]>, required: true },
    hubName: { type: String, required: true },
    legs: { type: Array as PropType<any[]>, required: true },
    lspShipmentChains: { type: Array as PropType<LspShipmentChain[]>, required: true },
    numSelectedTours: { type: Number, required: true },
    onClick: { type: Function, required: true },
    projection: { type: String, required: true },
    settings: { type: Object, required: true },
    shipments: { type: Array as PropType<Shipment[]>, required: true },
    showHub: { type: Boolean, required: true },
    stopActivities: { type: Array as PropType<any[]>, required: true },
    tourHubs: { type: Array as PropType<any[]>, required: true },
    viewId: { type: Number, required: true },
  },

  data() {
    return {
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      globalState: globalStore.state,
      prevHubChains: this.lspShipmentChains,
      totalShipmentsPerHub: [] as hubShipment[],
      tip: null as any,
      tooltipStyle: {
        position: 'absolute',
        padding: '4px 8px',
        display: 'block',
        top: 0,
        left: 0,
        zIndex: 20000,
      } as any,
    }
  },

  watch: {
    layers() {
      if (!this.deckOverlay) return

      this.deckOverlay.setProps({
        layers: this.layers,
      })
    },

    dark() {
      let style: any
      if (this.projection && this.projection !== 'Atlantis') {
        style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
      } else {
        style = { version: 8, sources: {}, layers: [] }
      }
      this.mymap?.setStyle(style)
    },

    'globalState.viewState'() {
      // if (this.mapIsIndependent) return
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
    pickupsAndDeliveries() {
      const pickups: { [xy: string]: { type: string; coord: number[]; shipmentIds: string[] } } = {}
      const deliveries: { [xy: string]: { type: string; coord: number[]; shipmentIds: string[] } } =
        {}

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
      return this.settings.scaleFactor == 0
        ? 1e-6
        : 1 / Math.pow(2, (100 - this.settings.scaleFactor) / 5 - 6.0)
    },

    widthScaleShipments() {
      return this.settings.scaleFactorShipments == 0
        ? 1e-6
        : 1 / Math.pow(2, (100 - this.settings.scaleFactorShipments) / 5 - 6.0)
    },

    layers(): any[] {
      const layers = [] as any[]

      if (this.activeTab == 'lspTours') {
        layers.push(...this.getLspTourLayers())
      }

      if (this.activeTab == 'shipments' && this.settings.scaleFactorShipments === 0) {
        layers.push(...this.setShipments())
      }

      if (this.activeTab === 'lspShipmentChains' && this.showHub && this.hubLocation.length > 0) {
        // let lspChainsCopy = this.lspShipmentChains
        // lspShipmentChains = []
        // lspShipmentChains = lspChainsCopy
        layers.push(
          //@ts-ignore:
          new TextLayer({
            id: 'lspHubs2',
            data: this.hubLocation,
            getPosition: [this.hubLocation[0], this.hubLocation[1]],
            getText: () => this.hubName,
            getRadius: 2,
            opacity: 0.9,
            background: true,
            backgroundPadding: this.numSelectedTours !== 1 ? [2, 1, 2, 1] : [3, 2, 3, 1],
            getBackgroundColor: () => [240, 130, 0],
            getColor: [255, 255, 255],
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
            getSize: (d: any) => 11,
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            noAlloc: false,
            billboard: true,
            sizeScale: 1,
            autoHighlight: true,
          })
        )
      }
      if (this.activeTab == 'lspShipmentChains' && !this.showHub && this.hubLocation.length == 0) {
        layers.push(...this.getLspShipmentChainLayers())
      }
      return layers
    },
  },

  mounted() {
    let style: any
    if (this.projection && this.projection !== 'Atlantis') {
      style = `${BASE_URL}map-styles/${this.globalState.isDarkMode ? 'dark' : 'positron'}.json`
    } else {
      style = { version: 8, sources: {}, layers: [] }
    }

    const container = `map-${this.viewId}`
    const center = this.globalState.viewState.center as [number, number]
    //@ts-ignore
    this.mymap = new maplibregl.Map({
      container,
      style,
      center,
      zoom: 7,
    })
    this.mymap.on('move', this.handleMove)
    this.mymap.on('style.load', () => {
      this.deckOverlay = new MapboxOverlay({
        interleaved: true,
        layers: this.layers,
        onClick: this.handleClick,
        onHover: this.getTooltip,
      } as any)
      this.mymap?.addControl(this.deckOverlay)
    })
  },

  beforeDestroy() {
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
  },

  methods: {
    getLineWidth(chainIndex: number, shipmentChain: any) {
      if (chainIndex + 1 == Number(shipmentChain.route.length - 1)) {
        return 1 * (this.settings.scaleFactor / 2)
      } else {
        return 3 * (this.settings.scaleFactor / 2)
      }
    },

    getSourceColor(chainIndex: number, shipmentChain: any) {
      const opacity = this.shipments.length > 1 ? 32 : 255
      if (chainIndex + 1 == Number(shipmentChain.route.length - 1)) {
        return [0, 228, 255, opacity]
      } else {
        return [255, 140, 0]
      }
    },

    getTargetColor(chainIndex: number, shipmentChain: any) {
      if (chainIndex + 1 == Number(shipmentChain.route.length - 1)) {
        return [240, 0, 60, 224]
      } else {
        return [255, 140, 0]
      }
    },

    getLspShipmentChainLayers() {
      const newLayers = [] as any[]
      const opacity = this.shipments.length > 1 ? 32 : 255

      // Handle direct chains when hubsChains is empty
      if (this.lspShipmentChains[0].hubsChains.length === 0) {
        newLayers.push(
          new ArcLayer({
            id: 'shipmentdirectchains',
            data: this.lspShipmentChains[0].directChains,
            getSourcePosition: (d: any) => [d.fromX, d.fromY],
            getTargetPosition: (d: any) => [d.toX, d.toY],
            getSourceColor: [0, 228, 255, opacity],
            getTargetColor: [240, 0, 60, 224],
            getWidth: this.settings.scaleFactor ? (d: any) => parseInt(d.$size) || 1.0 : 1,
            widthUnits: 'pixels',
            getHeight: 0.5,
            opacity: 0.9,
            parameters: { depthTest: false },
            widthScale: this.settings.widthScale,
            widthMinPixels: 1,
            widthMaxPixels: 100,
            updateTriggers: { getWidth: [this.settings.scaleFactor] },
            transitions: { getWidth: 200 },
          })
        )

        newLayers.push(
          new ScatterplotLayer({
            id: 'deliveriesHubChain',
            data: this.lspShipmentChains[0].directChains,
            getPosition: (d: any) => [d.toX, d.toY],
            getColor: ActivityColor.delivery,
            getRadius: 3,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
          } as any)
        )

        newLayers.push(
          new ScatterplotLayer({
            id: 'pickupsHubChain',
            data: this.lspShipmentChains[0].directChains,
            getPosition: (d: any) => [d.fromX, d.fromY],
            getColor: ActivityColor.pickup,
            getRadius: 2,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
          } as any)
        )
      } else {
        // Flatten the hubsChains to get individual hubs from each chain
        const allHubs = this.lspShipmentChains[0].hubsChains.flatMap((chain: any) => chain.hubs)

        let uniqueHubs = allHubs.reduce((acc, obj) => {
          const existingObj = acc.find((item: any) => JSON.stringify(item) === JSON.stringify(obj))
          if (!existingObj) {
            acc.push(obj)
          }
          return acc
        }, [])

        uniqueHubs.forEach((hub: any) => {
          let newHubShipment: hubShipment = {
            hubId: hub.id,
            shipmentTotal: 0,
          }
          this.totalShipmentsPerHub.push(newHubShipment)
        })

        this.totalShipmentsPerHub.forEach((hub: any) => {
          hub.shipmentTotal = 0
        })

        this.lspShipmentChains[0].hubsChains.forEach(lspShipmentChain => {
          lspShipmentChain.hubs.forEach((hub: any) => {
            const hubExists = uniqueHubs.some((uniqueHub: any) => uniqueHub.id === hub.id)
            if (hubExists) {
              let shipmentHub = this.totalShipmentsPerHub.find(obj => obj.hubId === hub.id)
              if (shipmentHub) {
                shipmentHub.shipmentTotal++
              }
            }
          })

          for (let i = 0; i < lspShipmentChain.route.length - 1; i++) {
            newLayers.push(
              //@ts-ignore:
              new ArcLayer({
                id: 'shipmenthubchains' + '_' + lspShipmentChain.shipmentId + '_route' + i,
                data: [{}],
                getSourcePosition: () => [
                  lspShipmentChain.route[i][0],
                  lspShipmentChain.route[i][1],
                ],
                getTargetPosition: () => [
                  lspShipmentChain.route[i + 1][0],
                  lspShipmentChain.route[i + 1][1],
                ],
                getSourceColor: this.getSourceColor(i, lspShipmentChain),
                getTargetColor: this.getTargetColor(i, lspShipmentChain),
                getWidth: this.getLineWidth(i, lspShipmentChain),
                widthUnits: 'pixels',
                getHeight: 0.5,
                opacity: 0.9,
                parameters: { depthTest: false },
                widthMinPixels: 1,
                widthMaxPixels: 100,
                transitions: { getWidth: 200 },
              } as any)
            )
            newLayers.push(
              //@ts-ignore:
              new ScatterplotLayer({
                id: 'HubChainMarker' + '_' + lspShipmentChain.shipmentId + '_' + i,
                data: [lspShipmentChain],
                getPosition: () => [
                  lspShipmentChain.route[lspShipmentChain.route.length - 1][0],
                  lspShipmentChain.route[lspShipmentChain.route.length - 1][1],
                ],
                getFillColor: ActivityColor.pickup,
                getRadius: 3,
                opacity: 0.9,
                parameters: { depthTest: false },
                pickable: true,
                radiusUnits: 'pixels',
              } as any)
            )
          }
          newLayers.push(
            //@ts-ignore:
            new ScatterplotLayer({
              id: 'pickupsHubChain',
              data: [{}],
              getPosition: (d: any) => [lspShipmentChain.route[0][0], lspShipmentChain.route[0][1]],
              getColor: ActivityColor.pickup,
              getRadius: 2,
              opacity: 0.9,
              parameters: { depthTest: false },
              pickable: true,
              radiusUnits: 'pixels',
              // onHover: setHoverInfo,
            } as any)
          )
        })

        newLayers.push(
          //@ts-ignore
          new TextLayer({
            id: 'HubChain',
            data: allHubs, // Pass all hubs (flattened)
            getPosition: (hub: any) => [hub.locationX, hub.locationY], // Get position of each hub
            getText: (hub: any) => hub.id, // Display each hub's ID as text
            getAlignmentBaseline: 'center',
            getColor: [255, 255, 255],
            getBackgroundColor: [240, 130, 0],
            background: true,
            backgroundPadding: [2, 2, 2, 2],
            fontWeight: 'normal',
            getSize: 10,
            getTextAnchor: 'middle',
            pickable: true,
          })
        )
      }
      return newLayers
    },

    setShipments() {
      const sublayers = [] as any[]
      sublayers.push(
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
        } as any)
      )

      sublayers.push(
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
        } as any)
      )

      const opacity = this.shipments.length > 1 ? 32 : 255

      sublayers.push(
        //@ts-ignore:
        new ArcLayer({
          id: 'shipments',
          data: this.shipments,
          getSourcePosition: (d: any) => [d.fromX, d.fromY],
          getTargetPosition: (d: any) => [d.toX, d.toY],
          getSourceColor: [0, 228, 255, opacity],
          getTargetColor: [240, 0, 60, 224],
          getWidth: this.settings.scaleFactorShipments ? (d: any) => parseInt(d.$size) || 1.0 : 1,
          widthUnits: 'pixels',
          getHeight: 0.5,
          opacity: 0.9,
          parameters: { depthTest: false },
          widthScale: this.settings.widthScaleShipments,
          widthMinPixels: 1,
          widthMaxPixels: 100,
          updateTriggers: { getWidth: [this.settings.scaleFactorShipments] },
          transitions: { getWidth: 200 },
        })
      )
      return sublayers
    },

    getLspTourLayers() {
      const subLayers = [] as any[]

      if (this.showHub === true && this.hubLocation.length > 0) {
        subLayers.push(
          //@ts-ignore:
          new TextLayer({
            id: 'pickupsHubChain',
            data: this.hubLocation,
            getPosition: [this.hubLocation[0], this.hubLocation[1]],
            getText: () => this.hubName,
            getRadius: 2,
            opacity: 0.9,
            background: true,
            backgroundPadding: this.numSelectedTours !== 1 ? [2, 1, 2, 1] : [3, 2, 3, 1],
            getBackgroundColor: () => [240, 130, 0],
            getColor: [255, 255, 255],
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
            getSize: (d: any) => 11,
            getTextAnchor: 'middle',
            getAlignmentBaseline: 'center',
            noAlloc: false,
            billboard: true,
            sizeScale: 1,
            autoHighlight: true,
          })
        )
      } else {
        subLayers.push(
          //@ts-ignore:
          new PathLayer({
            id: 'shipmentLocationDashedLine',
            data: this.stopActivities,
            getPath: (d: any) => [d.ptFrom, d.ptTo],
            getColor: [128, 128, 128],
            getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
            opacity: 1,
            widthMinPixels: 3,
            jointRounded: true,
            shadowEnabled: false,
            pickable: false,
            autoHighlight: false,
            highlightColor: [255, 255, 255],
            parameters: { depthTest: false },
            getDashArray: [3, 2],
            dashJustified: true,
            extensions: [new PathStyleExtension({ dash: true })],
          })
        )

        if (this.settings.simplifyTours && !this.settings.showEachCarrierTour) {
          subLayers.push(
            //@ts-ignore:
            new ArcLayer({
              id: 'leg-arcs',
              data: this.legs,
              getSourcePosition: (d: any) => d.points[0],
              getTargetPosition: (d: any) => d.points[d.points.length - 1],
              getSourceColor: (d: any) => this.getLspTourColor(d.tour.vehicleId),
              getTargetColor: (d: any) => this.getLspTourColor(d.tour.vehicleId),
              getWidth: this.settings.scaleFactor ? (d: any) => d.totalSize / 2 : 3,
              getHeight: 0.5,
              widthMinPixels: 2,
              widthMaxPixels: 200,
              widthUnits: 'pixels',
              opacity: 0.9,
              parameters: { depthTest: false },
              updateTriggers: { getWidth: [this.settings.scaleFactor] },
              transitions: { getWidth: 150 },
              pickable: true,
              autoHighlight: true,
              highlightColor: [255, 255, 255], // [64, 255, 64],
            } as any)
          )
        } else if (this.settings.showEachCarrierTour && !this.settings.simplifyTours) {
          subLayers.push(
            //@ts-ignore:
            new PathLayer({
              id: 'deliveryroutes2',
              data: this.legs,
              getPath: (d: any) => d.points,
              getColor: (d: any) => this.getCarrierToursColors(d),
              getWidth: this.settings.scaleFactor ? (d: any) => d.totalSize : 3,
              getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
              opacity: 1,
              widthMinPixels: 3,
              widthMaxPixels: 200,
              widthUnits: 'pixels',
              jointRounded: true,
              shadowEnabled: false,
              pickable: true,
              autoHighlight: true,
              highlightColor: [255, 255, 255], // [64, 255, 64],
              parameters: { depthTest: false },
              updateTriggers: { getWidth: [this.settings.scaleFactor] },
              transitions: { getWidth: 150 },
            } as any)
          )
        } else if (this.settings.simplifyTours && this.settings.showEachCarrierTour) {
          subLayers.push(
            //@ts-ignore:
            new ArcLayer({
              id: 'leg-arcs-showAll',
              data: this.legs,
              getSourcePosition: (d: any) => d.points[0],
              getTargetPosition: (d: any) => d.points[d.points.length - 1],
              getSourceColor: (d: any) => this.getCarrierToursColors(d),
              getTargetColor: (d: any) => this.getCarrierToursColors(d),
              getWidth: this.settings.scaleFactor ? (d: any) => d.totalSize / 2 : 3,
              getHeight: 0.5,
              widthMinPixels: 2,
              widthMaxPixels: 200,
              widthUnits: 'pixels',
              opacity: 0.9,
              parameters: { depthTest: false },
              updateTriggers: { getWidth: [this.settings.scaleFactor] },
              transitions: { getWidth: 150 },
              pickable: true,
              autoHighlight: true,
              highlightColor: [255, 255, 255, 160], // [64, 255, 64],
            } as any)
          )
        } else {
          subLayers.push(
            //@ts-ignore:
            new PathLayer({
              id: 'deliveryroutes1',
              data: this.legs,
              getPath: (d: any) => d.points,
              getColor: (d: any) => this.getLspTourColor(d.tour.vehicleId),
              getWidth: this.settings.scaleFactor ? (d: any) => d.totalSize : 3,
              getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
              opacity: 1,
              widthMinPixels: 3,
              widthMaxPixels: 200,
              widthUnits: 'pixels',
              jointRounded: true,
              shadowEnabled: false,
              pickable: true,
              autoHighlight: true,
              highlightColor: [255, 255, 255], // [64, 255, 64],
              parameters: { depthTest: false },
              updateTriggers: { getWidth: [this.settings.scaleFactor] },
              transitions: { getWidth: 150 },
            } as any)
          )
        }

        subLayers.push(
          //@ts-ignore
          new TextLayer({
            id: 'dest-labels',
            data: this.stopActivities,
            background: true,
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
              const services = d.visits.reduce(
                (prev: number, visit: any) => prev + visit.service.length,
                0
              )
              if (pickups && deliveries && !d.depot) return [0, 0, 255]
              if (pickups && !d.depot) return ActivityColor.pickup
              if (deliveries && !d.depot) return ActivityColor.delivery
              if (services && !d.depot) return ActivityColor.delivery
              if (d.depot) return [240, 130, 0]
              return [240, 130, 0]
            },
            getPosition: (d: any) => d.midpoint,
            getText: (d: any) =>
              d.label == 'Hub' ? d.label : this.numSelectedTours !== 1 ? ' ' : `${d.label}`,
            getSize: (d: any) => (d.label == 'Hub' ? 11 : this.numSelectedTours !== 1 ? 4 : 11),
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
          } as any)
        )

        subLayers.push(
          //@ts-ignore
          new TextLayer({
            id: 'HubChain',
            data: this.tourHubs, // Pass all hubs (flattened)
            getPosition: (hub: any) => [hub.Xcoord, hub.Ycoord], // Get position of each hub
            getText: (hub: any) => hub.hubId, // Display each hub's ID as text
            getAlignmentBaseline: 'center',
            getColor: [255, 255, 255],
            getBackgroundColor: [240, 130, 0],
            background: true,
            backgroundPadding: [2, 2, 2, 2],
            fontWeight: 'normal',
            getSize: 10,
            getTextAnchor: 'middle',
            pickable: true,
          })
        )
      }
      return subLayers
    },

    getLspTourColor(vehicleId: string) {
      // Simple hash function to generate a number from the string
      let hash = 0
      for (let i = 0; i < vehicleId.length; i++) {
        hash = vehicleId.charCodeAt(i) + ((hash << 5) - hash)
      }

      // Generate RGB values by mapping parts of the hash to the 0-255 range
      const r = (hash & 0xff0000) >> 16
      const g = (hash & 0x00ff00) >> 8
      const b = hash & 0x0000ff

      return [r, g, b]
    },

    getCarrierToursColors(leg: any) {
      // Simple hash function to generate a number from the string
      let hash = 0
      for (let i = 0; i < leg.tour.tourId.length; i++) {
        hash = leg.tour.tourId.charCodeAt(i) + ((hash << 5) - hash)
      }

      hash *= leg.tour.tourNumber
      // Use the hash to generate a hue value (0 - 360)
      const hue = ((hash % 360) + 360) % 360 // Ensures hue is positive

      // Use fixed saturation and lightness to keep the colors vivid and distinct
      const saturation = 70 // Percentage (70%)
      const lightness = 50 // Percentage (50%)

      // Convert HSL to RGB for use in most systems
      return this.hslToRgb(hue, saturation, lightness)
    },

    // Helper function to convert HSL to RGB
    hslToRgb(h: number, s: number, l: number) {
      s /= 100
      l /= 100

      const k = (n: any) => (n + h / 30) % 12
      const a = s * Math.min(l, 1 - l)
      const f = (n: any) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)))

      return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)]
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

    oldgetTooltip(tip: { x: number; y: number; object: any }) {
      const { x, y, object } = tip

      if (!object || !object.position || !object.position.length) {
        this.tooltipStyle.display = 'none'
        return
      }

      const html = `\
        <b>tooltip</b> \
      `
      this.tooltipStyle.display = 'block'
      this.tooltipStyle.top = `${y + 12}px`
      this.tooltipStyle.left = `${x + 12}px`
      // this.tooltipHTML = html
    },

    handleClick(event: any) {
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
