import React, { useState, useMemo, useEffect, useRef } from 'react'
import DeckGL from '@deck.gl/react'
import { DataFilterExtension } from '@deck.gl/extensions'

import { StaticMap, MapRef } from 'react-map-gl'
import { rgb } from 'd3-color'
import { format } from 'mathjs'

import { DataTable, MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

import globalStore from '@/store'
import screenshots from '@/js/screenshots'

import { OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'
import GeojsonOffsetLayer from '@/layers/GeojsonOffsetLayer'
// import { SolidPolygonLayer } from '@deck.gl/layers'

interface DeckObject {
  index: number
  target: number[]
  data: any
}

interface BinaryPolygons {
  // number of polygons
  pLength: number
  // flat list of all vertices for all polygons
  vertices: Float32Array
  // offset of first vertex in each polygon
  startIndices: Uint32Array
}

export default function Component({
  viewId = 0,
  polygons = {} as BinaryPolygons,
  fillColors = '#59a14f' as string | Uint8Array,
  lineColors = '#4e79a7' as string | Uint8Array,
  lineWidths = 0 as number | Float32Array,
  fillHeights = 0 as number | Float32Array,
  calculatedValues = null as null | Float32Array,
  calculatedValueLabel = '',
  opacity = 1,
  pointRadii = 4 as number | Float32Array,
  screenshot = 0,
  featureDataTable = {} as DataTable,
  tooltip = [] as string[],
  featureFilter = new Float32Array(0),
}) {
  // release _mapRef after render, to avoid memory leak
  const _mapRef = useRef<MapRef>() as any
  useEffect(() => {
    _mapRef.current = false
  })

  // MAP VIEW -------------------------------------------------------------------------
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [screenshotCount, setScreenshot] = useState(screenshot)

  // SCREENSHOT -----------------------------------------------------------------------
  let isTakingScreenshot = screenshot > screenshotCount

  // FILL COLORS ----------------------------------------------------------------------
  let cbFillColor // can be callback OR a plain string in simple mode
  if (typeof fillColors == 'string') {
    // simple color mode
    const color = rgb(fillColors)
    cbFillColor = [color.r, color.g, color.b]
  } else {
    // array of colors
    cbFillColor = (feature: any, o: DeckObject) => {
      return [
        fillColors[o.index * 3 + 0], // r
        fillColors[o.index * 3 + 1], // g
        fillColors[o.index * 3 + 2], // b
        255, // no opacity, for now
      ]
    }
  }

  // LINE COLORS ----------------------------------------------------------------------
  const isStroked = !!lineColors

  let cbLineColor // can be callback OR a plain string in simple mode
  if (typeof lineColors == 'string') {
    // simple color mode
    const color = rgb(lineColors)
    cbLineColor = [color.r, color.g, color.b]
    if (!isStroked) cbLineColor.push(0) // totally transparent
  }
  //  else {
  //   // array of colors
  //   cbLineColor = (_: any, o: DeckObject) => {
  //     if (features[o.index].properties._hide) return [0, 0, 0, 0]

  //     return [
  //       lineColors[o.index * 3 + 0], // r
  //       lineColors[o.index * 3 + 1], // g
  //       lineColors[o.index * 3 + 2], // b
  //       255, // no opacity, for now
  //     ]
  //   }
  // }

  // LINE WIDTHS ----------------------------------------------------------------------
  let cbLineWidth // can be callback OR a plain string in simple mode
  if (typeof lineWidths == 'number') {
    // simple width mode
    cbLineWidth = lineWidths
  } else {
    // array of widths
    cbLineWidth = (_: any, o: DeckObject) => {
      return lineWidths[o.index]
    }
  }

  // CIRCLE RADIISESS ---------------------------------------------------------------
  let cbPointRadius // can be callback OR a plain string in simple mode
  if (typeof pointRadii == 'number') {
    // simple radius mode
    cbPointRadius = pointRadii
  } else {
    cbPointRadius = (_: any, o: DeckObject) => {
      return pointRadii[o.index]
    }
  }

  // FILL HEIGHTS -----------------------------------------------------------------
  let cbFillHeight // can be callback OR a plain string in simple mode
  if (typeof fillHeights == 'number') {
    // simple mode
    cbFillHeight = fillHeights
  } else {
    // array function
    cbFillHeight = (_: any, o: DeckObject) => {
      return fillHeights[o.index]
    }
  }

  function handleViewState(view: any) {
    if (!view.latitude) return
    view.center = [view.longitude, view.latitude]
    setViewState(view)
    globalStore.commit('setMapCamera', view)
  }

  // INTERACTIONS ---------------------------------------------------------------------
  function handleClick() {
    console.log('click!')
  }

  function precise(x: number) {
    return format(x, { lowerExp: -7, upperExp: 7, precision: 4 })
  }

  function getTooltip({ object, index }: { object: any; index: number }) {
    // tooltip will show values for color settings and for width settings.
    // if there is base data, it will also show values and diff vs. base for both color and width.

    if (object == null) return null
    const propList = []

    // calculated value
    if (calculatedValues && calculatedValueLabel) {
      const key = calculatedValueLabel || 'Value'
      let value = precise(calculatedValues[index])

      if (calculatedValueLabel.startsWith('%')) value = value + ' %'

      propList.push(
        `<tr><td style="text-align: right; padding-right: 0.5rem;">${key}</td><td><b>${value}</b></td></tr>`
      )
    }

    // FIXME dataset elements
    const featureTips = [] as any[] // Object.entries(features[index].properties)

    let datasetProps = ''
    for (const [tipKey, tipValue] of featureTips) {
      let value = tipValue
      if (value == null) return
      if (typeof value == 'number') value = precise(value)
      datasetProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${tipKey}</td><td><b>${value}</b></td></tr>`
    }
    if (datasetProps) propList.push(datasetProps)

    // feature elements
    let columns = Object.keys(featureDataTable)
    if (tooltip && tooltip.length) {
      columns = tooltip.map(tip => {
        return tip.substring(tip.indexOf('.') + 1)
      })
    }

    let featureProps = ''
    columns.forEach(column => {
      if (featureDataTable[column]) {
        let value = featureDataTable[column].values[index]
        if (value == null) return
        if (typeof value == 'number') value = precise(value)
        featureProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${column}</td><td><b>${value}</b></td></tr>`
      }
    })
    if (featureProps) propList.push(featureProps)

    let finalHTML = propList.join('<tr><td>&nbsp;</td></tr>')
    const html = `<table>${finalHTML}</table>`

    try {
      return {
        html,
        style: {
          fontSize: '0.9rem',
          color: '#224',
          backgroundColor: 'white',
          filter: 'drop-shadow(0px 4px 8px #44444444)',
        },
      }
    } catch (e) {
      console.warn(e)
      return html
    }
  }

  // const layer = new GeojsonOffsetLayer({
  //   id: 'geoJsonOffsetLayer',
  //   data: {
  //     length: polygons.pLength,
  //     startIndices: polygons.startIndices,
  //     attributes: {
  //       getPolygon: { value: polygons.vertices, size: 2 },
  //       getFillColor: { value: fillColors, size: 3 },
  //     },
  //   },
  //   // function callbacks: --------------
  //   getFillColor: [96, 0, 240], // cbFillColor,
  //   getLineWidth: cbLineWidth,
  //   getLineColor: cbLineColor,
  //   getPointRadius: cbPointRadius,
  //   getElevation: cbFillHeight,
  //   positionFormat: 'XY',
  //   // settings: ------------------------
  //   autoHighlight: true,
  //   extruded: !!fillHeights,
  //   highlightColor: [255, 0, 224],
  //   _normalize: false,
  //   // lineJointRounded: true,
  //   lineWidthUnits: 'pixels',
  //   lineWidthScale: 1,
  //   lineWidthMinPixels: typeof lineWidths === 'number' ? 0 : 1,
  //   lineWidthMaxPixels: 50,
  //   getOffset: OFFSET_DIRECTION.RIGHT,
  //   opacity: fillHeights ? 100 : opacity / 100, // 3D must be opaque
  //   pickable: true,
  //   pointRadiusUnits: 'pixels',
  //   pointRadiusMinPixels: 2,
  //   // pointRadiusMaxPixels: 50,
  //   stroked: isStroked,
  //   useDevicePixels: isTakingScreenshot,
  //   updateTriggers: {
  //     getFillColor: fillColors,
  //     getLineColor: lineColors,
  //     getLineWidth: lineWidths,
  //     getPointRadius: pointRadii,
  //     getElevation: fillHeights,
  //     getFilterValue: featureFilter,
  //   },
  //   transitions: {
  //     getFillColor: 300,
  //     getLineColor: 300,
  //     getLineWidth: 300,
  //     getPointRadius: 300,
  //   },
  //   parameters: {
  //     depthTest: !!fillHeights,
  //   },
  //   glOptions: {
  //     // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
  //     preserveDrawingBuffer: true,
  //   },
  //   // filter shapes
  //   extensions: [new DataFilterExtension({ filterSize: 1 })],
  //   filterRange: [0, 1], // set filter to -1 to filter element out
  //   getFilterValue: (_: any, o: DeckObject) => {
  //     return featureFilter[o.index]
  //   },
  // }) as any

  const deckInstance = (
    /*
    //@ts-ignore */
    <DeckGL
      layers={[]}
      viewState={viewState}
      controller={true}
      pickingRadius={4}
      getTooltip={getTooltip}
      onClick={handleClick}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
      getCursor={({ isDragging, isHovering }: any) =>
        isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
      }
      onAfterRender={async () => {
        if (screenshot > screenshotCount) {
          // console.log({ deckInstance })
          await screenshots.savePNG(
            deckInstance.props.layers[0],
            _mapRef?.current?.getMap()._canvas
          )
          setScreenshot(screenshot) // update scrnshot count so we don't take 1000 screenshots by mistake :-/
        }
      }}
    >
      {
        /*
    // @ts-ignore */
        <StaticMap
          ref={_mapRef}
          mapStyle={globalStore.getters.mapStyle}
          mapboxApiAccessToken={MAPBOX_TOKEN}
          preserveDrawingBuffer
          preventStyleDiffing
          reuseMaps
        />
      }
    </DeckGL>
  )

  return deckInstance
}
