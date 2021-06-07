import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { InteractiveMap } from 'react-map-gl'
import { ArcLayer } from '@deck.gl/layers'
import HexagonLayer from './SelectableHexLayer'
import colormap from 'colormap'

import { MAP_STYLES } from '@/Globals'
import { pointToHexbin } from './HexagonAggregator'
import globalStore from '@/store'

const MAPBOX_TOKEN =
  'pk.eyJ1IjoidnNwLXR1LWJlcmxpbiIsImEiOiJjamNpemh1bmEzNmF0MndudHI5aGFmeXpoIn0.u9f04rjFo7ZbWiSceTTXyA'

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

export default function Layer({
  data = [],
  highlights = [],
  dark = false,
  radius = 100,
  upperPercentile = 100,
  coverage = 0.65,
  extrude = true,
  maxHeight = 200,
  viewState = { longitude: 14, latitude: 54, zoom: 5, bearing: 0, pitch: 20 },
  onClick = {} as any,
  colorRamp = 'chlorophyll',
  metric = 'Count',
  selectedHexStats = { rows: 0, numHexagons: 0, selectedHexagonIds: [] },
}) {
  // draw begins here

  console.log('i am here redrawing')
  const colors = colormap({
    colormap: colorRamp,
    nshades: 10,
    format: 'rba',
    alpha: 1,
  }).map((c: number[]) => [c[0], c[1], c[2]])

  function getTooltip({ object }: any) {
    if (!object || !object.position || !object.position.length) {
      return null
    }

    const lat = object.position[1]
    const lng = object.position[0]
    const count = object.points.length

    return {
      html: `\
        <b>${highlights.length ? 'Count' : metric}: ${count} </b><br/>
        ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
        Number.isFinite(lng) ? lng.toFixed(4) : ''
      }
      `,
    }
  }

  function handleClick(target: any, event: any) {
    onClick(target, event)
  }

  function handleViewState(view: any) {
    globalStore.commit('setMapCamera', view)
  }

  const layers = [
    new ArcLayer({
      id: 'arc-layer',
      data: highlights,
      getSourcePosition: (d: any) => d[0],
      getTargetPosition: (d: any) => d[1],
      pickable: false,
      opacity: 0.4,
      getHeight: 0,
      getWidth: 1,
      getSourceColor: dark ? [144, 96, 128] : [192, 192, 240],
      getTargetColor: dark ? [144, 96, 128] : [192, 192, 240],
    }),
    new HexagonLayer({
      id: 'hexlayer',
      colorRange: dark ? colors.slice(1) : colors.reverse().slice(1),
      coverage,
      data,
      autoHighlight: true,
      elevationRange: [0, maxHeight],
      elevationScale: data && data.length ? 50 : 0,
      extruded: extrude,
      selectedHexStats,
      getPosition: (d: any) => d,
      hexagonAggregator: pointToHexbin,
      center: [viewState.longitude, viewState.latitude],
      pickable: true,
      opacity: 0.75, // dark && highlights.length ? 0.6 : 0.8,
      radius,
      upperPercentile,
      material,
      transitions: {
        elevationScale: { type: 'interpolation', duration: 1000 },
        opacity: { type: 'interpolation', duration: 200 },
      },
    }),
  ]

  return (
    /*
    //@ts-ignore */
    <DeckGL
      layers={layers}
      viewState={viewState}
      controller={true}
      getTooltip={getTooltip}
      onClick={handleClick}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
    >
      {
        /*
        // @ts-ignore */
        <InteractiveMap
          reuseMaps
          mapStyle={dark ? MAP_STYLES.dark : MAP_STYLES.light}
          preventStyleDiffing={true}
          mapboxApiAccessToken={MAPBOX_TOKEN}
        />
      }
    </DeckGL>
  )
}
