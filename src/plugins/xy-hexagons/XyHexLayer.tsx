import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap, InteractiveMap } from 'react-map-gl'
import { ArcLayer } from '@deck.gl/layers'
import HexagonLayer from './SelectableHexLayer'
import colormap from 'colormap'

import { MAPBOX_TOKEN, MAP_STYLES } from '@/Globals'
import { pointToHexbin } from './HexagonAggregator'
import globalStore from '@/store'

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
  onClick = {} as any,
  colorRamp = 'chlorophyll',
  metric = 'Count',
  selectedHexStats = { rows: 0, numHexagons: 0, selectedHexagonIds: [] },
}) {
  // draw begins here

  const viewState = globalStore.state.viewState

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
      style: dark
        ? { color: '#ccc', backgroundColor: '#2a3c4f' }
        : { color: '#223', backgroundColor: 'white' },
    }
  }

  function handleClick(target: any, event: any) {
    onClick(target, event)
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
    <DeckGL
      layers={layers}
      viewState={viewState}
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
        <StaticMap
          reuseMaps
          mapStyle={dark ? MAP_STYLES.dark : MAP_STYLES.light}
          preventStyleDiffing={true}
          mapboxApiAccessToken={MAPBOX_TOKEN}
        />
      }
    </DeckGL>
  )
}
