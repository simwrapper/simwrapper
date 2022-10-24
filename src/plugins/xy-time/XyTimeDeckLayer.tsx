import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'

import { MAPBOX_TOKEN } from '@/Globals'
import globalStore from '@/store'

const INITIAL_VIEW = {
  zoom: 9,
  longitude: 13.4,
  latitude: 52.5,
  pitch: 0,
  bearing: 0,
}

export default function Layer({
  pointLayers = [] as { coordinates: Float32Array; time: Float32Array; color: Uint8Array }[],
  timeFilter = [] as number[],
  dark = false,
}) {
  // draw begins here --------------------------------------------------

  const initialViewState = Object.assign({}, INITIAL_VIEW)

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
        extensions: [new DataFilterExtension({ filterSize: 1 })],
        id: 'xyt-layer-' + i,
        filled: true,
        filterRange: timeFilter.length ? timeFilter : null,
        getRadius: 3, // (d: any) => 5, // Math.sqrt(d...),
        opacity: 1,
        parameters: { depthTest: false },
        pickable: false,
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

  return (
    <DeckGL
      layers={layers}
      useDevicePixels={true}
      initialViewState={initialViewState}
      controller={true}
      onViewStateChange={(e: any) => {
        globalStore.commit('setMapCamera', e.viewState)
      }}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap mapStyle={globalStore.getters.mapStyle} mapboxApiAccessToken={MAPBOX_TOKEN} />
      }
    </DeckGL>
  )
}
