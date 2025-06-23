import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import GL from '@luma.gl/constants'
import { StaticMap } from 'react-map-gl'
import { ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import * as timeConvert from 'convert-seconds'

import * as d3ScaleChromatic from 'd3-scale-chromatic'
import * as d3Interpolate from 'd3-interpolate'
import { scaleSequential } from 'd3-scale'
import { rgb } from 'd3-color'

import { REACT_VIEW_HANDLES, MAPBOX_TOKEN } from '@/Globals'
import ScatterplotColorBinsLayer from '@/plugins/xy-time/ScatterplotColorBinsLayer'
import MovingIconsLayer from '@/layers/moving-icons/moving-icons-vehicles-layer'
import globalStore from '@/store'
import { NetworkLinks } from '@/js/DashboardDataManager'

const BASE_URL = import.meta.env.BASE_URL

const ICON_MAPPING = {
  vehicle: { x: 0, y: 0, width: 256, height: 256, mask: false },
  // diamond: { x: 0, y: 128, width: 128, height: 128, mask: false },
}

const dataFilter = new DataFilterExtension({ filterSize: 1 })

// -------------------------------------------------------------------
export default function EventDeckMap({
  viewId = 0,
  eventLayers = [] as any[],
  eventData = [] as { data: any; timeRange: number[] }[],
  network = {} as NetworkLinks,
  dark = false,
  colors = [
    [1, 0, 0],
    [0.25, 0.25, 1],
  ] as number[][],
  breakpoints = [0.0] as number[],
  mapIsIndependent = false,
  simulationTime = 18000,
  projection = '',
  dotsize = 22,
  tick = 0,
}) {
  // manage SimWrapper centralized viewState - for linked maps
  const [viewState, setViewState] = useState(globalStore.state.viewState)

  // rotation factors are warped at high latitudes. Thanks, mercator
  const latitude = viewState.latitude || (viewState.center && viewState.center[1]) || 35.0
  const latitudeCorrectionFactor = Math.cos((latitude * Math.PI) / 180.0)

  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  function handleViewState(view: any) {
    if (!view.latitude) return

    if (!view.center) view.center = [0, 0]
    view.center[0] = view.longitude
    view.center[1] = view.latitude
    setViewState(view)

    if (!mapIsIndependent) globalStore.commit('setMapCamera', view)
  }

  function getTooltip(element: any) {
    // console.log(element)
    if (element.index < 0) return null
    return null
  }

  // const realData = useMemo(() => {
  //   return eventData.map(eventLayer => {
  //     const big = eventLayer.data
  //     const size = big.length / 7
  //     const t0 = new Float32Array(size)
  //     const t1 = new Float32Array(size)
  //     const p0 = new Float32Array(size * 2)
  //     const p1 = new Float32Array(size * 2)
  //     const colorCode = new Float32Array(size)

  //     let finalTripEndTime = 0

  //     for (let i = 0; i < size; i++) {
  //       const o = i * 7
  //       t0[i] = big[o]
  //       t1[i] = big[o + 1]
  //       p0[i * 2] = big[o + 2]
  //       p0[i * 2 + 1] = big[o + 3]
  //       p1[i * 2] = big[o + 4]
  //       p1[i * 2 + 1] = big[o + 5]
  //       colorCode[i] = big[o + 6]
  //       finalTripEndTime = Math.max(finalTripEndTime, t1[i])
  //     }
  //     const answer = { t0, t1, p0, p1, colorCode: colorCode, finalTripEndTime }
  //     return answer
  //   })
  // }, [eventData])

  // add the vehicle motion layer in each eventLayer
  const vehicleLayers = [] as any[]
  let numActiveLayers = 0
  eventData.forEach((layer, layerIndex) => {
    // The entire layer can be hidden if all of its trips are completely outside the current simulationTime
    // Add 2 seconds to make sure there is overlap
    const outOfRange =
      simulationTime < layer.timeRange[0] - 5 || simulationTime > layer.timeRange[1] + 5

    if (!outOfRange) numActiveLayers++

    vehicleLayers.push(
      //@ts-ignore
      new MovingIconsLayer({
        data: {
          length: layer.data.t0.length,
          attributes: {
            getTimeStart: layer.data.t0,
            getTimeEnd: layer.data.t1,
            getPathStart: layer.data.p0,
            getPathEnd: layer.data.p1,
            getColorCode: layer.data.colors,
          },
        },
        id: 'vehicles' + layerIndex,
        // getIcon: 'vehicle', //  (d: any) => 'vehicle',
        // getColor: [30, 208, 170], // brightColors[layerIndex], // 64 + layerIndex * 25, 64, 250 - layerIndex * 30], // (d: any) => props.colors[d.occ],
        iconMoving: 'vehicle',
        iconStill: 'vehicle',
        colorMap: [
          // 0: no colors: greenish
          30, 208, 170,
          // 1: green
          40, 255, 40,
          // 2: yellow,
          240, 240, 64,
          // 3: red
          240, 0, 0,
        ],
        getSize: dotsize, // searchEnabled ? 56 : 44,
        opacity: 1,
        latitudeCorrectionFactor,
        currentTime: simulationTime,
        shadowEnabled: false,
        iconAtlas: `${BASE_URL}veh-curvy5.png`, // BASE_URL + '/images/icon-atlas.png',
        iconMapping: ICON_MAPPING,
        sizeScale: 1,
        billboard: false,
        positionFormat: 'XY',
        pickable: false,
        depthTest: true,
        autoHighlight: false,
        highlightColor: [255, 255, 255, 140],
        // onHover: setHoverInfo,
        parameters: { depthTest: false },
        visible: !outOfRange,
      })
    )
  })

  const showBackgroundMap = projection && projection !== 'Atlantis'

  if (tick == 1) console.log(simulationTime, numActiveLayers, eventData.length)

  return (
    <DeckGL
      layers={vehicleLayers}
      controller={true}
      useDevicePixels={true}
      viewState={viewState}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
      pickingRadius={4}
      onClick={getTooltip}
      getTooltip={getTooltip}
    >
      {showBackgroundMap && (
        /*
        // @ts-ignore */
        <StaticMap
          mapStyle={globalStore.getters.mapStyle}
          preventStyleDiffing={true}
          mapboxApiAccessToken={MAPBOX_TOKEN}
        />
      )}
    </DeckGL>
  )
}
