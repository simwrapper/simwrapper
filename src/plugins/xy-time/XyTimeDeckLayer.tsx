import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { ScatterplotLayer } from '@deck.gl/layers'
import { DataFilterExtension } from '@deck.gl/extensions'
import colormap from 'colormap'

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
  dark = false,
  // onClick = {} as any,
}) {
  // draw begins here

  const initialViewState = Object.assign({}, INITIAL_VIEW)

  const colors = colormap({
    colormap: 'chlorophyll', // colorRamp,
    nshades: 10,
    format: 'rba',
    alpha: 1,
  }).map((c: number[]) => [c[0], c[1], c[2]])

  // console.log({ colors })

  function getTooltip({ object }: any) {
    if (!object || !object.position || !object.position.length) {
      return null
    }

    const lat = object.position[1]
    const lng = object.position[0]
    const count = object?.points?.length || 'wat'

    return {
      html: `\
        <b>here</b><br/>${count} </b><br/>
        ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
        Number.isFinite(lng) ? lng.toFixed(4) : ''
      }
      `,
      style: dark
        ? { color: '#ccc', backgroundColor: '#2a3c4f' }
        : { color: '#223', backgroundColor: 'white' },
    }
  }

  function handleClick(target: any, event: any) {
    // onClick(target, event)
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
        extensions: [new DataFilterExtension({ filterSize: 1 })],
        id: 'xyt-layer-' + i,
        filled: true,
        opacity: 1,
        pickable: false,
        radiusScale: 1,
        stroked: false,
        getRadius: 4, // (d: any) => 5, // Math.sqrt(d.exits),
        parameters: { depthTest: false },
        filterRange: [20000, 23599],
        // radiusUnits: 'pixels',
      })
  )

  return (
    <DeckGL
      layers={layers}
      initialViewState={initialViewState}
      controller={true}
      getTooltip={getTooltip}
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
    </DeckGL>
  )
}
