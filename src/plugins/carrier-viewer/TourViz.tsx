import React, { useState, useMemo, useEffect } from 'react'
import { StaticMap } from 'react-map-gl'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'
import DeckGL from '@deck.gl/react'
import { ArcLayer, IconLayer, PathLayer, TextLayer } from '@deck.gl/layers'
import PathOffsetLayer from '@/layers/PathOffsetLayer'
import { PathStyleExtension } from '@deck.gl/extensions'

import globalStore from '@/store'
import { MAP_STYLES, MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

const ICON_MAPPING = {
  circle: { x: 0, y: 0, width: 128, height: 128, mask: true },
  infoPin: { x: 128, y: 0, width: 128, height: 128, mask: true },
  box: { x: 128, y: 128, width: 128, height: 128, mask: false },
  vehicle: { x: 0, y: 128, width: 128, height: 128, mask: false },
}

const ambientLight = new AmbientLight({
  color: [255, 255, 255],
  intensity: 1.0,
})

const pointLight = new PointLight({
  color: [255, 255, 255],
  intensity: 2.0,
  position: [-74.05, 40.7, 8000],
})

const lightingEffect = new LightingEffect({ ambientLight, pointLight })

const DEFAULT_THEME = {
  vehicleColor: [200, 130, 250],
  trailColor0: [235, 235, 25],
  trailColor1: [23, 184, 190],
  effects: [lightingEffect],
}

const INITIAL_VIEW_STATE = {
  latitude: 52.5,
  longitude: 13.4,
  zoom: 9,
  pitch: 15,
  minZoom: 1,
  maxZoom: 23,
}

const DRT_REQUEST = {
  time: 0,
  fromX: 1,
  fromY: 2,
  toX: 3,
  toY: 4,
  veh: 5,
  arrival: 6,
}

export default function Component(props: {
  shipments: any[]
  shownRoutes: any[]
  stopMidpoints: any[]
  paths: any[]
  drtRequests: any[]
  traces: any[]
  colors: any
  center: [number, number]
  vehicleLookup: string[]
  searchEnabled: boolean
  onClick: any
  viewId: number
}) {
  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [hoverInfo, setHoverInfo] = useState({} as any)

  const mapStyle = globalStore.state.isDarkMode ? MAP_STYLES.dark : MAP_STYLES.light
  const { shipments, shownRoutes, stopMidpoints, center, searchEnabled, onClick } = props

  const theme = DEFAULT_THEME

  const layers: any = []

  // register setViewState in global view updater
  // so we can respond to external map motion
  REACT_VIEW_HANDLES[props.viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

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
                    {a}:
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

  layers.push(
    //@ts-ignore:
    new PathLayer({
      id: 'shipmentLocationDashedLine',
      data: stopMidpoints,
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
      parameters: {
        depthTest: false,
      },
      getDashArray: [3, 2],
      dashJustified: true,
      extensions: [new PathStyleExtension({ dash: true })],
    })
  )

  layers.push(
    //@ts-ignore:
    new PathOffsetLayer({
      id: 'deliveryroutes',
      data: shownRoutes,
      getPath: (d: any) => d.points,
      getColor: (d: any) => d.color,
      getOffset: 2, // 2: RIGHT-SIDE TRAFFIC
      opacity: 1,
      widthMinPixels: 12,
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

  // destination circles
  layers.push(
    //@ts-ignore
    new IconLayer({
      id: 'dest-circles',
      data: stopMidpoints,
      getIcon: (d: any) => 'circle',
      getColor: (d: any) => (d.count ? [255, 255, 255] : [255, 255, 0]), // [64, 255, 64]), // d.color,
      getPosition: (d: any) => d.midpoint,
      getSize: (d: any) => (d.count ? 38 : 64),
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
      data: stopMidpoints,
      backgroundColor: [255, 255, 255],
      getColor: [0, 0, 0],
      getPosition: (d: any) => d.midpoint,
      getText: (d: any) => `${d.label}`,
      getTextAnchor: 'middle',
      getSize: 18,
      opacity: 1.0,
      noAlloc: false,
      sizeScale: 1,
      pickable: false,
      autoHighlight: false,
    })
  )

  layers.push(
    //@ts-ignore:
    new ArcLayer({
      id: 'shipments',
      data: shipments,
      getSourcePosition: (d: any) => [d.fromX, d.fromY],
      getTargetPosition: (d: any) => [d.toX, d.toY],
      getSourceColor: [255, 0, 255],
      getTargetColor: [200, 255, 255],
      getWidth: 2.0,
      opacity: 0.75,
      // searchFlag: searchEnabled ? 1.0 : 0.0,
      parameters: {
        depthTest: false,
      },
    })
  )

  return (
    <DeckGL
      layers={layers}
      effects={theme.effects}
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
        <StaticMap mapStyle={mapStyle} mapboxApiAccessToken={MAPBOX_TOKEN} />
      }
      {renderTooltip({ hoverInfo })}
    </DeckGL>
  )
}
