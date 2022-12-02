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

const ICON_MAPPING = {
  circle: { x: 0, y: 0, width: 128, height: 128, mask: true },
}

export default function Component(props: {
  activeTab: string
  shipments: Shipment[]
  legs: any[]
  stopActivities: any[]
  colors: any
  center: [number, number]
  onClick: any
  viewId: number
  settings: any
  dark: boolean
}) {
  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [hoverInfo, setHoverInfo] = useState({} as any)
  const [pickupsAndDeliveries, setPickupsAndDeliveries] = useState({
    pickups: [] as any[],
    deliveries: [] as any[],
  })

  const { dark, activeTab, shipments, legs, settings, stopActivities, center, onClick } = props

  const { simplifyTours, scaleShipmentSizes } = settings

  const layers: any = []

  // register setViewState in global view updater
  // so we can respond to external map motion
  REACT_VIEW_HANDLES[props.viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  // update pickups and deliveries only when shipments change ----------------------
  useEffect(() => {
    console.log('runs whenever shipments changes')
    const pickups = new Set()
    const deliveries = new Set()
    shipments.forEach(shipment => {
      pickups.add([shipment.fromX, shipment.fromY])
      deliveries.add([shipment.toX, shipment.toY])
    })
    setPickupsAndDeliveries({ pickups: [...pickups], deliveries: [...deliveries] })
  }, [shipments])

  function handleClick() {
    console.log(hoverInfo)
    // send null as message that blank area was clicked
    if (!hoverInfo.object) {
      onClick(null)
    } else {
      onClick(hoverInfo.object.v)
    }
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    globalStore.commit('setMapCamera', view)
  }

  function renderTooltip({ hoverInfo }: any) {
    const { object, x, y } = hoverInfo

    if (!object) {
      return null
    }

    if (object.color) {
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
            top: y - 30,
          }}
        >
          Leg {object.count + 1}
        </div>
      )
    }

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
            <tr>
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
            </tr>
            {Object.keys(object.details).map((a: any) => {
              return (
                <tr key={a}>
                  <td style={{ textAlign: 'right', paddingRight: '0.5rem', paddingTop: '0.2rem' }}>
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

  if (activeTab == 'tours') {
    layers.push(
      //@ts-ignore:
      new PathLayer({
        id: 'shipmentLocationDashedLine',
        data: stopActivities,
        getPath: (d: any) => [d.ptFrom, d.ptTo],
        getColor: [192, 192, 192],
        getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
        opacity: 1,
        widthMinPixels: 4,
        rounded: true,
        shadowEnabled: false,
        // searchFlag: searchEnabled ? 1.0 : 0.0,
        pickable: false,
        autoHighlight: false,
        highlightColor: [255, 255, 255], // [64, 255, 64],
        // onHover: setHoverInfo,
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
          getHeight: 0.25,
          getSourceColor: [200, 32, 224],
          getTargetColor: [200, 32, 224],
          getWidth: 2.0,
          opacity: 0.75,
          parameters: { depthTest: false },
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
          getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
          opacity: 1,
          widthMinPixels: 6,
          rounded: true,
          shadowEnabled: false,
          // searchFlag: searchEnabled ? 1.0 : 0.0,
          pickable: true,
          autoHighlight: true,
          highlightColor: [255, 255, 255], // [64, 255, 64],
          onHover: setHoverInfo,
          parameters: {
            depthTest: false,
          },
        })
      )
    }

    // destination circles
    layers.push(
      //@ts-ignore
      new IconLayer({
        id: 'dest-circles',
        data: stopActivities,
        getIcon: (d: any) => 'circle',
        getColor: (d: any) => (d.count ? [255, 255, 255] : [128, 255, 255]), // [64, 255, 64]), // d.color,
        getPosition: (d: any) => d.midpoint,
        getSize: (d: any) => (d.count ? 30 : 50),
        opacity: 1,
        shadowEnabled: true,
        noAlloc: false,
        iconAtlas: '/images/icon-atlas-3.png',
        iconMapping: ICON_MAPPING,
        sizeScale: 1,
        billboard: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 0, 255],
        onHover: setHoverInfo,
      })
    )

    // destination labels
    layers.push(
      //@ts-ignore
      new TextLayer({
        id: 'dest-labels',
        data: stopActivities,
        backgroundColor: [255, 255, 255],
        getColor: [0, 0, 0],
        getPosition: (d: any) => d.midpoint,
        getText: (d: any) => `${d.label}`,
        getTextAnchor: 'middle',
        getSize: 12,
        opacity: 1.0,
        noAlloc: false,
        sizeScale: 1,
        pickable: false,
        autoHighlight: false,
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
        // filled: true,
        getPosition: (d: any) => d,
        getColor: [240, 0, 60],
        getRadius: 3,
        opacity: 0.9,
        parameters: { depthTest: false },
        radiusUnits: 'pixels',
      })
    )
    layers.push(
      //@ts-ignore:
      new ScatterplotLayer({
        id: 'pickups',
        data: pickupsAndDeliveries.pickups,
        // filled: true,
        getPosition: (d: any) => d,
        getColor: [0, 150, 255],
        getRadius: 2,
        opacity: 0.9,
        parameters: { depthTest: false },
        radiusUnits: 'pixels',
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
        getWidth: scaleShipmentSizes ? (d: any) => parseInt(d.$size) || 1.0 : 1,
        widthUnits: 'pixels',
        opacity: 0.9,
        parameters: { depthTest: false },
        widthScale: 0.5,
        widthMinPixels: 1,
        updateTriggers: {
          getWidth: [scaleShipmentSizes],
        },
      })
    )
  }

  return (
    <DeckGL
      layers={layers}
      pickingRadius={5}
      controller={true}
      getCursor={() => 'pointer'}
      onClick={handleClick}
      viewState={viewState}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap mapboxApiAccessToken={MAPBOX_TOKEN} mapStyle={globalStore.getters.mapStyle} />
      }
      {renderTooltip({ hoverInfo })}
    </DeckGL>
  )
}
