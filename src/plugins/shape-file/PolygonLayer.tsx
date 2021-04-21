import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'

import { GeoJsonLayer } from '@deck.gl/layers'
import { scaleLinear, scaleThreshold } from 'd3-scale'
import { StaticMap } from 'react-map-gl'
import colormap from 'colormap'

import { MAP_STYLES } from '@/Globals'

const MAPBOX_TOKEN =
  'pk.eyJ1IjoidnNwLXR1LWJlcmxpbiIsImEiOiJjamNpemh1bmEzNmF0MndudHI5aGFmeXpoIn0.u9f04rjFo7ZbWiSceTTXyA'

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
  latitude: 13.45,
  longitude: -52.51,
  zoom: 10,
}

export default function Component({
  shapefile = {} as {
    data: []
    prj: string
    header: {}
  },
  center = [],
  dark = false,
  colors = '',
  activeColumn = '',
  maxValue = 1000,
}) {
  const { data, header, prj } = shapefile
  const [lon, lat] = center

  const initialView = Object.assign(INITIAL_VIEW_STATE, { longitude: lon, latitude: lat })
  const [hoverInfo, setHoverInfo] = useState({})

  const builtColors = colormap({
    colormap: colors,
    nshades: 20,
    format: 'rba',
  }).map((a: number[]) => [a.slice(0, 3)])

  const fetchColor = scaleThreshold()
    .domain(new Array(20).fill(0).map((v, i) => 0.05 * i))
    .range(builtColors)

  // .range(dark ? builtColors : builtColors.reverse())

  // this assumes that zero means hide the link. This may not be generic enough
  const colorPaleGrey = dark ? [80, 80, 80, 40] : [212, 212, 212, 40]
  const colorInvisible = [0, 0, 0, 0]

  const getLineColor = (feature: any) => {
    const id = feature.properties.id
    const row = data[id]

    if (!row) return colorInvisible

    const value = row[activeColumn]
    if (!value) return colorInvisible

    return fetchColor(value)
  }

  // const getLineWidth = (feature: any) => {
  //   return 4
  // }

  function handleClick() {
    console.log('click!')
  }

  function getTooltip({ hoverInfo }: any) {
    const { object, x, y } = hoverInfo
    if (!object) return

    // try to figure out how tall it is? So tooltip doesn't go below the screen bottom
    let tooltipHeight = 24 + 22 * Object.keys(object.properties).length
    if (y + tooltipHeight < window.innerHeight) tooltipHeight = 0

    const tooltip = (
      <div
        id="shape-tooltip"
        className="tooltip"
        style={{
          backgroundColor: dark ? '#445' : 'white',
          color: dark ? 'white' : '#222',
          padding: '1rem 1rem',
          position: 'absolute',
          left: x + 15,
          top: y - tooltipHeight,
          boxShadow: '0px 2px 10px #22222266',
        }}
      >
        <div>
          {Object.keys(object.properties).map((prop, i) => {
            return (
              <div key={i}>
                <b>{prop}: </b> {object.properties[prop]}
              </div>
            )
          })}
        </div>
      </div>
    )

    return tooltip
  }

  function renderTooltip({ hoverInfo }: any) {
    const { object, x, y } = hoverInfo
    if (!object) return null

    const id = object.properties?.id
    const row = data[id]
    if (!row) return null

    const value: any = row[activeColumn]
    if (value === undefined) return null

    return (
      <div
        className="tooltip"
        style={{
          backgroundColor: dark ? '#445' : 'white',
          color: dark ? 'white' : '#222',
          padding: '1rem 1rem',
          position: 'absolute',
          left: x + 20,
          top: y - 80,
          boxShadow: '0px 2px 10px #22222266',
        }}
      >
        <big>
          <b>{header}</b>
        </big>
        <p>{value}</p>
      </div>
    )
  }

  const layers = [
    new GeoJsonLayer({
      id: 'shapefileLayer',
      data: data,
      filled: true,
      lineWidthUnits: 'pixels',
      lineWidthMinPixels: 1,
      pickable: true,
      stroked: true,
      opacity: 0.5,
      autoHighlight: true,
      // highlightColor: [255, 128, 255, 255], // [64, 255, 64],
      parameters: {
        depthTest: true,
      },

      getLineColor: [255, 255, 255, 128],
      getFillColor: (f: any) => SCALED_COLORS(f.properties[activeColumn] / maxValue),
      getLineWidth: 2,
      onHover: setHoverInfo,

      updateTriggers: {
        getFillColor: { dark, colors, activeColumn, maxValue },
      },

      transitions: {
        getFillColor: 250,
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
      {getTooltip({ hoverInfo })}
    </DeckGL>
  )
}
