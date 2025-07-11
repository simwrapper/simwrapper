import React, { useState, useMemo, useEffect } from 'react'
import { StaticMap } from 'react-map-gl'
import { AmbientLight, PointLight, LightingEffect } from '@deck.gl/core'
import DeckGL from '@deck.gl/react'

import DrtRequestLayer from './DrtRequestLayer'
import MovingIconsLayer from '@/layers/moving-icons/moving-icons-layer'
import PathTraceLayer from '@/layers/PathTraceLayer'
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

const ICON_MAPPING = {
  circle: { x: 0, y: 0, width: 256, height: 256, mask: false },
  vehicle: { x: 256, y: 0, width: 256, height: 256, mask: true },
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

const THEMES = {
  dark: {
    vehicleColor: [200, 130, 250],
    trailColor0: [235, 235, 25],
    trailColor1: [23, 184, 190],
    effects: [lightingEffect],
  },
  light: {
    vehicleColor: [200, 130, 250],
    trailColor0: [235, 235, 25],
    trailColor1: [23, 184, 190],
    effects: [lightingEffect],
  },
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

export default function Component({
  viewId = 0,
  mapIsIndependent = false,
  leftside = false,
  simulationTime = 0,
  paths = [] as any[],
  drtRequests = [] as any[],
  traces = [] as any[],
  colors = [] as any[],
  settingsShowLayers = {} as { [label: string]: boolean },
  vehicleLookup = [] as string[],
  searchEnabled = false,
  onClick = null as any,
}) {
  const locale = globalStore.state.locale
  const theme = THEMES[globalStore.state.isDarkMode ? 'dark' : 'light']

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  // register setViewState in global view updater so we can respond to external map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  // left-side driving icons are just vertically flipped
  const iconAtlas = leftside
    ? `${BASE_URL}images/icon-atlas-vehicles-leftside.png`
    : `${BASE_URL}images/icon-atlas-vehicles.png`

  // rotation factors are warped at high latitudes. Thanks, mercator
  const latitude = viewState.latitude || (viewState.center && viewState.center[1]) || 35.0
  const latitudeCorrectionFactor = Math.cos((latitude * Math.PI) / 180.0)

  const arcWidth = 1
  const [hoverInfo, setHoverInfo] = useState({} as any)

  const layers: any = []

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    if (!mapIsIndependent) globalStore.commit('setMapCamera', view)
  }

  function handleClick() {
    // console.log(hoverInfo)
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
        <div>
          {locale !== 'en' ? 'Passagiere' : 'Passengers'}: {object.occ}
        </div>
      </div>
    )
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
        getColor: (d: any) => colors[d.occ],
        getWidth: 1, // (d: any) => 3.0 * (d.occ + 1) - 1,
        opacity: 0.7,
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
        getColor: (d: any) => colors[d.occ],
        getIcon: (d: any) => 'vehicle',
        latitudeCorrectionFactor,
        iconMoving: 'vehicle',
        iconStill: 'circle',
        getSize: searchEnabled ? 72 : 48,
        opacity: 1.0,
        currentTime: simulationTime,
        shadowEnabled: false,
        noAlloc: true,
        iconAtlas: iconAtlas,
        iconMapping: ICON_MAPPING,
        sizeScale: 0.5,
        billboard: false,
        pickable: true,
        autoHighlight: false,
        highlightColor: [255, 0, 255],
        onHover: setHoverInfo,
        parameters: { depthTest: false },
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
      pickingRadius={4}
      viewState={viewState}
      controller={true}
      getCursor={() => 'pointer'}
      onClick={handleClick}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
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
