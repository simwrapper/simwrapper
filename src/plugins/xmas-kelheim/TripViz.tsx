import React, { useState, useMemo, useEffect } from 'react'
import { StaticMap } from 'react-map-gl'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'
import DeckGL from '@deck.gl/react'

import DrtRequestLayer from './DrtRequestLayer'
import MovingIconsLayer from '@/layers/moving-icons/moving-icons-layer'
import MovingVehiclesLayer from '@/layers/moving-icons/moving-icons-vehicles-layer'
import PathTraceLayer from '@/layers/PathTraceLayer'
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

const ICON_MAPPING = {
  diamond: { x: 0, y: 0, width: 256, height: 256, mask: false },
  vehicle: { x: 0, y: 0, width: 256, height: 256, mask: true },
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
  viewId: number
  dark: boolean
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
  trafficLayers: any[]
}) {
  const {
    simulationTime,
    paths,
    traces,
    drtRequests,
    settingsShowLayers,
    center,
    dark,
    vehicleLookup,
    searchEnabled,
    onClick,
    viewId,
    trafficLayers,
  } = props

  const theme = DEFAULT_THEME

  // set initial view
  const [viewState, setViewState] = useState(
    center
      ? ({
          center: [16, 42],
          longitude: center[0],
          latitude: center[1],
          pitch: 0,
          bearing: 0,
          zoom: 10,
        } as any)
      : Object.assign({}, globalStore.state.viewState)
  )

  // register setViewState in global view updater so we can respond to external map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  const arcWidth = 2
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
          <b>{vehicleId}</b>
        </big>
        <div>Passagiere: {object.occ} </div>
      </div>
    )
  }

  if (settingsShowLayers.backgroundTraffic) {
    // add the vehicle motion layer in each traffic layer
    trafficLayers.forEach((layer: any, layerIndex: number) => {
      // The entire layer can be hidden if all of its points
      // are beyond the timeFilter range that is being shown.
      const outOfRange =
        layer.vehicles.t0[0] > simulationTime ||
        layer.vehicles.t1[layer.vehicles.t1.length - 1] < simulationTime

      // console.log(outOfRange)
      layers.push(
        //@ts-ignore
        new MovingVehiclesLayer({
          data: {
            length: layer.vehicles.t0.length,
            attributes: {
              getTimeStart: { value: layer.vehicles.t0, size: 1 },
              getTimeEnd: { value: layer.vehicles.t1, size: 1 },
              getPathStart: { value: layer.vehicles.locO, size: 2 },
              getPathEnd: { value: layer.vehicles.locD, size: 2 },
            },
          },
          id: 'vehicles' + layerIndex,
          // getIcon: (d: any) => 'vehicle',
          getColor: [255, 32, 32], // (d: any) => props.colors[d.occ],
          iconMoving: 'vehicle',
          iconStill: 'diamond',
          getSize: 20, // searchEnabled ? 56 : 44,
          opacity: 1,
          currentTime: simulationTime,
          shadowEnabled: true,
          iconAtlas: `${BASE_URL}images/veh-curvy5.png`,
          iconMapping: ICON_MAPPING,
          sizeScale: 0.4,
          billboard: false,
          pickable: true,
          depthTest: true,
          autoHighlight: false,
          highlightColor: [255, 0, 255],
          // onHover: setHoverInfo,
          parameters: {
            depthTest: false,
          },
          visible: !outOfRange,
        })
      )
    })
  }

  if (settingsShowLayers.routes)
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
        getWidth: 3, // (d: any) => 3.0 * (d.occ + 1) - 1,
        opacity: 0.8,
        widthMinPixels: 1,
        rounded: false,
        shadowEnabled: false,
        searchFlag: searchEnabled ? 1.0 : 0.0,
        pickable: true,
        autoHighlight: true,
        highlightColor: [255, 0, 255],
        onHover: setHoverInfo,
      })
    )

  if (settingsShowLayers.vehicles)
    layers.push(
      //@ts-ignore
      new MovingIconsLayer({
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
        getSize: 96,
        opacity: 1.0,
        currentTime: simulationTime,
        shadowEnabled: false,
        noAlloc: true,
        iconAtlas: `${BASE_URL}images/veh-curvy2.png`,
        iconMapping: ICON_MAPPING,
        sizeScale: 0.4,
        billboard: false,
        pickable: true,
        depthTest: true,
        autoHighlight: false,
        highlightColor: [255, 0, 255],
        onHover: setHoverInfo,
        parameters: {
          depthTest: false,
        },
      })
    )

  if (settingsShowLayers.requests)
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
        getTargetColor: [255, 255, 255],
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
      viewState={viewState}
      controller={true}
      getCursor={() => 'pointer'}
      onClick={handleClick}
      onViewStateChange={(e: any) => {
        globalStore.commit('setMapCamera', e.viewState)
      }}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap mapStyle={globalStore.getters.mapStyle} mapboxApiAccessToken={MAPBOX_TOKEN} />
      }
      {renderTooltip({ hoverInfo })}
    </DeckGL>
  )
}
