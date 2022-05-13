import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'

import { GeoJsonLayer } from '@deck.gl/layers'
import { StaticMap } from 'react-map-gl'
import { rgb } from 'd3-color'
import { format } from 'mathjs'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

import globalStore from '@/store'
import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'

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
  lineWidths = 2 as number | Float32Array,
  pointRadii = 5 as number | Float32Array,
}) {
  const [viewState, setViewState] = useState(globalStore.state.viewState)

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
    cbLineColor = (feature: any, o: DeckObject) => {
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
    cbLineWidth = (feature: any, o: DeckObject) => {
      return lineWidths[o.index]
    }
  }

  // CIRCLE RADIISESS ---------------------------------------------------------------
  let cbPointRadius // can be callback OR a plain string in simple mode
  if (typeof pointRadii == 'number') {
    // simple radius mode
    cbPointRadius = pointRadii
  } else {
    cbPointRadius = (feature: any, o: DeckObject) => {
      return pointRadii[o.index]
    }
  }

  // MAP VIEW -------------------------------------------------------------------------
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
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

    if (!object?.properties) return
    // console.log(object)
    let propList = ''
    Object.entries(object.properties).forEach(
      entry => (propList += `<li>${entry[0]}: <b>${entry[1]}</b></li>`)
    )

    // const html = `<ul>${propList}</ul>`
    const html = `i: ${index}`

    try {
      return {
        html,
        style: {
          color: '#224',
          backgroundColor: 'white',
          filter: 'drop-shadow(0px 4px 8px #44444444)',
        },
        // html: tooltip,
        // style: { color: dark ? '#ccc' : '#223', backgroundColor: dark ? '#2a3c4f' : 'white' },
      }
    } catch (e) {
      console.warn(e)
      return html
    }
  }

  const layer = new GeoJsonLayer({
    id: 'geoJsonLayer',
    data: features,
    // function callbacks:
    getLineWidth: cbLineWidth,
    getLineColor: cbLineColor,
    getFillColor: cbFillColor,
    getPointRadius: cbPointRadius,
    // settings:
    autoHighlight: true,
    highlightColor: [255, 0, 224],
    lineWidthUnits: 'pixels',
    lineWidthScale: 1,
    lineWidthMinPixels: 2,
    lineWidthMaxPixels: 50,
    offsetDirection: OFFSET_DIRECTION.RIGHT,
    opacity: 1,
    pickable: true,
    pointRadiusUnits: 'pixels',
    pointRadiusMinPixels: 2,
    // pointRadiusMaxPixels: 50,
    stroked: isStroked,
    updateTriggers: {
      getFillColor: fillColors,
      getLineColor: lineColors,
      getLineWidth: lineWidths,
      getPointRadius: pointRadii,
    },
    transitions: {
      getFillColor: 300,
      getLineColor: 200,
      getLineWidth: 200,
      getPointRadius: 300,
    },
    parameters: {
      depthTest: false,
    },
  }) as any

  return (
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
    >
      {
        /*
        // @ts-ignore */
        <StaticMap mapStyle={globalStore.getters.mapStyle} mapboxApiAccessToken={MAPBOX_TOKEN} />
      }
    </DeckGL>
  )
}
