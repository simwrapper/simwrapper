import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { Buffer } from '@luma.gl/core'

import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'

import { scaleThreshold } from 'd3-scale'
import { StaticMap } from 'react-map-gl'
import { rgb } from 'd3-color'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES, DataTableColumn, LookupDataset } from '@/Globals'
import globalStore from '@/store'

export default function Component({
  links = { source: new Float32Array(), dest: new Float32Array() },
  colors = ['#0099ee'],
  dark = false,
  scaleWidth = 1,
  build = {} as LookupDataset,
  base = {} as LookupDataset,
  widths = {} as LookupDataset,
  showDiffs = false,
  viewId = 0,
}) {
  // ------- draw frame begins here -----------------------------

  const { dataTable, activeColumn, joinColumn } = build
  const buildColumn: DataTableColumn = dataTable[activeColumn] || { values: [] }

  // const [hoverInfo, setHoverInfo] = useState({})
  // const [pickIndex, setPickIndex] = useState(-1)
  const [viewState, setViewState] = useState(globalStore.state.viewState)

  const widthValues = widths.dataTable[widths.activeColumn]

  // deck.gl colors must be in rgb[] or rgba[] format
  const rgbColors: any = colors.map(hexcolor => {
    const c = rgb(hexcolor)
    return [c.r, c.g, c.b]
  })

  // Build breakpoints between 0.0 - 1.0 to match the number of color swatches
  // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
  // An exponent reduces visual dominance of very large values at the high end of the scale
  const exponent = 4.0

  const domain = new Array(colors.length - 1)
    .fill(0)
    .map((v, i) => Math.pow((1 / colors.length) * (i + 1), exponent))

  // scaleThreshold is the d3 function that maps values 0.0-1.0 to the color buckets
  // range is the list of colors; domain is the list of breakpoints in the 0-1.0 continuum
  const setColorBasedOnValue = scaleThreshold().range(rgbColors).domain(domain)

  // this assumes that zero means hide the link. This may not be generic enough
  const colorPaleGrey = dark ? [80, 80, 80, 96] : [212, 212, 212, 96]
  const colorInvisible = [0, 0, 0, 0]

  // register setViewState in global view updater
  // so we can respond to external map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  // --- LINE COLORS -----------------------------------------------
  const getLineColor = (
    feature: any,
    objectInfo: { index: number; data: any; target: number[] }
  ) => {
    let value = dataTable[activeColumn].values[objectInfo.index]
    if (!value) return colorInvisible

    if (colors.length === 1) return rgbColors[0]

    // comparison?
    if (showDiffs) {
      const baseValue = base.dataTable[base.activeColumn].values[objectInfo.index]
      const diff = value - baseValue

      if (diff === 0) return colorPaleGrey // setColorBasedOnValue(0.5)
      return diff > 0 ? [255, 0, 0] : [0, 0, 255] // red vs. blue
    } else {
      // don't use log scale if numbers are below 1.0
      let ratio = value / (buildColumn.max || 1.0)
      // if (ratio < 0.0001) return colorPaleGrey

      return setColorBasedOnValue(ratio)
    }
  }

  // --- LINE WIDTHS -----------------------------------------------
  // --> 2 pixels if no line width at all
  // --> Scaled up to 50 pixels, scaled vs. maxWidth
  const getLineWidth = (
    feature: any,
    objectInfo: { index: number; data: any; target: number[] }
  ) => {
    if (!widthValues) return 0

    const value = widthValues.values[objectInfo.index]

    if (showDiffs) {
      const baseValue = base.dataTable[base.activeColumn].values[objectInfo.index]
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

  function getTooltip({ object, index }: { object: any; index: number }) {
    try {
      // tooltip colors------------
      let html = (() => {
        if (!activeColumn) return ''

        let value = buildColumn.values[index]

        let baseValue = 0
        let diff = undefined

        if (showDiffs) {
          const baseValue = base.dataTable[base.activeColumn].values[index]
          diff = value - baseValue
        } else {
          if (value === undefined) return ''
        }

        const roundValue = Math.round(value * 10000.0) / 10000.0
        const roundDiff = diff ? Math.round(diff * 10000.0) / 10000.0 : diff
        const baseElement = baseValue ? `<p>+/- Base: ${roundDiff}</p>` : ''

        return `<b>${activeColumn}</b>
                <p>${roundValue}</p>
                ${baseElement}`
      })()

      // tooltip widths------------
      html += (() => {
        let widthValue = '' as any
        let widthColumnName = ''

        const value = widthValues.values[index]
        if (value == undefined) return ''

        if (widthValues !== buildColumn) {
          widthValue = Math.round(widthValues.values[index] * 10000.0) / 10000.0
          widthColumnName = widths.activeColumn || 'N/A'
        }
        return `<b>${widthColumnName}</b>
                <p>${widthValue}</p>`
      })()

      if (!html) return null

      return {
        html,
        style: { color: dark ? '#ccc' : '#223', backgroundColor: dark ? '#2a3c4f' : 'white' },
      }
    } catch (e) {
      return null
    }
  }

  //@ts-ignore
  const layer = new LineOffsetLayer({
    id: 'linkLayer',
    data: buildColumn.values,
    getSourcePosition: (object: any, props: { index: number; data: any; target: any[] }) => {
      // target is [long,lat]
      const offset = 2 * dataTable[joinColumn].values[props.index]
      props.target[0] = links.source[offset]
      props.target[1] = links.source[offset + 1]
      return props.target
    },
    getTargetPosition: (object: any, props: { index: number; data: any; target: any[] }) => {
      // target is [long,lat]
      const offset = 2 * dataTable[joinColumn].values[props.index]
      props.target[0] = links.dest[offset]
      props.target[1] = links.dest[offset + 1]
      return props.target
    },
    getColor: getLineColor,
    getWidth: getLineWidth,
    widthUnits: 'pixels',
    widthMinPixels: 1,
    widthMaxPixels: 50,
    pickable: true,
    opacity: 0.97,
    autoHighlight: true,
    highlightColor: [255, 0, 224],
    offsetDirection: OFFSET_DIRECTION.RIGHT,
    updateTriggers: {
      getColor: [showDiffs, dark, colors, activeColumn],
      getWidth: [showDiffs, scaleWidth, widths],
    },
    transitions: {
      getColor: 200,
      getWidth: 200,
    },
    parameters: {
      depthTest: false,
    },
  })

  return (
    /*
    //@ts-ignore */
    <DeckGL
      layers={[layer]}
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
        <StaticMap mapStyle={globalStore.getters.mapStyle} mapboxApiAccessToken={MAPBOX_TOKEN} />
      }
    </DeckGL>
  )
}
