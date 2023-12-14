import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { DataFilterExtension } from '@deck.gl/extensions'
import * as timeConvert from 'convert-seconds'

import { REACT_VIEW_HANDLES, MAPBOX_TOKEN } from '@/Globals'
import ScatterplotColorBinsLayer from '@/plugins/xy-time/ScatterplotColorBinsLayer'
import globalStore from '@/store'

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
  pointLayers = [] as {
    coordinates: Float32Array
    time: Float32Array
    color: Uint8Array
    value: Float32Array
    timeRange: number[]
  }[],
  timeFilter = [] as number[],
  dark = false,
  colors = [
    [1, 0, 0],
    [0.25, 0.25, 1],
  ] as number[][],
  breakpoints = [0.0] as number[],
  radius = 5,
  mapIsIndependent = false,
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

  function getTooltip(element: any, click: boolean) {
    if (element.index < 0) return null

    const layerId = element?.layer?.id
    if (layerId === undefined) return null

    const time = pointLayers[layerId].time[element.index]
    const humanTime = convertSecondsToClockTimeMinutes(time)

    const value = pointLayers[layerId].value[element.index]
    const cleanValue = Math.round(1e6 * value) / 1e6
    return {
      html: `\
        <table style="font-size: 0.9rem">
        <tr>
          <td>Value</td>
          <td style="padding-left: 0.5rem;"><b>${cleanValue}</b></td>
        </tr><tr>
          <td style="text-align: right;">Time</td>
          <td style="padding-left: 0.5rem;"><b>${humanTime}</b></td>
        </tr>
        </table>
      `,
      style: dark
        ? { color: '#ccc', backgroundColor: '#2a3c4f' }
        : { color: '#223', backgroundColor: 'white' },
    }
  }

  // add a scatterplotlayer for each set of points in pointLayers
  const layers = pointLayers.map((points, layerIndex) => {
    // The entire layer can be hidden if all of its points
    // are beyond the timeFilter range that is being shown.
    const outOfRange = points.timeRange[0] > timeFilter[1] || points.timeRange[1] < timeFilter[0]

    //@ts-ignore
    return new ScatterplotColorBinsLayer({
      data: {
        length: points.time.length,
        attributes: {
          getPosition: { value: points.coordinates, size: 2 },
          getFilterValue: { value: points.time, size: 1 },
          getValue: { value: points.value, size: 1 },
        },
      },
      autoHighlight: true,
      breakpoints: breakpoints,
      colors: colors,
      extensions: [dataFilter],
      id: layerIndex,
      filled: true,
      filterRange: timeFilter.length ? timeFilter : null,
      getRadius: radius, // 5 // (d: any) => Math.sqrt(d...),
      // getFillColor: [10, 50, 10],
      highlightColor: [255, 0, 224],
      opacity: 1,
      parameters: { depthTest: false },
      pickable: true,
      radiusScale: 1,
      stroked: false,
      updateTriggers: {
        getPosition: pointLayers,
        getFillColor: pointLayers,
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

  // initialViewState={initialViewState}
  return (
    <DeckGL
      layers={layers}
      controller={true}
      useDevicePixels={true}
      viewState={viewState}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
      pickingRadius={4}
      onClick={getTooltip}
      getTooltip={getTooltip}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap
          mapStyle={globalStore.getters.mapStyle}
          preventStyleDiffing={true}
          mapboxApiAccessToken={MAPBOX_TOKEN}
        />
      }
    </DeckGL>
  )
}
