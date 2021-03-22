import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { LineLayer } from '@deck.gl/layers'
import { scaleLinear, scaleThreshold } from 'd3-scale'
import { StaticMap } from 'react-map-gl'
import colormap from 'colormap'

import { MAP_STYLES } from '@/Globals'

const MAPBOX_TOKEN =
  'pk.eyJ1IjoidnNwLXR1LWJlcmxpbiIsImEiOiJjamNpemh1bmEzNmF0MndudHI5aGFmeXpoIn0.u9f04rjFo7ZbWiSceTTXyA'

enum COLUMNS {
  offset = 0,
  coordFrom = 1,
  coordTo = 2,
}

const colorRange = [
  [1, 152, 189],
  [73, 227, 206],
  [216, 254, 181],
  [254, 237, 177],
  [254, 173, 84],
  [209, 55, 78],
]

const SCALED_COLORS = scaleThreshold()
  .domain([0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9])
  .range([
    [26, 152, 80],
    [102, 189, 99],
    [166, 217, 106],
    [217, 239, 139],
    [255, 255, 191],
    [254, 224, 139],
    [253, 174, 97],
    [244, 109, 67],
    [215, 48, 39],
    [168, 0, 0],
  ] as any)

const WIDTH_SCALE = scaleLinear()
  .clamp(true)
  .domain([0, 200])
  .range([10, 2000])

const INITIAL_VIEW_STATE = {
  latitude: 38,
  longitude: -100,
  zoom: 10,
  // minZoom: 2,
  // maxZoom: 8,
}

export default function Component({
  geojson = [] as any[],
  center = [],
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
}) {
  const { header, headerMax, activeColumn } = build
  const rows = buildData
  // const baseData = showDiffs ? base.rows : []

  const [lon, lat] = center

  const initialView = Object.assign(INITIAL_VIEW_STATE, { longitude: lon, latitude: lat })
  const [hoverInfo, setHoverInfo] = useState({})

  // console.log('hello')
  // console.log(headerMax[activeColumn])

  // const [colorInfo, setColorInfo] = useState(() => createColorRamp(colors))

  const builtColors = colormap({
    colormap: colors,
    nshades: 20,
    format: 'rba',
  }).map((a: number[]) => [a[0], a[1], a[2], 255])

  const fetchColor = scaleThreshold()
    .domain(new Array(20).fill(0).map((v, i) => 0.05 * i))
    .range(builtColors)
  // .range(dark ? builtColors : builtColors.reverse())

  // this assumes that zero means hide the link. This may not be generic enough
  const colorPaleGrey = dark ? [80, 80, 80, 40] : [212, 212, 212, 40]
  const colorInvisible = [0, 0, 0, 0]

  const color0 = fetchColor(0)
  const color1 = fetchColor(1)

  // --- LINE COLORS -----------------------------------------------
  const getLineColor = (feature: any) => {
    const value = rows[feature[COLUMNS.offset]]

    if (!value) return colorInvisible

    // comparison?
    if (showDiffs) {
      const baseValue = baseData[feature[COLUMNS.offset]]
      const diff = value - baseValue

      if (diff === 0) return 0 // fetchColor(0.5)
      return baseValue < value ? color1 : color0
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

  function renderTooltip({ hoverInfo }: any) {
    const { object, x, y } = hoverInfo
    if (!object) return null

    const value = rows[object[COLUMNS.offset]]

    let baseValue = 0
    let diff = undefined

    if (showDiffs) {
      baseValue = baseData[object[COLUMNS.offset]]
      diff = value - baseValue
    } else {
      if (value === undefined) return null
    }

    const baseElement = baseValue ? <p>+/- Base: {diff}</p> : null

    return (
      <div
        className="tooltip"
        style={{
          backgroundColor: dark ? '#445' : 'white',
          color: dark ? 'white' : '#222',
          padding: '1rem 1rem',
          position: 'absolute',
          left: x + 4,
          top: y - 80,
          boxShadow: '0px 2px 10px #22222266',
        }}
      >
        <big>
          <b>{header[activeColumn]}</b>
        </big>
        <p>{value}</p>
        {baseElement}
      </div>
    )
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
      // highlightColor: [255, 128, 255, 255], // [64, 255, 64],
      parameters: {
        depthTest: false,
      },

      getSourcePosition: (link: any[]) => link[COLUMNS.coordFrom],
      getTargetPosition: (link: any[]) => link[COLUMNS.coordTo],

      getColor: getLineColor,
      getWidth: getLineWidth,
      // widthScale: scaleWidth,

      onHover: setHoverInfo,

      updateTriggers: {
        getColor: { showDiffs, dark, colors, activeColumn },
        getWidth: { showDiffs, scaleWidth, activeColumn },
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
      initialViewState={initialView}
      controller={true}
      pickingRadius={5}
      getCursor={() => 'pointer'}
      onClick={handleClick}
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
      {renderTooltip({ hoverInfo })}
    </DeckGL>
  )
}
