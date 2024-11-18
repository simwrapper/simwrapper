import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import * as timeConvert from 'convert-seconds'

import { REACT_VIEW_HANDLES, MAPBOX_TOKEN } from '@/Globals'
import ScatterplotColorBinsLayer from '@/plugins/xy-time/ScatterplotColorBinsLayer'
import MovingIconsLayer from '@/layers/moving-icons/moving-icons-vehicles-layer'
import globalStore from '@/store'
import { NetworkLinks } from '@/js/DashboardDataManager'

const BASE_URL = import.meta.env.BASE_URL

const ICON_MAPPING = {
  marker: { x: 0, y: 0, width: 128, height: 128, mask: true },
  info: { x: 128, y: 0, width: 128, height: 128, mask: true },
  vehicle: { x: 128, y: 128, width: 128, height: 128, mask: true },
  diamond: { x: 0, y: 128, width: 128, height: 128, mask: false },
}

const dataFilter = new DataFilterExtension({ filterSize: 1 })

// -------------------------------------------------------------------
export default function Component({
  viewId = 0,
  eventLayers = [] as any[],
  eventData = [] as any[],
  network = {} as NetworkLinks,
  linkIdLookup = {} as any,
  timeFilter = [] as number[],
  dark = false,
  colors = [
    [1, 0, 0],
    [0.25, 0.25, 1],
  ] as number[][],
  breakpoints = [0.0] as number[],
  radius = 5,
  mapIsIndependent = false,
  simulationTime = 18000,
  projection = '',
  dotsize = 18,
}) {
  // manage SimWrapper centralized viewState - for linked maps
  const [viewState, setViewState] = useState(globalStore.state.viewState)

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

  const realData = useMemo(() => {
    const big = eventData[0]
    const size = big.length / 6

    const t0 = new Float32Array(size)
    const t1 = new Float32Array(size)
    const p0 = new Float32Array(size * 2)
    const p1 = new Float32Array(size * 2)

    for (let i = 0; i < size; i++) {
      const o = i * 6
      t0[i] = big[o]
      t1[i] = big[o + 1]
      p0[i * 2] = big[o + 2]
      p0[i * 2 + 1] = big[o + 3]
      p1[i * 2] = big[o + 4]
      p1[i * 2 + 1] = big[o + 5]
    }

    const answer = { t0, t1, p0, p1 }
    console.log(answer)
    return answer
  }, [eventData])

  // add the vehicle motion layer in each eventLayer
  const vehicleLayers = [eventData[0]].map((layer, layerIndex) => {
    // The entire layer can be hidden if all of its points
    // are beyond the timeFilter range that is being shown.
    // const outOfRange =
    //   layer.vehicles.t0[0] > timeFilter[1] ||
    //   layer.vehicles.t1[layer.vehicles.t1.length - 1] < timeFilter[0]
    // // console.log(outOfRange)

    //@ts-ignore
    return new MovingIconsLayer({
      data: {
        length: layer.length / 6,
        attributes: {
          getTimeStart: realData.t0,
          getTimeEnd: realData.t1,
          getPathStart: realData.p0,
          getPathEnd: realData.p1,
          // getTimeStart: { buffer: layer, size: 1, offset: 0, stride: 24 },
          // getTimeEnd: { buffer: layer, size: 1, offset: 4, stride: 24 },
          // getPathStart: { buffer: layer, size: 2, offset: 8, stride: 24 },
          // getPathEnd: { buffer: layer, size: 2, offset: 16, stride: 24 },
        },
      },
      id: 'vehicles' + layerIndex,
      // getIcon: 'vehicle', //  (d: any) => 'vehicle',
      getColor: [64, 230, 175], // (d: any) => props.colors[d.occ],
      iconMoving: 'vehicle',
      iconStill: 'diamond',
      getSize: dotsize, // searchEnabled ? 56 : 44,
      opacity: 1.0,
      currentTime: simulationTime,
      shadowEnabled: false,
      iconAtlas: `${BASE_URL}icon-atlas.png`, // BASE_URL + '/images/icon-atlas.png',
      iconMapping: ICON_MAPPING,
      sizeScale: 1,
      billboard: false,
      positionFormat: 'XY',
      pickable: true,
      depthTest: true,
      autoHighlight: false,
      highlightColor: [255, 255, 255, 140],
      // onHover: setHoverInfo,
      parameters: { depthTest: false },
      visible: true, // !outOfRange,
    })
  })

  const showBackgroundMap = projection && projection !== 'Atlantis'

  return (
    <DeckGL
      layers={vehicleLayers}
      controller={true}
      useDevicePixels={false}
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
