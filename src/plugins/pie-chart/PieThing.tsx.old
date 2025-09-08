import React, { useState, useMemo, useEffect } from 'react'
// import { StaticMap } from 'react-map-gl'
import DeckGL from '@deck.gl/react'
import { SolidPolygonLayer } from '@deck.gl/layers'
import { color } from 'd3-color'

import globalStore from '@/store'
import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

export interface PieInfo {
  center: number[]
  radius: number
  slices: { value: number; color: string | number[] }[]
}

const colorStringToRGB = (colorString: string) => {
  try {
    const rgb = color(colorString)
    if (!rgb) return [0, 0, 0]
    // d3.color provides r, g, b properties directly
    return [rgb.r, rgb.g, rgb.b]
  } catch (error) {
    return [0, 0, 0]
  }
}

const calculatePieSlicePaths = (pies: PieInfo[], scl: number) => {
  const polygons = []

  const scalingFactor = scl / 50
  // console.log('SCALING FACTOR', scalingFactor)

  // loop on each piechart ------
  for (const piechart of pies) {
    const { center, radius, slices } = piechart
    // console.log(center, radius)

    const width = radius * scalingFactor

    let startAngle = Math.PI / 2
    let endAngle = startAngle
    const curviness = 24

    // lat/long are not perfectly symmetric. This makes the circles round
    const roundnessRatio = Math.cos((center[1] * Math.PI) / 180)

    // user values might not add to 1.000...
    const total = slices.reduce((a, b) => a + b.value, 0)

    slices.forEach(slice => {
      //@ts-ignore
      slice.percent = slice.value / total
    })

    // loop on each slice --------------
    const vertices = slices.map(slice => {
      // start at center
      const path = [center]

      for (let i = 0; i <= curviness; i++) {
        // @ts-ignore
        const percent = slice.percent || 0
        endAngle = startAngle + (i / curviness) * percent * Math.PI * 2
        path.push([
          center[0] + (width * Math.cos(endAngle)) / roundnessRatio,
          center[1] + width * Math.sin(endAngle),
        ])
      }
      path.push(center)
      startAngle = endAngle

      // convert css colors to rgb[]
      const color = Array.isArray(slice.color) ? slice.color : colorStringToRGB(slice.color)
      return { path, color }
    })
    polygons.push(vertices)
  }
  return polygons.flat()
}

export default function Component(props: { viewId: number; pies: PieInfo[]; scale: number }) {
  // console.log('here', props.scale)

  // register setViewState in global view updater so we can respond to external map motion
  const [viewState, setViewState] = useState(globalStore.state.viewState)

  // useEffect for long calculations - like creating the piechart polygons
  const pieElements = useMemo(
    () => calculatePieSlicePaths(props.pies, props.scale),
    [props.pies, props.scale]
  )

  REACT_VIEW_HANDLES[props.viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    globalStore.commit('setMapCamera', view)
  }

  const layers: any = []

  if (pieElements.length) {
    // const positions = new Float64Array(pieElements.map(d => d.path).flat(2))
    // const startIndices = new Uint16Array(
    //   pieElements.reduce(
    //     (a, d) => {
    //       const lastIndex = a[a.length - 1]
    //       a.push(lastIndex + d.path.length)
    //       return a
    //     },
    //     [0]
    //   )
    // )

    layers.push(
      new SolidPolygonLayer({
        id: `pie-layer-${props.viewId}`,
        data: pieElements,
        getPolygon: (d: any) => d.path,
        getFillColor: (d: any) => d.color,
        // getFillColor: [0, 64, 255],
        // data: {
        //   length: pieElements.length,
        //   startIndices,
        //   attributes: {
        //     getPolygon: { value: positions, size: 2 },
        //   },
        // },
        // _normalize: false,
        extruded: false,
        // positionFormat: 'XY',
        wireframe: true,
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
        getLineColor: [255, 40, 255],
        pickable: true,
        stroked: false,
        filled: true,
        parameters: { depthTest: false },
        updateTriggers: {
          getPolygon: [pieElements],
        },
      })
    )
  }

  return (
    <DeckGL
      layers={layers}
      pickingRadius={3}
      controller={true}
      viewState={viewState}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap mapboxApiAccessToken={MAPBOX_TOKEN} mapStyle={globalStore.getters.mapStyle} />
      }
    </DeckGL>
  )
}
