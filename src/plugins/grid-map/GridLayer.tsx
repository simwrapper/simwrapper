import React, { useState } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { GridCellLayer } from '@deck.gl/layers'
import colormap from 'colormap'

import globalStore from '@/store' // Import global state management store.
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals' // Import constants and configurations.

import { CompleteMapData } from './GridMap.vue' // Import data types.

type TooltipStyle = {
  color: string
  backgroundColor: string
}

type Tooltip = {
  html: string
  style: TooltipStyle
} | null

// LAYER --------------------------------------------------------
export default function Layer({
  viewId = 0 as number,
  colorRamp = 'Viridis' as String,
  dark = false as Boolean,
  data = {} as CompleteMapData,
  currentTimeIndex = 0 as number,
  // extrude = true as Boolean,
  mapIsIndependent = false as Boolean,
  maxHeight = 200 as Number,
  cellSize = 200 as Number,
  opacity = 0.7 as Number,
  upperPercentile = 100 as Number,
}) {
  // manage SimWrapper centralized viewState - for linked maps
  const [viewState, setViewState] = useState(globalStore.state.viewState)

  // Handle view state changes
  REACT_VIEW_HANDLES[viewId] = (view: any) => {
    if (view) {
      setViewState(view)
    } else {
      setViewState(globalStore.state.viewState)
    }
  }

  // Function to handle view state changes
  function handleViewState(view: any) {
    // Make shure that latitude and longitude exist in the view object
    if (!view || typeof view.latitude !== 'number' || typeof view.longitude !== 'number') {
      return
    }

    // If the view does not have a center, initialize it to [0, 0]
    if (!view.center) {
      view.center = [0, 0]
    }

    // Set the center based on longitude and latitude
    view.center[0] = view.longitude
    view.center[1] = view.latitude

    // Update the view state
    setViewState(view)

    // Update the global map camera position if it's not independent
    if (!mapIsIndependent) {
      globalStore.commit('setMapCamera', view)
    }
  }

  function getTooltip(object: any): Tooltip {
    if (!object?.coordinate) return null

    const currentData = data.mapData[currentTimeIndex]?.values
    if (!currentData || !currentData[object.index]) return null

    const [lng, lat] = object.coordinate // Koordinaten (Längengrad, Breitengrad)
    const rawValue = currentData[object.index]
    const value = rawValue / (data.scaledFactor as number)
    const roundedValue = Number(value.toFixed(6))
    const unit = data.unit

    const latDisplay = Number.isFinite(lat) ? lat.toFixed(4) : ''
    const lngDisplay = Number.isFinite(lng) ? lng.toFixed(4) : ''

    const tooltipHtml = `<b>${roundedValue} ${unit}</b><br/>${latDisplay} / ${lngDisplay}`
    const tooltipStyle: TooltipStyle = dark
      ? { color: '#ccc', backgroundColor: '#2a3c4f' }
      : { color: '#223', backgroundColor: 'white' }

    return {
      html: tooltipHtml,
      style: tooltipStyle,
    }
  }

  // Generate colors for data visualization using the specified color ramp
  const colors = colormap({
    colormap: colorRamp,
    nshades: 10,
    format: 'rba',
    alpha: 1,
  }).map((c: number[]) => [c[0], c[1], c[2], 255])

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
      pickable: true,
      opacity,
      cellSize,
      upperPercentile,
      material: false,
      transitions: {
        elevationScale: { type: 'interpolation', duration: 50 },
        // opacity: { type: 'interpolation', duration: 50 },
      },
      parameters: {
        // fixes the z-fighting problem but makes some issues with the opacity...
        // depthTest: false,
      },
    }),
  ]

  // Render the Deck.gl map component with specified props
  return (
    <DeckGL
      layers={layers}
      controller={true}
      useDevicePixels={false}
      viewState={viewState}
      getTooltip={getTooltip}
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
