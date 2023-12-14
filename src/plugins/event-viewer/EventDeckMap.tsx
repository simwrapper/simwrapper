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

function convertSecondsToClockTimeMinutes(index: number) {
  const seconds = index

  try {
    const hms = timeConvert(seconds)
    const minutes = ('00' + hms.minutes).slice(-2)
    return `${hms.hours}:${minutes}`
  } catch (e) {
    return '00:00'
  }
}

// -------------------------------------------------------------------
export default function Component({
  viewId = 0,
  eventLayers = [] as any[],
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
  simulationTime = 20000,
  projection = '',
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

    return 'hi'

    // const layerId = element?.layer?.id
    // if (layerId === undefined) return null

    // const time = pointLayers[layerId].time[element.index]
    // const humanTime = convertSecondsToClockTimeMinutes(time)

    // const value = pointLayers[layerId].value[element.index]
    // const cleanValue = Math.round(1e6 * value) / 1e6
    // return {
    //   html: `\
    //     <table style="font-size: 0.9rem">
    //     <tr>
    //       <td>Value</td>
    //       <td style="padding-left: 0.5rem;"><b>${cleanValue}</b></td>
    //     </tr><tr>
    //       <td style="text-align: right;">Time</td>
    //       <td style="padding-left: 0.5rem;"><b>${humanTime}</b></td>
    //     </tr>
    //     </table>
    //   `,
    //   style: dark
    //     ? { color: '#ccc', backgroundColor: '#2a3c4f' }
    //     : { color: '#223', backgroundColor: 'white' },
    // }
  }

  // add a scatterplotlayer for each set of points in eventLayers
  const pointLayers = eventLayers.map((layer, layerIndex) => {
    // The entire layer can be hidden if all of its points
    // are beyond the timeFilter range that is being shown.
    const outOfRange =
      layer.times[0] > timeFilter[1] || layer.times[layer.times.length - 1] < timeFilter[0]

    return new ScatterplotLayer({
      data: {
        length: layer.times.length,
        attributes: {
          getFilterValue: { value: layer.times, size: 1 },
          getPosition: { value: layer.positions, size: 2 },
        },
      },
      autoHighlight: true,
      breakpoints: breakpoints,
      colors: colors,
      extensions: [dataFilter],
      id: 'hello' + layerIndex,
      filled: true,
      filterRange: timeFilter.length ? timeFilter : null,
      getRadius: 20,
      getFillColor: [240, 128, 10],
      highlightColor: [255, 0, 224],
      opacity: 1,
      parameters: { depthTest: false },
      pickable: true,
      radiusScale: 1,
      stroked: false,
      updateTriggers: {
        getPosition: eventLayers,
        //   // getFillColor: pointLayers,
        getFilterValue: timeFilter,
      },
      // transitions: {
      //   getFillColor: 500,
      //   getColor: 500,
      //   getValue: 500,
      //   getFilterValue: 500,
      // },
      // hide layers that are entirely outside the time window filter:
      visible: !outOfRange,
    })
  })

  // add the vehicle motion layer in each eventLayer
  const vehicleLayers = eventLayers.map((layer, layerIndex) => {
    // The entire layer can be hidden if all of its points
    // are beyond the timeFilter range that is being shown.
    const outOfRange =
      layer.vehicles.t0[0] > timeFilter[1] ||
      layer.vehicles.t1[layer.vehicles.t1.length - 1] < timeFilter[0]

    // console.log(outOfRange)
    //@ts-ignore
    return new MovingIconsLayer({
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
      getColor: [64, 96, 255], // (d: any) => props.colors[d.occ],
      iconMoving: 'vehicle',
      iconStill: 'diamond',
      getSize: 20, // searchEnabled ? 56 : 44,
      opacity: 1.0,
      currentTime: simulationTime,
      shadowEnabled: true,
      iconAtlas: BASE_URL + '/images/icon-atlas.png',
      iconMapping: ICON_MAPPING,
      sizeScale: 1,
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
  })

  const allLayers = [...pointLayers, ...vehicleLayers]

  const showBackgroundMap = projection && projection !== 'Atlantis'

  return (
    <DeckGL
      layers={allLayers}
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
