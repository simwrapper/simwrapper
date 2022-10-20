import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { ScatterplotLayer } from '@deck.gl/layers'
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
  pointLayers = [] as { coordinates: Float32Array; time: Float32Array }[],
  dark = false,
  // onClick = {} as any,
}) {
  // draw begins here

  console.log(pointLayers.length, 'LAYERS')
  const initialViewState = Object.assign({}, INITIAL_VIEW)

  // const colors = colormap({
  //   colormap: 'chlorophyll', // colorRamp,
  //   nshades: 10,
  //   format: 'rba',
  //   alpha: 1,
  // }).map((c: number[]) => [c[0], c[1], c[2]])

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

  let totalRows = 0

  const layers = [] as any[]
  for (let i = 0; i < pointLayers.length; i++) {
    const points = pointLayers[i]
    totalRows += points.time.length

    layers.push(
      new ScatterplotLayer({
        id: 'xyt-layer-' + i,
        data: {
          length: points.time.length,
          attributes: {
            getPosition: { value: points.coordinates, size: 2 },
          },
        },
        pickable: true,
        opacity: 0.6,
        stroked: false,
        filled: true,
        radiusScale: 1,
        getRadius: 1, // (d: any) => 5, // Math.sqrt(d.exits),
        getFillColor: [64, 0, 255], // (d: any) => [255, 140, 0],
        // getLineColor: d => [0, 0, 0],
        // lineWidthMinPixels: 1,
        // updateTriggers: {
        //   getPosition: points,
        // },
        parameters: { depthTest: true },
      })
    )
  }

  console.log('MROWS', totalRows)
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
