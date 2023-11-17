import React, { useState } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { GridCellLayer } from '@deck.gl/layers'
import colormap from 'colormap'

import globalStore from '@/store'
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

interface MapData {
  time: Number
  colorData: Uint8Array
  values: Float64Array
  centroid: Float64Array
  numberOffilledColors: Number
  numberOffilledValues: Number
  numberOffilledCentroids: Number
  length: Number
}
interface CompleteMapData {
  mapData: MapData[]
  scaledFactor: Number
}

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

const INITIAL_VIEW = {
  zoom: 10,
  longitude: 13.45,
  latitude: 52.5,
  pitch: 0,
  bearing: 0,
}

// LAYER --------------------------------------------------------
export default function Layer({
  viewId = 0,
  colorRamp = 'chlorophyll',
  dark = false,
  // data = {} as any,
  data = {} as CompleteMapData,
  currentTimeIndex = 0 as number,
  extrude = true,
  highlights = [],
  mapIsIndependent = false,
  maxHeight = 200,
  metric = 'Count',
  cellSize = 200,
  opacity = 0.7,
  selectedHexStats = { rows: 0, numHexagons: 0, selectedHexagonIds: [] },
  upperPercentile = 100,
  onClick = {} as any,
  onHover = {} as any,
}) {
  // manage SimWrapper centralized viewState - for linked maps
  const [viewState, setViewState] = useState(INITIAL_VIEW)

  REACT_VIEW_HANDLES[viewId] = (view: any) => {
    if (view) {
      setViewState(view)
    } else {
      setViewState(globalStore.state.viewState)
    }
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
  }).map((c: number[]) => [c[0], c[1], c[2], 255])

  // const maxValue = 100

  // function pickColor(value: number) {
  //   if (value == 0) return null
  //   const index = Math.floor((value / maxValue) * (colors.length - 1))
  //   return colors[index]
  // }

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

  function handleHover(target: any, event: any) {
    onHover(target, event)
  }

  // console.log(data.mapData[currentTimeIndex])

  const layers = [
    new GridCellLayer({
      id: 'gridlayer',
      // currentTimeIndex: currentTimeIndex,

      data: data.mapData[currentTimeIndex],

      // getPosition:

      getPosition: (object: any, { index, data, target }) => {
        target[0] = data.centroid[index * 2]
        target[1] = data.centroid[index * 2 + 1]
        target[2] = 0
        return target
      },
      getFillColor: (object, { index, data, target }) => {
        target[0] = data.colorData[index * 4]
        target[1] = data.colorData[index * 4 + 1]
        target[2] = data.colorData[index * 4 + 2]
        target[3] = data.colorData[index * 4 + 3]
        return target
      },
      getElevation: (object, { index, data, target }) => {
        return data.values[index]
      },

      // data: data.mapData[currentTimeIndex],
      // getPosition: data.mapData[currentTimeIndex].centroid,
      // getFillColor: data.mapData[currentTimeIndex].colorData,
      // getElevation: data.mapData[currentTimeIndex].values,

      // data: data.mapData[currentTimeIndex],
      // getPosition: d => d.position,
      // getColor: d => d.color,

      // data: {
      //   // this is required so that the layer knows how many points to draw
      //   length: data.mapData[currentTimeIndex].values.length,
      //   attributes: {
      //     getPosition: { value: data.mapData[currentTimeIndex].centroid, size: 2 },
      //     getFillColor: { value: data.mapData[currentTimeIndex].colorData, size: 4 },
      //     getElevation: { value: data.mapData[currentTimeIndex].values, size: 1 },
      //   },
      // },

      colorRange: dark ? colors.slice(1) : colors.reverse().slice(1),
      coverage: 1,
      autoHighlight: true,
      elevationRange: [0, maxHeight],
      elevationScale: maxHeight,
      extruded: extrude,
      selectedHexStats,
      pickable: true,
      opacity: opacity, // dark && highlights.length ? 0.6 : 0.8,
      cellSize,
      upperPercentile,
      material,
      transitions: {
        elevationScale: { type: 'interpolation', duration: 10 },
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
      onHover={handleHover}
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
