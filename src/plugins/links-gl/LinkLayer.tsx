import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { LineLayer } from '@deck.gl/layers'
import { scaleLinear, scaleThreshold } from 'd3-scale'
import { StaticMap } from 'react-map-gl'
import colormap from 'colormap'

import { MAP_STYLES, MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import globalStore from '@/store'

enum COLUMNS {
  offset = 0,
  coordFrom = 1,
  coordTo = 2,
}

export default function Component({
  geojson = [] as any[],
  colors = 'viridis',
  dark = false,
  scaleWidth = 250,
  build = {} as {
    rows: Float32Array
    header: string[]
    headerMax: number[]
    activeColumn: number
  },
  base = {} as {
    rows: Float32Array
    header: string[]
    headerMax: number[]
    activeColumn: number
  },
  buildData = new Float32Array(),
  baseData = new Float32Array(),
  showDiffs = false,
  viewId = 0,
}) {
  // ------- draw frame begins here -----------------------------

  const { header, headerMax, activeColumn } = build
  const rows = buildData

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  // const [hoverInfo, setHoverInfo] = useState({})

  const builtColors = colormap({
    colormap: colors,
    nshades: 20,
    format: 'rba',
  }).map((a: number[]) => [a[0], a[1], a[2], 255])

  const fetchColor = scaleThreshold()
    .domain(new Array(20).fill(0).map((v, i) => 0.05 * i))
    .range(builtColors)
    .range(dark ? builtColors : builtColors.reverse())

  // this assumes that zero means hide the link. This may not be generic enough
  const colorPaleGrey = dark ? [80, 80, 80, 40] : [212, 212, 212, 40]
  const colorInvisible = [0, 0, 0, 0]

  // register setViewState in global view updater
  // so we can respond to external map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  // --- LINE COLORS -----------------------------------------------
  const getLineColor = (feature: any) => {
    const value = rows[feature[COLUMNS.offset]]

    if (!value) return colorInvisible

    // comparison?
    if (showDiffs) {
      const baseValue = baseData[feature[COLUMNS.offset]]
      const diff = value - baseValue

      if (diff === 0) return 0 // fetchColor(0.5)
      return baseValue < value ? [255, 0, 0, 255] : [0, 0, 255, 255] // red vs. blue
    } else {
      // const scaledValue = value / headerMax[activeColumn]
      const scaledValue = Math.log(value) / Math.log(headerMax[activeColumn])
      if (scaledValue < 0.0001) return colorPaleGrey

      return fetchColor(scaledValue)
    }
  }

  // --- LINE WIDTHS -----------------------------------------------
  // --> 2 pixels if no line width at all
  // --> Scaled up to 50 pixels, scaled vs. maxWidth
  const getLineWidth = (feature: any) => {
    const value = rows[feature[COLUMNS.offset]]

    // comparison?
    if (showDiffs) {
      const baseValue = baseData[feature[COLUMNS.offset]]
      const diff = Math.abs(value - baseValue)
      return diff / scaleWidth
    } else {
      return value / scaleWidth
    }
  }

  function handleClick() {
    console.log('click!')
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    globalStore.commit('setMapCamera', view)
  }

  function getTooltip({ object }: any) {
    if (!object) return null

    let value = rows[object[COLUMNS.offset]]

    let baseValue = 0
    let diff = undefined

    if (showDiffs) {
      baseValue = baseData[object[COLUMNS.offset]]
      diff = value - baseValue
    } else {
      if (value === undefined) return null
    }

    const roundValue = Math.round(value * 10000.0) / 10000.0
    const roundDiff = diff ? Math.round(diff * 10000.0) / 10000.0 : diff

    const baseElement = baseValue ? <p>+/- Base: {roundDiff}</p> : null

    return {
      html: `
        <big><b>${header[activeColumn]}</b></big>
        <p>${roundValue}</p>
        ${baseElement || ''}
      `,
      style: dark
        ? { color: '#ccc', backgroundColor: '#2a3c4f' }
        : { color: '#223', backgroundColor: 'white' },
    }
  }

  const layers = [
    new LineLayer({
      id: 'linkLayer',
      data: geojson,
      widthUnits: 'pixels',
      widthMinPixels: 0,
      widthMaxPixels: 200,
      pickable: true,
      opacity: 0.8,
      autoHighlight: true,
      parameters: {
        depthTest: false,
      },

      getSourcePosition: (link: any[]) => link[COLUMNS.coordFrom],
      getTargetPosition: (link: any[]) => link[COLUMNS.coordTo],
      getColor: getLineColor,
      getWidth: getLineWidth,

      updateTriggers: {
        getColor: [showDiffs, dark, colors, activeColumn],
        getWidth: [showDiffs, scaleWidth, activeColumn],
      },

      transitions: {
        getColor: 350,
        getWidth: 350,
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
      pickingRadius={5}
      getTooltip={getTooltip}
      getCursor={({ isDragging, isHovering }: any) =>
        isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
      }
      onClick={handleClick}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap
          mapStyle={dark ? MAP_STYLES.dark : MAP_STYLES.light}
          mapboxApiAccessToken={MAPBOX_TOKEN}
        />
      }
    </DeckGL>
  )
}
