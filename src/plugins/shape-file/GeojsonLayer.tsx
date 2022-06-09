import React, { useState, useMemo, useEffect, useRef } from 'react'
import DeckGL from '@deck.gl/react'

import { StaticMap, MapRef } from 'react-map-gl'
import { rgb } from 'd3-color'
import { format } from 'mathjs'

import { DataTable, MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

import globalStore from '@/store'
import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'
import { GeoJsonLayer } from '@deck.gl/layers'
import GeojsonOffsetLayer from '@/layers/GeojsonOffsetLayer'
import screenshots from '@/js/screenshots'

// GeoJsonLayer.defaultProps = {
//   bearing: 0,
//   offsetDirection: OFFSET_DIRECTION.RIGHT,
// }

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default function Component({
  viewId = 0,
  features = [] as any[],
  fillColors = '#59a14f' as string | Uint8Array,
  lineColors = '#4e79a7' as string | Uint8Array,
  lineWidths = 0 as number | Float32Array,
  fillHeights = 0 as number | Float32Array,
  opacity = 1,
  pointRadii = 5 as number | Float32Array,
  screenshot = 0,
  featureDataTable = {} as DataTable,
  tooltip = [] as string[],
}) {
  const mapRef = useRef<MapRef>() as any
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
  } else {
    // array of colors
    cbLineColor = (_: any, o: DeckObject) => {
      return [
        lineColors[o.index * 3 + 0], // r
        lineColors[o.index * 3 + 1], // g
        lineColors[o.index * 3 + 2], // b
        255, // no opacity, for now
      ]
    }
  }

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

  // MAP VIEW -------------------------------------------------------------------------
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
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
    return format(x, { lowerExp: -6, upperExp: 6, precision: 5 })
  }

  function getTooltip({ object, index }: { object: any; index: number }) {
    // tooltip will show values for color settings and for width settings.
    // if there is base data, it will also show values and diff vs. base for both color and width.

    if (object == null) return null
    let propList = ''

    // dataset elements
    const featureTips = Object.entries(features[index].properties)
    for (const tip of featureTips) {
      let value = tip[1]
      if (value == null) return
      if (typeof value == 'number') value = precise(value)
      propList += `<tr><td style="text-align: right; padding-right: 0.5rem;">${tip[0]}</td><td><b>${value}</b></td></tr>`
    }
    if (propList) propList += `<tr><td>&nbsp;</td></tr>`

    // feature elements
    let columns = Object.keys(featureDataTable)
    if (tooltip && tooltip.length) {
      columns = tooltip.map(tip => {
        return tip.substring(tip.indexOf('.') + 1)
      })
    }
    columns.forEach(column => {
      if (featureDataTable[column]) {
        let value = featureDataTable[column].values[index]
        if (value == null) return
        if (typeof value == 'number') value = precise(value)
        propList += `<tr><td style="text-align: right; padding-right: 0.5rem;">${column}</td><td><b>${value}</b></td></tr>`
      }
    })

    const html = `<table>${propList}</table>`

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

  const layer = new GeojsonOffsetLayer({
    id: 'geoJsonOffsetLayer',
    data: features,
    // function callbacks: --------------
    getLineWidth: cbLineWidth,
    getLineColor: cbLineColor,
    getFillColor: cbFillColor,
    getPointRadius: cbPointRadius,
    getElevation: cbFillHeight,
    // settings: ------------------------
    autoHighlight: true,
    extruded: !!fillHeights,
    highlightColor: [255, 0, 224],
    // lineJointRounded: true,
    lineWidthUnits: 'pixels',
    lineWidthScale: 1,
    lineWidthMinPixels: 1,
    lineWidthMaxPixels: 50,
    // getOffset: OFFSET_DIRECTION.RIGHT,
    opacity: fillHeights ? 100 : opacity / 100, // 3D must be opaque
    pickable: true,
    pointRadiusUnits: 'pixels',
    pointRadiusMinPixels: 2,
    // pointRadiusMaxPixels: 50,
    stroked: isStroked,
    useDevicePixels: isTakingScreenshot,
    updateTriggers: {
      getFillColor: fillColors,
      getLineColor: lineColors,
      getLineWidth: lineWidths,
      getPointRadius: pointRadii,
      getElevation: fillHeights,
    },
    transitions: {
      getFillColor: 300,
      getLineColor: 300,
      getLineWidth: 300,
      getPointRadius: 300,
    },
    parameters: {
      depthTest: !!fillHeights,
    },
    glOptions: {
      preserveDrawingBuffer: true, // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
    },
  }) as any

  const deckInstance = (
    /*
    //@ts-ignore */
    <DeckGL
      layers={[layer]}
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
          await screenshots.savePNG(deckInstance.props.layers[0], mapRef?.current?.getMap()._canvas)
          setScreenshot(screenshot) // update scrnshot count so we don't take 1000 screenshots by mistake :-/
        }
      }}
    >
      {
        /*
        // @ts-ignore */
        <StaticMap
          ref={mapRef}
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
