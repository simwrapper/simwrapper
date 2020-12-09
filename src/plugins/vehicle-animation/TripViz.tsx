import React, { useState, useMemo, useEffect } from 'react'
import { StaticMap } from 'react-map-gl'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'
import DeckGL from '@deck.gl/react'
import DrtRequestLayer from './DrtRequestLayer'

import MovingIconLayer from '@/layers/moving-icons/moving-icon-layer'
import PathTraceLayer from '@/layers/PathTraceLayer'

const ICON_MAPPING = {
  marker: { x: 0, y: 0, width: 128, height: 128, mask: true },
  info: { x: 128, y: 0, width: 128, height: 128, mask: true },
  vehicle: { x: 128, y: 128, width: 128, height: 128, mask: false },
  diamond: { x: 0, y: 128, width: 128, height: 128, mask: false },
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
  latitude: 52.1,
  longitude: 14,
  zoom: 10,
  pitch: 0,
  minZoom: 2,
  maxZoom: 22,
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

  const arcWidth = 1
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

    const vehicleId = vehicleLookup[object.v]

    return (
      <div
        className="tooltip"
        style={{
          fontSize: '0.8rem',
          backgroundColor: '#ddddeedd',
          borderLeft: '6px solid green',
          boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
          color: '#223',
          padding: '1rem 1rem',
          position: 'absolute',
          left: x + 40,
          top: y - 30,
        }}
      >
        <big>
          <b>Taxi: {vehicleId}</b>
        </big>
        <div>Passagiere: {object.occ} </div>
      </div>
    )
  }

  if (settingsShowLayers['Routen'])
    layers.push(
      //@ts-ignore:
      new PathTraceLayer({
        id: 'Routen',
        data: traces,
        currentTime: simulationTime,
        getSourcePosition: (d: any) => d.p0,
        getTargetPosition: (d: any) => d.p1,
        getTimeStart: (d: any) => d.t0,
        getTimeEnd: (d: any) => d.t1,
        getColor: (d: any) => props.colors[d.occ],
        getWidth: (d: any) => 3.0 * (d.occ + 1) - 1,
        opacity: 0.9,
        widthMinPixels: 2,
        rounded: false,
        shadowEnabled: false,
        searchFlag: searchEnabled ? 1.0 : 0.0,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 0, 255],
        onHover: setHoverInfo,
      })
    )

  if (settingsShowLayers['Fahrzeuge'])
    layers.push(
      //@ts-ignore
      new MovingIconLayer({
        id: 'Vehicles',
        data: paths,
        getPathStart: (d: any) => d.p0,
        getPathEnd: (d: any) => d.p1,
        getTimeStart: (d: any) => d.t0,
        getTimeEnd: (d: any) => d.t1,
        getIcon: (d: any) => 'vehicle',
        getColor: (d: any) => props.colors[d.occ],
        iconMoving: 'vehicle',
        iconStill: 'diamond',
        getSize: searchEnabled ? 56 : 44,
        opacity: 1.0,
        currentTime: simulationTime,
        shadowEnabled: false,
        noAlloc: true,
        iconAtlas: '/icon-atlas.png',
        iconMapping: ICON_MAPPING,
        sizeScale: 1,
        billboard: true,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 0, 255],
        onHover: setHoverInfo,
      })
    )

  if (settingsShowLayers['DRT Anfragen'])
    layers.push(
      //@ts-ignore:
      new DrtRequestLayer({
        id: 'DRT Requests',
        data: drtRequests,
        currentTime: simulationTime,
        getSourcePosition: (d: any) => [d[DRT_REQUEST.fromX], d[DRT_REQUEST.fromY]],
        getTargetPosition: (d: any) => [d[DRT_REQUEST.toX], d[DRT_REQUEST.toY]],
        getTimeStart: (d: any) => d[DRT_REQUEST.time],
        getTimeEnd: (d: any) => d[DRT_REQUEST.arrival],
        getSourceColor: [255, 0, 255],
        getTargetColor: [200, 255, 255],
        getWidth: arcWidth,
        opacity: 0.5,
        searchFlag: searchEnabled ? 1.0 : 0.0,
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
