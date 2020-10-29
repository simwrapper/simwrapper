import React, { useState, useMemo, useEffect } from 'react'
import { StaticMap } from 'react-map-gl'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'
import DeckGL from '@deck.gl/react'
import { ArcLayer, IconLayer, PathLayer, TextLayer } from '@deck.gl/layers'
// import ShipmentLayer from './ShipmentLayer'

import PathTraceLayer from '@/layers/path-trace/path-trace'

const ICON_MAPPING = {
  circle: { x: 0, y: 0, width: 128, height: 128, mask: true },
  infoPin: { x: 128, y: 0, width: 128, height: 128, mask: true },
  box: { x: 128, y: 128, width: 128, height: 128, mask: false },
  vehicle: { x: 0, y: 128, width: 128, height: 128, mask: false },
}

// Set your mapbox token here
const MAPBOX_TOKEN =
  'pk.eyJ1IjoidnNwLXR1LWJlcmxpbiIsImEiOiJjamNpemh1bmEzNmF0MndudHI5aGFmeXpoIn0.u9f04rjFo7ZbWiSceTTXyA'
// process.env.MapboxAccessToken // eslint-disable-line

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
  simulationTime: number
  paths: any[]
  drtRequests: any[]
  traces: any[]
  colors: any
  center: [number, number]
  settingsShowLayers: { [label: string]: boolean }
  vehicleLookup: string[]
  searchEnabled: boolean
  onClick: any
}) {
  const mapStyle = 'mapbox://styles/vsp-tu-berlin/ckek59op0011219pbwfar1rex'
  // const mapStyle = 'mapbox://styles/vsp-tu-berlin/ckeetelh218ef19ob5nzw5vbh'
  // mapStyle = "mapbox://styles/mapbox/dark-v10",

  const {
    shipments,
    shownRoutes,
    simulationTime,
    paths,
    traces,
    drtRequests,
    settingsShowLayers,
    center,
    vehicleLookup,
    searchEnabled,
    onClick,
  } = props

  const theme = DEFAULT_THEME

  const initialView = Object.assign({}, INITIAL_VIEW_STATE)
  initialView.latitude = center[1]
  initialView.longitude = center[0]

  const [hoverInfo, setHoverInfo] = useState({} as any)

  const layers: any = []

  function handleClick() {
    console.log(hoverInfo)
    // send null as message that blank area was clicked
    if (!hoverInfo.object) {
      onClick(null)
    } else {
      onClick(hoverInfo.object.v)
    }
  }

  function renderTooltip({ hoverInfo }: any) {
    const { object, x, y } = hoverInfo

    if (!object) {
      return null
    }

    return (
      <div
        className="tooltip"
        style={{
          fontSize: '0.7rem',
          backgroundColor: '#f4f4ffdd',
          boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
          color: '#223',
          padding: '1rem 1rem',
          position: 'absolute',
          left: x + 40,
          top: y - 30,
        }}
      >
        <big>
          <b>SHIPMENTS</b>
        </big>
        <div>and other data will go here </div>
      </div>
    )
  }

  // if (settingsShowLayers['Routen'])
  layers.push(
    //@ts-ignore:
    new PathLayer({
      id: 'deliveryroutes',
      data: shownRoutes,
      // currentTime: simulationTime,
      getPath: (d: any) => d.points,
      getColor: (d: any) => d.color,
      getPixelOffset: 10,
      getWidth: 4.0,
      opacity: 1.0,
      widthMinPixels: 4,
      rounded: false,
      shadowEnabled: false,
      // searchFlag: searchEnabled ? 1.0 : 0.0,
      pickable: true,
      autoHighlight: true,
      highlightColor: [64, 255, 64],
      // onHover: setHoverInfo,
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
      data: shownRoutes,
      getIcon: (d: any) => 'circle',
      getColor: (d: any) => (d.count ? [255, 255, 255] : [255, 255, 0]), // [64, 255, 64]), // d.color,
      getPosition: (d: any) => d.points[0],
      getSize: (d: any) => (d.count ? 38 : 64),
      opacity: 1,
      shadowEnabled: true,
      noAlloc: false,
      iconAtlas: '/icon-atlas-3.png',
      iconMapping: ICON_MAPPING,
      sizeScale: 1,
      billboard: true,
      pickable: true,
      autoHighlight: true,
      highlightColor: [255, 0, 255],
      // getTooltip: (d: any) => `Shipment ID will go here\n\nand other stiff`,
      onHover: setHoverInfo,
    })
  )

  // destination labels
  layers.push(
    //@ts-ignore
    new TextLayer({
      id: 'dest-labels',
      data: shownRoutes,
      backgroundColor: [255, 255, 255],
      getColor: [0, 0, 0],
      getPosition: (d: any) => d.points[0],
      getText: (d: any) => `${d.label}`,
      getTextAnchor: 'middle',
      getSize: 18,
      opacity: 1.0,
      noAlloc: false,
      sizeScale: 1,
      pickable: false,
      autoHighlight: false,
      // highlightColor: [255, 0, 255],
      // onHover: setHoverInfo,
    })
  )

  // if (settingsShowLayers['DRT Anfragen']))
  layers.push(
    //@ts-ignore:
    new ArcLayer({
      id: 'shipments',
      data: shipments,
      // currentTime: 1.0, // simulationTime,
      getSourcePosition: (d: any) => [d.fromX, d.fromY],
      getTargetPosition: (d: any) => [d.toX, d.toY],
      // getTimeStart: (d: any) => 0,
      // getTimeEnd: (d: any) => 86400,
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
      initialViewState={initialView}
      controller={true}
      getCursor={() => 'pointer'}
      onClick={handleClick}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap
          reuseMaps
          mapStyle={mapStyle}
          preventStyleDiffing={true}
          mapboxApiAccessToken={MAPBOX_TOKEN}
        />
      }
      {renderTooltip({ hoverInfo })}
    </DeckGL>
  )
}
