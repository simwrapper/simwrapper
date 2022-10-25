import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'

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

// -------------------------------------------------------------------
export default function Component({
  viewId = 0,
  pointLayers = [] as { coordinates: Float32Array; time: Float32Array; color: Uint8Array }[],
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

  function getTooltip({ index }: { index: number }) {
    if (index < 0) return null

    return {
      // html: `\
      //   <b>${highlights.length ? 'Count' : metric}: ${count} </b><br/>
      //   ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
      //   Number.isFinite(lng) ? lng.toFixed(4) : ''
      // }
      // `,
      html: `<p>${index}</p>`,
      style: dark
        ? { color: '#ccc', backgroundColor: '#2a3c4f' }
        : { color: '#223', backgroundColor: 'white' },
    }
  }

  // add a scatterplotlayer for each set of points in pointLayers
  const layers = pointLayers.map(
    (points, i) =>
      new ScatterplotLayer({
        data: {
          length: points.time.length,
          attributes: {
            getPosition: { value: points.coordinates, size: 2 },
            getFilterValue: { value: points.time, size: 1 },
            getFillColor: { value: points.color, size: 3 },
          },
        },
        autoHighlight: true,
        extensions: [dataFilter],
        id: 'xyt-layer-' + i,
        filled: true,
        filterRange: timeFilter.length ? timeFilter : null,
        getRadius: 3, // (d: any) => 5, // Math.sqrt(d...),
        highlightColor: [255, 0, 224],
        opacity: 1,
        parameters: { depthTest: false },
        pickable: true,
        radiusScale: 1,
        // radiusUnits: 'pixels',
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
      useDevicePixels={true}
      viewState={viewState}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
      pickingRadius={4}
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
