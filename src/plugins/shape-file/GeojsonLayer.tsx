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
  lineColors = '#4e79a7' as string | Uint8Array,
  lineWidths = 2 as number | Float32Array,
}) {
  const [viewState, setViewState] = useState(globalStore.state.viewState)

  // LINE COLORS ----------------------------------------------------------------------
  let cbLineColor // can be callback OR a plain string in simple mode
  if (typeof lineColors == 'string') {
    // simple color mode
    const color = rgb(lineColors)
    cbLineColor = [color.r, color.g, color.b]
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
    getLineWidth: cbLineWidth,
    getLineColor: cbLineColor,
    getFillColor: [64, 128, 255],
    getPointRadius: 10,
    lineWidthUnits: 'pixels',
    lineWidthScale: 1,
    lineWidthMinPixels: 2,
    lineWidthMaxPixels: 25,
    pickable: true,
    opacity: 1,
    autoHighlight: true,
    highlightColor: [255, 0, 224],
    offsetDirection: OFFSET_DIRECTION.RIGHT,
    updateTriggers: {
      getLineColor: lineColors,
    },
    transitions: {
      getLineColor: 200,
      getLineWidth: 200,
    },
    parameters: {
      // depthTest: false,
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
