import React, { useState, useMemo, useEffect } from 'react'
import { StaticMap } from 'react-map-gl'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'
import DeckGL from '@deck.gl/react'
import { ArcLayer, ScatterplotLayer, IconLayer, PathLayer, TextLayer } from '@deck.gl/layers'
import PathOffsetLayer from '@/layers/PathOffsetLayer'
import { PathStyleExtension } from '@deck.gl/extensions'

import globalStore from '@/store'
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

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

const ActivityColor = {
  pickup: [0, 150, 255],
  delivery: [240, 0, 60],
  service: [255, 64, 255],
}

export default function Component(props: {
  activeTab: string
  shipments: Shipment[]
  legs: any[]
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

  const {
    dark,
    activeTab,
    numSelectedTours,
    shipments,
    depots,
    legs,
    settings,
    stopActivities,
    center,
    onClick,
    projection,
  } = props

  const { simplifyTours, scaleFactor, shipmentDotsOnTourMap } = settings

  // range is (1/) 16384 - 0.000001
  // scaleFactor is 0-100, which we invert and shift to [14 to -6], then 2^value is widthScale.
  let widthScale = scaleFactor == 0 ? 1e-6 : 1 / Math.pow(2, (100 - scaleFactor) / 5 - 6.0)

  const layers: any = []

  // register setViewState in global view updater
  // so we can respond to external map motion
  REACT_VIEW_HANDLES[props.viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

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

    // console.log(555, object)

    if (object?.type == 'pickup') return renderActivityTooltip(hoverInfo, 'pickup')
    if (object?.type == 'delivery') return renderActivityTooltip(hoverInfo, 'delivery')
    if (object?.color) return renderLegTooltip(hoverInfo)
    if (object?.type == 'depot') return null
    return renderStopTooltip(hoverInfo)
  }

  function renderActivityTooltip(hoverInfo: any, activity: string) {
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
        <b>{object?.tour?.vehicleId}</b>
        <br />
        Leg # {1 + object?.count} <br />
        Shipments on board: {object?.shipmentsOnBoard?.length} <br />
        Total size: {object?.totalSize}
      </div>
    )
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

    const numPickupsAndDeliveries = pickups + deliveries
    const overview = { visits, pickups, deliveries } as any

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

            {/* <tr>
              <td
                style={{
                  fontSize: '1rem',
                  fontWeight: 'bold',
                  textAlign: 'right',
                  paddingRight: '0.5rem',
                }}
              >
                {object.type} {object.count}:
              </td>
              <td style={{ fontSize: '1rem', fontWeight: 'bold' }}> {object.id}</td>
            </tr> */}

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

  function clickedDepot() {}

  if (activeTab == 'tours') {
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

    if (simplifyTours) {
      layers.push(
        //@ts-ignore:
        new ArcLayer({
          id: 'leg-arcs',
          data: legs,
          getSourcePosition: (d: any) => d.points[0],
          getTargetPosition: (d: any) => d.points[d.points.length - 1],
          getSourceColor: (d: any) => d.color, // [200, 32, 224],
          getTargetColor: (d: any) => d.color, // [200, 32, 224],
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
        new PathOffsetLayer({
          id: 'deliveryroutes',
          data: legs,
          getPath: (d: any) => d.points,
          getColor: (d: any) => d.color,
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
          if (pickups && deliveries) return [0, 0, 255]
          if (pickups) return ActivityColor.pickup
          if (deliveries) return ActivityColor.delivery
          return [240, 130, 0]
        },
        getPosition: (d: any) => d.midpoint,
        getText: (d: any) =>
          d.label == 'Depot' ? d.label : numSelectedTours !== 1 ? ' ' : `${d.label}`,
        getSize: (d: any) => (d.label == 'Depot' ? 11 : numSelectedTours !== 1 ? 4 : 11),
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

  // shipment panel
  if (activeTab == 'shipments') {
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
        getWidth: scaleFactor ? (d: any) => parseInt(d.$size) || 1.0 : 1,
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

  // DEPOTS ------
  layers.push(
    //@ts-ignore:
    new TextLayer({
      id: 'depots',
      data: depots,
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
      onHover: setHoverInfo,
    })
  )

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
