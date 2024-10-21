import React, { useState, useMemo, useEffect, useRef } from 'react'
import { StaticMap } from 'react-map-gl'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'
import DeckGL from '@deck.gl/react'
import { ArcLayer, ScatterplotLayer, IconLayer, PathLayer, TextLayer } from '@deck.gl/layers'
import PathOffsetLayer from '@/layers/PathOffsetLayer'
import { PathStyleExtension } from '@deck.gl/extensions'

import globalStore from '@/store'
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import { formatScalarComplex } from '../matrix/local/vis-utils'

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

interface lspShipmentChain {
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

var totalShipments = 0


export default function Component(props: {
  activeTab: string
  shipments: Shipment[]
  lspShipmentChains: lspShipmentChain[]
  carrierTours: lspShipmentChain[]
  legs: any[]
  carrierServices: {}
  showHub: boolean
  hubLocation: any[]
  hubName: string
  stopActivities: any[]
  depots: { link: string; midpoint: number[]; coords: number[] }[]
  colors: any
  center: [number, number]
  onClick: any
  viewId: number
  settings: any
  dark: boolean
  numSelectedTours: number
  projection: string
}) {

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [hoverInfo, setHoverInfo] = useState({} as any)
  const [pickupsAndDeliveries, setPickupsAndDeliveries] = useState({
    type: 'activity',
    pickups: [] as any[],
    deliveries: [] as any[],
  })

  var {
    dark,
    activeTab,
    numSelectedTours,
    lspShipmentChains,
    shipments,
    depots,
    legs,
    settings,
    stopActivities,
    center,
    onClick,
    projection,
  } = props


  const { simplifyTours, scaleFactor, shipmentDotsOnTourMap, showEachCarrierTour } = settings

  // range is (1/) 16384 - 0.000001
  // scaleFactor is 0-100, which we invert and shift to [14 to -6], then 2^value is widthScale.
  let widthScale = scaleFactor == 0 ? 1e-6 : 1 / Math.pow(2, (100 - scaleFactor) / 5 - 6.0)

  var [layers, setLayers] = useState<any[]>([]);
  const prevHubChains = useRef(lspShipmentChains)

  // register setViewState in global view updater
  // so we can respond to external map motion
  REACT_VIEW_HANDLES[props.viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  // useEffect(() => {
  //   formerTab = activeTab
  // }, [props.activeTab])

  // update pickups and deliveries only when shipments change ----------------------
  useEffect(() => {
    const pickups: { [xy: string]: { type: string; coord: number[]; shipmentIds: string[] } } = {}
    const deliveries: { [xy: string]: { type: string; coord: number[]; shipmentIds: string[] } } =
      {}

    shipments.forEach(shipment => {
      let xy = `${shipment.fromX}-${shipment.fromY}`
      if (!pickups[xy])
        pickups[xy] = { type: 'pickup', shipmentIds: [], coord: [shipment.fromX, shipment.fromY] }
      pickups[xy].shipmentIds.push(shipment.$id)

      xy = `${shipment.toX}-${shipment.toY}`
      if (!deliveries[xy])
        deliveries[xy] = { type: 'delivery', shipmentIds: [], coord: [shipment.toX, shipment.toY] }
      deliveries[xy].shipmentIds.push(shipment.$id)
    })

    setPickupsAndDeliveries({
      type: 'activity',
      pickups: Object.values(pickups),
      deliveries: Object.values(deliveries),
    })
  }, [shipments])

  function handleClick(event: any) {
    if (!event.object) {
      // no object: send null as message that blank area was clicked
      onClick(null)
    } else {
      onClick(event.object)
    }
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    globalStore.commit('setMapCamera', view)
  }

  function renderTooltip(hoverInfo: any) {

    const { object } = hoverInfo
    if (!object) return null

    if (object?.type == 'pickup') return renderActivityTooltip(hoverInfo, 'pickup')
    if (object?.type == 'delivery') return renderActivityTooltip(hoverInfo, 'delivery')
    if (object?.type == 'leg') return renderTourTooltip(hoverInfo)
    if (object?.color) return renderLegTooltip(hoverInfo)
    if (object?.label == 'Depot') return renderHubInfo(hoverInfo)
    return renderStopTooltip(hoverInfo)
  }

  function renderActivityTooltip(hoverInfo: any, activity: string) {
    // console.log(hoverInfo)
    const { object, x, y } = hoverInfo
    return (
      <div
        className="tooltip"
        style={{
          backgroundColor: '#334455ee',
          boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
          color: '#eee',
          padding: '0.5rem 0.5rem',
          position: 'absolute',
          opacity: 0.9,
          left: x + 20,
          top: y + 20,
        }}
      >
        <table style={{ maxWidth: '30rem', fontSize: '0.8rem' }}>
          <tbody>
            <tr>
              <td style={{ textAlign: 'right', paddingRight: '0.5rem', paddingTop: '0.2rem' }}>
                {activity}:
              </td>
              <td style={{ paddingTop: '0.2rem' }}>{object.shipmentIds.join(', ')}</td>
            </tr>
          </tbody>
        </table>
      </div>
    )
  }


  function renderLegTooltip(hoverInfo: any) {

    const { object, x, y } = hoverInfo

    if (hoverInfo.layer.id == "HubChain") {

      return (
        <div
          className="tooltip"
          style={{
            fontSize: '0.8rem',
            backgroundColor: '#334455ee',
            boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
            color: '#eee',
            padding: '0.5rem 0.5rem',
            position: 'absolute',
            left: x + 20,
            top: y - 30,
          }}
        >
          Total Shipment Count: {totalShipments} <br />
          Chain Type: {object?.chainId} <br />
        </div>
      )
    } else {

      return (

        <div
          className="tooltip"
          style={{
            fontSize: '0.8rem',
            backgroundColor: '#334455ee',
            boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
            color: '#eee',
            padding: '0.5rem 0.5rem',
            position: 'absolute',
            left: x + 20,
            top: y - 30,
          }}
        >
          Shipment Id: {object.shipmentId} <br />

        </div>
      )
    }

  }

  function renderTourTooltip(hoverInfo: any) {

    const { object, x, y } = hoverInfo

    return (
      <div
        className="tooltip"
        style={{
          fontSize: '0.8rem',
          backgroundColor: '#334455ee',
          boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
          color: '#eee',
          padding: '0.5rem 0.5rem',
          position: 'absolute',
          left: x + 20,
          top: y - 30,
        }}
      >
        Vehicle Id: {object?.tour.vehicleId} <br />
        Tour Id: {object?.tour.tourId} <br />
      </div>
    )
  }

  function renderHubInfo(hoverInfo: any) {


  }



  function renderStopTooltip(hoverInfo: any) {
    const { object, x, y } = hoverInfo

    // collect some info
    const visits = object.visits.length
    const pickups = object.visits.reduce(
      (prev: number, visit: any) => prev + visit.pickup.length,
      0
    )
    const deliveries = object.visits.reduce(
      (prev: number, visit: any) => prev + visit.delivery.length,
      0
    )

    const services = object.visits.reduce(
      (prev: number, visit: any) => prev + visit.service.length,
      0
    )

    const numPickupsAndDeliveries = pickups + deliveries
    const overview = { visits, pickups, deliveries, services } as any

    // delivery stop has complicated position stuff
    const tipHeight = Object.keys(object).length * 20 + 32 // good guess
    let yPosition = y - 30
    if (yPosition + tipHeight > window.innerHeight) {
      yPosition = y - tipHeight
    }

    return (
      <div
        className="tooltip"
        style={{
          fontSize: '0.7rem',
          backgroundColor: '#334455ee',
          boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
          color: '#eee',
          padding: '0.5rem 0.5rem',
          position: 'absolute',
          left: x + 20,
          top: yPosition,
        }}
      >
        <table
          style={{
            fontSize: '0.8rem',
          }}
        >
          <tbody>
            {Object.keys(overview).map((a: any) => {
              return (
                <tr key={a}>
                  <td style={{ textAlign: 'right', paddingRight: '0.5rem' }}>{a}:</td>
                  <td style={{ fontWeight: 'bold' }}> {overview[a]}</td>
                </tr>
              )
            })}

            {numPickupsAndDeliveries == 1 &&
              Object.keys(object.details).map((a: any) => {
                return (
                  <tr key={a}>
                    <td
                      style={{ textAlign: 'right', paddingRight: '0.5rem', paddingTop: '0.2rem' }}
                    >
                      {a.slice(1)}:
                    </td>
                    <td style={{ paddingTop: '0.2rem' }}>{object.details[a]}</td>
                  </tr>
                )
              })}
          </tbody>
        </table>
      </div>
    )
  }

  console.log(props.carrierServices)

  if (activeTab == 'lspTours') {

    layers = []

    const opacity = shipments.length > 1 ? 32 : 255

    function getLspTourColor(vehicleId: string) {
      // Simple hash function to generate a number from the string
      let hash = 0;
      for (let i = 0; i < vehicleId.length; i++) {
        hash = vehicleId.charCodeAt(i) + ((hash << 5) - hash);
      }

      // Generate RGB values by mapping parts of the hash to the 0-255 range
      const r = (hash & 0xFF0000) >> 16;
      const g = (hash & 0x00FF00) >> 8;
      const b = hash & 0x0000FF;

      return [r, g, b];
    }

    function getCarrierToursColors(leg: any) {
      // Simple hash function to generate a number from the string
      let hash = 0;
      for (let i = 0; i < leg.tour.tourId.length; i++) {
        hash = leg.tour.tourId.charCodeAt(i) + ((hash << 5) - hash);
      }

      hash *= leg.tour.tourNumber
      // Use the hash to generate a hue value (0 - 360)
      const hue = (hash % 360 + 360) % 360; // Ensures hue is positive

      // Use fixed saturation and lightness to keep the colors vivid and distinct
      const saturation = 70;  // Percentage (70%)
      const lightness = 50;   // Percentage (50%)

      // Convert HSL to RGB for use in most systems
      return hslToRgb(hue, saturation, lightness);

    }

    // Helper function to convert HSL to RGB
    function hslToRgb(h: number, s: number, l: number) {
      s /= 100;
      l /= 100;

      const k = (n: any) => (n + h / 30) % 12;
      const a = s * Math.min(l, 1 - l);
      const f = (n: any) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));

      return [Math.round(f(0) * 255), Math.round(f(8) * 255), Math.round(f(4) * 255)];
    }
    if (props.showHub === true && props.hubLocation.length > 0) {

      layers.push(
        //@ts-ignore:
        new TextLayer({
          id: 'pickupsHubChain',
          data: props.hubLocation,
          getPosition: [props.hubLocation[0], props.hubLocation[1]],
          getText: () => props.hubName,
          getRadius: 2,
          opacity: 0.9,
          background: true,
          backgroundPadding: numSelectedTours !== 1 ? [2, 1, 2, 1] : [3, 2, 3, 1],
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
          onHover: setHoverInfo,
        })
      )
    } else {

      layers.push(
        //@ts-ignore:
        new PathLayer({
          id: 'shipmentLocationDashedLine',
          data: stopActivities,
          getPath: (d: any) => [d.ptFrom, d.ptTo],
          getColor: [128, 128, 128],
          getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
          opacity: 1,
          widthMinPixels: 3,
          rounded: true,
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

      if (!showEachCarrierTour && simplifyTours) {
        layers.push(
          //@ts-ignore:
          new ArcLayer({
            id: 'leg-arcs',
            data: legs,
            getSourcePosition: (d: any) => d.points[0],
            getTargetPosition: (d: any) => d.points[d.points.length - 1],
            getSourceColor: (d: any) => getLspTourColor(d.tour.vehicleId),
            getTargetColor: (d: any) => getLspTourColor(d.tour.vehicleId),
            getWidth: scaleFactor ? (d: any) => d.totalSize / 2 : 3,
            getHeight: 0.5,
            widthMinPixels: 2,
            widthMaxPixels: 200,
            widthUnits: 'pixels',
            widthScale: widthScale,
            opacity: 0.9,
            parameters: { depthTest: false },
            updateTriggers: { getWidth: [scaleFactor] },
            transitions: { getWidth: 150 },
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255], // [64, 255, 64],
            onHover: setHoverInfo,
          })
        )
      } else if (showEachCarrierTour && !simplifyTours) {
        layers.push(
          //@ts-ignore:
          new PathLayer({
            id: 'deliveryroutes2',
            data: legs,
            getPath: (d: any) => d.points,
            getColor: (d: any) => getCarrierToursColors(d),
            getWidth: scaleFactor ? (d: any) => d.totalSize : 3,
            getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
            opacity: 1,
            widthMinPixels: 3,
            widthMaxPixels: 200,
            widthUnits: 'pixels',
            widthScale: widthScale,
            rounded: true,
            shadowEnabled: false,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255], // [64, 255, 64],
            onHover: setHoverInfo,
            parameters: { depthTest: false },
            updateTriggers: { getWidth: [scaleFactor] },
            transitions: { getWidth: 150 },
          })
        )
      } else if (simplifyTours && showEachCarrierTour) {
        layers.push(
          //@ts-ignore:
          new ArcLayer({
            id: 'leg-arcs',
            data: legs,
            getSourcePosition: (d: any) => d.points[0],
            getTargetPosition: (d: any) => d.points[d.points.length - 1],
            getSourceColor: (d: any) => getCarrierToursColors(d),
            getTargetColor: (d: any) => getCarrierToursColors(d),
            getWidth: scaleFactor ? (d: any) => d.totalSize / 2 : 3,
            getHeight: 0.5,
            widthMinPixels: 2,
            widthMaxPixels: 200,
            widthUnits: 'pixels',
            widthScale: widthScale,
            opacity: 0.9,
            parameters: { depthTest: false },
            updateTriggers: { getWidth: [scaleFactor] },
            transitions: { getWidth: 150 },
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255], // [64, 255, 64],
            onHover: setHoverInfo,
          })
        )
      } else {
        layers.push(
          //@ts-ignore:
          new PathLayer({
            id: 'deliveryroutes1',
            data: legs,
            getPath: (d: any) => d.points,
            getColor: (d: any) => getLspTourColor(d.tour.vehicleId),
            getWidth: scaleFactor ? (d: any) => d.totalSize : 3,
            getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
            opacity: 1,
            widthMinPixels: 3,
            widthMaxPixels: 200,
            widthUnits: 'pixels',
            widthScale: widthScale,
            rounded: true,
            shadowEnabled: false,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 255, 255], // [64, 255, 64],
            onHover: setHoverInfo,
            parameters: { depthTest: false },
            updateTriggers: { getWidth: [scaleFactor] },
            transitions: { getWidth: 150 },
          })
        )
      }

      // destination labels


      layers.push(
        //@ts-ignore
        new TextLayer({
          id: 'dest-labels',
          data: stopActivities,
          background: true,
          backgroundPadding: numSelectedTours !== 1 ? [2, 1, 2, 1] : [3, 2, 3, 1],
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
            if (pickups && deliveries) return [0, 0, 255]
            if (pickups) return ActivityColor.pickup
            if (deliveries) return ActivityColor.delivery
            if (services) return ActivityColor.delivery
            return [240, 130, 0]
          },
          getPosition: (d: any) => d.midpoint,
          getText: (d: any) =>
            d.label == 'Hub' ? d.label : numSelectedTours !== 1 ? ' ' : `${d.label}`,
          getSize: (d: any) => (d.label == 'Hub' ? 11 : numSelectedTours !== 1 ? 4 : 11),
          getTextAnchor: 'middle',
          getAlignmentBaseline: 'center',
          opacity: 1,
          noAlloc: false,
          billboard: true,
          sizeScale: 1,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255],
          onHover: setHoverInfo,
          visible: shipmentDotsOnTourMap,
        })
      )

    }
  }

  // shipment panel
  if (activeTab == 'shipments') {

    if (props.showHub && props.hubLocation.length > 0) {
      layers.push(
        //@ts-ignore:
        new TextLayer({
          id: 'shipmentHubs',
          data: props.hubLocation,
          getPosition: [props.hubLocation[0], props.hubLocation[1]],
          getText: () => props.hubName,
          getRadius: 2,
          opacity: 0.9,
          background: true,
          backgroundPadding: numSelectedTours !== 1 ? [2, 1, 2, 1] : [3, 2, 3, 1],
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
          onHover: setHoverInfo,
        })
      )
    } else {
      layers.push(
        //@ts-ignore:
        new ScatterplotLayer({
          id: 'deliveries',
          data: pickupsAndDeliveries.deliveries,
          getPosition: (d: any) => d.coord,
          getColor: ActivityColor.delivery,
          getRadius: 3,
          opacity: 0.9,
          parameters: { depthTest: false },
          pickable: true,
          radiusUnits: 'pixels',
          onHover: setHoverInfo,
        })
      )
      layers.push(
        //@ts-ignore:
        new ScatterplotLayer({
          id: 'pickups',
          data: pickupsAndDeliveries.pickups,
          getPosition: (d: any) => d.coord,
          getColor: ActivityColor.pickup,
          getRadius: 2,
          opacity: 0.9,
          parameters: { depthTest: false },
          pickable: true,
          radiusUnits: 'pixels',
          onHover: setHoverInfo,
        })
      )

      const opacity = shipments.length > 1 ? 32 : 255

      layers.push(
        //@ts-ignore:
        new ArcLayer({
          id: 'shipments',
          data: shipments,
          getSourcePosition: (d: any) => [d.fromX, d.fromY],
          getTargetPosition: (d: any) => [d.toX, d.toY],
          getSourceColor: [0, 228, 255, opacity],
          getTargetColor: [240, 0, 60, 224],
          getWidth: parseInt("100") || 1.0 * 0.5,
          widthUnits: 'pixels',
          getHeight: 0.5,
          opacity: 0.9,
          parameters: { depthTest: false },
          widthScale: widthScale,
          widthMinPixels: 1,
          widthMaxPixels: 100,
          updateTriggers: { getWidth: [scaleFactor] },
          transitions: { getWidth: 200 },
        })
      )
    }
  }

  if (activeTab === "lspShipmentChains" && props.showHub && props.hubLocation.length > 0) {
    let lspChainsCopy = lspShipmentChains
    lspShipmentChains = []
    lspShipmentChains = lspChainsCopy
    layers.push(
      //@ts-ignore:
      new TextLayer({
        id: 'lspHubs2',
        data: props.hubLocation,
        getPosition: [props.hubLocation[0], props.hubLocation[1]],
        getText: () => props.hubName,
        getRadius: 2,
        opacity: 0.9,
        background: true,
        backgroundPadding: numSelectedTours !== 1 ? [2, 1, 2, 1] : [3, 2, 3, 1],
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
        onHover: setHoverInfo,
      })
    )
  }

  useEffect(() => {

    const newLayers = []; // Initialize a new layers array

    const opacity = shipments.length > 1 ? 32 : 255

    function getLineWidth(chainIndex: number, shipmentChain: any) {
      if (chainIndex + 1 == Number(shipmentChain.route.length - 1)) {
        return 0.1;
      } else {
        return 2;
      }
    }

    function getSourceColor(chainIndex: number, shipmentChain: any) {
      if (chainIndex + 1 == Number(shipmentChain.route.length - 1)) {
        return [0, 228, 255, opacity];
      } else {
        return [255, 255, 255];
      }
    }

    function getTargetColor(chainIndex: number, shipmentChain: any) {
      if (chainIndex + 1 == Number(shipmentChain.route.length - 1)) {
        return [240, 0, 60, 224];
      } else {
        return [255, 255, 255];
      }
    }

    if (activeTab === "lspShipmentChains" && !props.showHub && props.hubLocation.length == 0) {

      const opacity = shipments.length > 1 ? 32 : 255;

      // Handle direct chains when hubsChains is empty
      if (lspShipmentChains[0].hubsChains.length === 0) {
        newLayers.push(
          new ArcLayer({
            id: 'shipmentdirectchains',
            data: lspShipmentChains[0].directChains,
            getSourcePosition: (d: any) => [d.fromX, d.fromY],
            getTargetPosition: (d: any) => [d.toX, d.toY],
            getSourceColor: [0, 228, 255, opacity],
            getTargetColor: [240, 0, 60, 224],
            getWidth: 1,
            widthUnits: 'pixels',
            getHeight: 0.5,
            opacity: 0.9,
            parameters: { depthTest: false },
            widthScale: widthScale,
            widthMinPixels: 1,
            widthMaxPixels: 100,
            updateTriggers: { getWidth: [scaleFactor] },
            transitions: { getWidth: 200 },
          })
        );

        newLayers.push(
          new ScatterplotLayer({
            id: 'deliveriesHubChain',
            data: lspShipmentChains[0].directChains,
            getPosition: (d: any) => [d.toX, d.toY],
            getColor: ActivityColor.delivery,
            getRadius: 3,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
            onHover: setHoverInfo,
          })
        );

        newLayers.push(
          new ScatterplotLayer({
            id: 'pickupsHubChain',
            data: lspShipmentChains[0].directChains,
            getPosition: (d: any) => [d.fromX, d.fromY],
            getColor: ActivityColor.pickup,
            getRadius: 2,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
          })
        );
      } else {
        totalShipments = 0
        lspShipmentChains[0].hubsChains.forEach(lspShipmentChain => {
          totalShipments++
          for (let i = 0; i < lspShipmentChain.route.length - 1; i++) {
            newLayers.push(
              //@ts-ignore:
              new ArcLayer({
                id: 'shipmenthubchains',
                data: lspShipmentChains[0].hubsChains,
                getSourcePosition: (d: any) => [d.route[i][0], d.route[i][1]],
                getTargetPosition: (d: any) => [d.route[i + 1][0], d.route[i + 1][1]],
                getSourceColor: getSourceColor(i, lspShipmentChain),
                getTargetColor: getTargetColor(i, lspShipmentChain),
                getWidth: getLineWidth(i, lspShipmentChain),
                widthUnits: 'pixels',
                getHeight: 0.5,
                opacity: 0.9,
                parameters: { depthTest: false },
                widthScale: widthScale,
                widthMinPixels: 1,
                widthMaxPixels: 100,
                updateTriggers: { getWidth: [scaleFactor] },
                transitions: { getWidth: 200 },
              })
            )
            newLayers.push(
              //@ts-ignore:
              new ScatterplotLayer({
                id: 'HubChain',
                data: lspShipmentChains[0].hubsChains,
                getPosition: (d: any) => [d.route[i][0], d.route[i][1]],
                getColor: ActivityColor.pickup,
                getRadius: 3,
                opacity: 0.9,
                parameters: { depthTest: false },
                pickable: true,
                radiusUnits: 'pixels',
              })
            )
          }
        })

         newLayers.push(
            //@ts-ignore
            new TextLayer({
              id: 'HubChain',
              data: lspShipmentChains[0].hubsChains,
              getPosition: (d: any) => [d.hubs[0].locationX, d.hubs[0].locationY],
              getText: (d: any) => d.hubs[0].id,
              getAlignmentBaseline: 'center',
              getColor: [255, 255, 255],
              getBackgroundColor: [240, 130, 0],
              background: true,
              backgroundPadding: [2, 2, 2, 2],
              fontWeight: 'normal',
              getSize: 10,
              getTextAnchor: 'middle',
              pickable: true,
              onHover: setHoverInfo
            })
          )

        newLayers.push(
          //@ts-ignore:
          new ScatterplotLayer({
            id: 'deliveriesHubChain',
            data: lspShipmentChains[0].hubsChains,
            getPosition: (d: any) => [d.toX, d.toY],
            getColor: ActivityColor.delivery,
            getRadius: 3,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
            onHover: setHoverInfo,
          })
        )



        newLayers.push(
          //@ts-ignore:
          new ScatterplotLayer({
            id: 'pickupsHubChain',
            data: lspShipmentChains[0].hubsChains,
            getPosition: (d: any) => [d.fromX, d.fromY],
            getColor: ActivityColor.pickup,
            getRadius: 2,
            opacity: 0.9,
            parameters: { depthTest: false },
            pickable: true,
            radiusUnits: 'pixels',
            // onHover: setHoverInfo,
          })
        )
      }
    }
    setLayers(newLayers);
    prevHubChains.current = lspShipmentChains; // Update the ref for the next render
  }, [lspShipmentChains]);




  const showBackgroundMap = projection && projection !== 'Atlantis'

  return (
    <DeckGL
      layers={layers}
      pickingRadius={3}
      controller={true}
      getCursor={() => 'pointer'}
      onClick={handleClick}
      viewState={viewState}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
    >
      {showBackgroundMap && (
        /*
        // @ts-ignore */
        <StaticMap mapboxApiAccessToken={MAPBOX_TOKEN} mapStyle={globalStore.getters.mapStyle} />
      )}
      {renderTooltip(hoverInfo)}
    </DeckGL>
  )
}
