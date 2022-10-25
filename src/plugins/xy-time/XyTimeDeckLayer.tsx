import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import * as timeConvert from 'convert-seconds'

import { REACT_VIEW_HANDLES, MAPBOX_TOKEN } from '@/Globals'
import globalStore from '@/store'

const dataFilter = new DataFilterExtension({ filterSize: 1 })

const INITIAL_VIEW = {
  zoom: 9,
  longitude: 13.4,
  latitude: 52.5,
  pitch: 0,
  bearing: 0,
}

function convertSecondsToClockTimeMinutes(index: number) {
  const seconds = index // this.getSecondsFromSlider(index)

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
  }[],
  timeFilter = [] as number[],
  dark = false,
}) {
  // manage SimWrapper centralized viewState - for linked maps
  const [viewState, setViewState] = useState(INITIAL_VIEW) // globalStore.state.viewState)
  // const initialViewState = Object.assign({}, INITIAL_VIEW)

  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  function handleViewState(view: any) {
    if (!view.latitude) return
    view.center = [view.longitude, view.latitude]
    setViewState(view)
    globalStore.commit('setMapCamera', view)
  }

  function getTooltip(element: any) {
    if (element.index < 0) return null

    console.log(element)

    const layerId = element?.layer?.id
    if (layerId === undefined) return null

    const time = pointLayers[layerId].time[element.index]
    const humanTime = convertSecondsToClockTimeMinutes(time)

    const value = pointLayers[layerId].value[element.index]

    return {
      // html: `\
      //   <b>${highlights.length ? 'Count' : metric}: ${count} </b><br/>
      //   ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
      //   Number.isFinite(lng) ? lng.toFixed(4) : ''
      // }
      // `,
      html: `\
      <table style="font-size: 0.9rem">
      <tr>
        <td>Value</td>
        <td style="padding-left: 0.5rem;"><b>${value}</b></td>
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
  const layers = pointLayers.map(
    (points, layerIndex) =>
      new ScatterplotLayer({
        data: {
          length: points.time.length,
          attributes: {
            getPosition: { value: points.coordinates, size: 2 },
            getFilterValue: { value: points.time, size: 1 },
            getFillColor: { value: points.color, size: 3 },
          },
        },
        autoHighlight: false,
        extensions: [dataFilter],
        id: layerIndex,
        filled: true,
        filterRange: timeFilter.length ? timeFilter : null,
        getRadius: 3, // (d: any) => 5, // Math.sqrt(d...),
        highlightColor: [255, 0, 224],
        opacity: 1,
        parameters: { depthTest: false },
        pickable: true,
        radiusScale: 1,
        stroked: false,
        useDevicePixels: false,
        updateTriggers: {
          getPosition: pointLayers,
          getFillColor: pointLayers,
          getFilterValue: timeFilter,
        },
      })
  )

  // initialViewState={initialViewState}
  return (
    <DeckGL
      layers={layers}
      controller={true}
      useDevicePixels={false}
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
