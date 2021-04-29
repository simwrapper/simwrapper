import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { InteractiveMap } from 'react-map-gl'
import { ArcLayer } from '@deck.gl/layers'
import { HexagonLayer } from '@deck.gl/aggregation-layers'
import colormap from 'colormap'

import { MAP_STYLES } from '@/Globals'
import { pointToHexbin } from './HexagonAggregator'

const MAPBOX_TOKEN =
  'pk.eyJ1IjoidnNwLXR1LWJlcmxpbiIsImEiOiJjamNpemh1bmEzNmF0MndudHI5aGFmeXpoIn0.u9f04rjFo7ZbWiSceTTXyA'

// const ambientLight = new AmbientLight({
//   color: [255, 255, 255],
//   intensity: 1.0,
// })

// const pointLight1 = new PointLight({
//   color: [255, 255, 255],
//   intensity: 0.8,
//   position: [-0.144528, 49.739968, 80000],
// })

// const pointLight2 = new PointLight({
//   color: [255, 255, 255],
//   intensity: 0.8,
//   position: [-3.807751, 54.104682, 8000],
// })

// const lightingEffect = new LightingEffect({ ambientLight, pointLight1, pointLight2 })

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

const INITIAL_VIEW_STATE = {
  zoom: 10,
  minZoom: 3,
  maxZoom: 20,
  pitch: 20,
  bearing: 0,
}

export const colorRange = {
  light: [
    [250, 240, 110],
    [255, 210, 90],
    [180, 240, 150],
    [70, 220, 150],
    [40, 110, 250],
    [140, 0, 40],
  ],
  dark: [
    [1, 152, 189],
    [73, 227, 206],
    [216, 254, 181],
    [254, 237, 177],
    [254, 173, 84],
    [209, 55, 78],
  ],
}

// light: {
//   a: [
//     [250, 240, 110],
//     [255, 210, 90],
//     [180, 240, 150],
//     [70, 220, 150],
//     [40, 110, 250],
//     [140, 0, 40],
//   ],
//   b: [
//     [250, 240, 110],
//     [255, 210, 90],
//     [180, 240, 150],
//     [70, 220, 150],
//     [40, 110, 250],
//     [140, 0, 40],
//   ],
// },
// dark: {
//   a: [
//     [1, 152, 189],
//     [73, 227, 206],
//     [216, 254, 181],
//     [254, 237, 177],
//     [254, 173, 84],
//     [209, 55, 78],
//   ],
//   b: [
//     [1, 152, 189],
//     [73, 227, 206],
//     [216, 254, 181],
//     [254, 237, 177],
//     [254, 173, 84],
//     [209, 55, 78],
//   ],
// },

function getTooltip({ object }: any) {
  if (!object || !object.position || !object.position.length) {
    return null
  }

  const lat = object.position[1]
  const lng = object.position[0]
  const count = object.points.length

  return {
    text: `\
    ${count} Pickups
    latitude: ${Number.isFinite(lat) ? lat.toFixed(6) : ''}
    longitude: ${Number.isFinite(lng) ? lng.toFixed(6) : ''}
    `,
  }
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
  center = [11.34, 48.3],
  onClick = {} as any,
  colorRamp = 'chlorophyll',
}) {
  const [lon, lat] = center
  const initialView = Object.assign(INITIAL_VIEW_STATE, { longitude: lon, latitude: lat })

  const colors = colormap({
    colormap: colorRamp,
    nshades: 10,
    format: 'rba',
    alpha: 1,
  }).map((c: number[]) => [c[0], c[1], c[2]])

  function handleClick(target: any) {
    onClick(target)
  }

  const layers = [
    new ArcLayer({
      id: 'arc-layer',
      data: highlights,
      getSourcePosition: (d: any) => d[0],
      getTargetPosition: (d: any) => d[1],
      pickable: false,
      opacity: 0.5,
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
      getPosition: (d: any) => d,
      hexagonAggregator: pointToHexbin,
      center,
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
      // effects={[lightingEffect]}
      initialViewState={initialView}
      controller={true}
      getTooltip={getTooltip}
      onClick={handleClick}
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
