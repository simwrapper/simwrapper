import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap, InteractiveMap } from 'react-map-gl'
import { ArcLayer } from '@deck.gl/layers'
import { HexagonLayer } from '@deck.gl/aggregation-layers'
import colormap from 'colormap'

import globalStore from '@/store'
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

// LAYER --------------------------------------------------------
export default function Layer({
  viewId = 0,
  colorRamp = 'chlorophyll',
  coverage = 0.65,
  dark = false,
  data = { raw: new Float32Array(0), length: 0 },
  extrude = true,
  highlights = [],
  mapIsIndependent = false,
  maxHeight = 200,
  metric = 'Count',
  radius = 100,
  selectedHexStats = { rows: 0, numHexagons: 0, selectedHexagonIds: [] },
  upperPercentile = 100,
  onClick = {} as any,
}) {
  // manage SimWrapper centralized viewState - for linked maps
  const [viewState, setViewState] = useState(globalStore.state.viewState)

  // useMemo: row data only gets recalculated what data or highlights change
  const rows = useMemo(() => {
    let rows = [] as any
    // is data filtered or not?
    if (highlights.length) {
      rows = highlights.map(row => row[1])
    } else if (!data.length) {
      rows = []
    } else {
      rows = {
        length: data.length,
        attributes: {
          getPosition: { value: data.raw, size: 2 },
        },
      } as any
    }
    return rows
  }, [data, highlights]) as any

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
      data: rows,
      getPosition: highlights.length ? (d: any) => d : null,
      colorRange: dark ? colors.slice(1) : colors.reverse().slice(1),
      coverage,
      autoHighlight: true,
      elevationRange: [0, maxHeight],
      elevationScale: data && data.length ? 50 : 0,
      extruded: extrude,
      selectedHexStats,
      // hexagonAggregator: pointToHexbin,
      pickable: true,
      opacity: 0.7, // dark && highlights.length ? 0.6 : 0.8,
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
      controller={true}
      useDevicePixels={false}
      viewState={viewState}
      getTooltip={getTooltip}
      onClick={handleClick}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
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
