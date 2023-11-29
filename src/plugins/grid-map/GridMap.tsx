import React, { useState } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { GridCellLayer } from '@deck.gl/layers'
import colormap from 'colormap'

import globalStore from '@/store' // Import global state management store.
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals' // Import constants and configurations.

import { CompleteMapData } from './GridLayer.vue' // Import data types.

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

// Define initial view configuration for the map.
// const INITIAL_VIEW = {
//   zoom: 10,
//   longitude: 13.45,
//   latitude: 52.5,
//   pitch: 0,
//   bearing: 0,
// }

// LAYER --------------------------------------------------------
export default function Layer({
  viewId = 0 as number,
  colorRamp = 'viridis' as String,
  dark = false as Boolean,
  data = {} as CompleteMapData,
  currentTimeIndex = 0 as number,
  extrude = true as Boolean,
  highlights = [],
  mapIsIndependent = false as Boolean,
  maxHeight = 200 as Number,
  metric = 'Count' as String,
  cellSize = 200 as Number,
  opacity = 0.7 as Number,
  selectedHexStats = {
    rows: 0 as Number,
    numHexagons: 0 as Number,
    selectedHexagonIds: [] as Number[],
  },
  upperPercentile = 100 as Number,
  onClick = {} as any,
  onHover = {} as any,
}) {
  // manage SimWrapper centralized viewState - for linked maps
  const [viewState, setViewState] = useState(globalStore.state.viewState)

  // Handle view state changes
  REACT_VIEW_HANDLES[viewId] = (view: any) => {
    console.log('REACT_VIEW_HANDLES', view)
    if (view) {
      setViewState(view)
    } else {
      setViewState(globalStore.state.viewState)
    }
    // console.log(globalStore.state.viewState)
  }

  // Function to handle view state changes
  function handleViewState(view: any) {
    // console.log(view)
    if (!view.latitude) return

    if (!view.center) view.center = [0, 0]
    view.center[0] = view.longitude
    view.center[1] = view.latitude
    setViewState(view)

    // Update the global store with the map camera view if not independent
    console.log('76')
    if (!mapIsIndependent) globalStore.commit('setMapCamera', view)
  }

  // Generate colors for data visualization using the specified color ramp
  const colors = colormap({
    colormap: colorRamp,
    nshades: 10,
    format: 'rba',
    alpha: 1,
  }).map((c: number[]) => [c[0], c[1], c[2], 255])

  // Function to get tooltip content for map features
  function getTooltip({ object }: any) {
    if (!object || !object.position || !object.position.length) {
      return null
    }

    const lat = object.position[1]
    const lng = object.position[0]
    const count = object.points.length

    // Construct tooltip HTML content
    return {
      html: `<b>${highlights.length ? 'Count' : metric}: ${count} </b><br/>
        ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
        Number.isFinite(lng) ? lng.toFixed(4) : ''
      }`,
      // Define tooltip style based on dark theme
      style: dark
        ? { color: '#ccc', backgroundColor: '#2a3c4f' }
        : { color: '#223', backgroundColor: 'white' },
    }
  }

  // Function to handle click events on map features
  function handleClick(target: any, event: any) {
    // if (target.devicePixel != undefined) console.log(event)
  }

  // Function to handle hover events on map features
  function handleHover(target: any, event: any) {
    // if (target.devicePixel != undefined) console.log(target, event)
  }

  console.log(data)

  const layers = [
    new GridCellLayer({
      id: 'gridlayer',
      data: {
        length: data.mapData[currentTimeIndex].length,
        attributes: {
          getPosition: { value: data.mapData[currentTimeIndex].centroid, size: 2 },
          getFillColor: { value: data.mapData[currentTimeIndex].colorData, size: 3 },
          getElevation: { value: data.mapData[currentTimeIndex].values, size: 1 },
        },
      },
      colorRange: dark ? colors.slice(1) : colors.reverse().slice(1),
      coverage: 1,
      autoHighlight: true,
      elevationRange: [0, maxHeight],
      elevationScale: maxHeight,
      extruded: extrude,
      selectedHexStats,
      pickable: true,
      opacity,
      cellSize,
      upperPercentile,
      material,
      transitions: {
        elevationScale: { type: 'interpolation', duration: 10 },
        opacity: { type: 'interpolation', duration: 200 },
      },
      parameters: {
        // depthTest: false,
      },
    }),
  ]

  console.log('ID: ', viewId)

  // Render the Deck.gl map component with specified props
  return (
    <DeckGL
      layers={layers}
      controller={true}
      useDevicePixels={false}
      viewState={viewState}
      getTooltip={getTooltip}
      onClick={handleClick}
      onHover={handleHover}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
    >
      {/* @ts-ignore */}
      <StaticMap
        mapStyle={globalStore.getters.mapStyle}
        preventStyleDiffing={true}
        mapboxApiAccessToken={MAPBOX_TOKEN}
      />
    </DeckGL>
  )
}
