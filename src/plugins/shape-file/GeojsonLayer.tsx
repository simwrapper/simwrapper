import React, { useState, useMemo, useEffect, useRef } from 'react'
import DeckGL from '@deck.gl/react'
import { DataFilterExtension } from '@deck.gl/extensions'

import { StaticMap, MapRef } from 'react-map-gl'
import { rgb } from 'd3-color'

import { DataTable, MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

import globalStore from '@/store'
import { OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'
import GeojsonOffsetLayer from '@/layers/GeojsonOffsetLayer'

import screenshots from '@/js/screenshots'

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default function Component({
  viewId = 0,
  fillColors = '#59a14f' as string | Uint8Array,
  lineColors = '#4e79a7' as string | Uint8Array,
  lineWidths = 0 as number | Float32Array,
  fillHeights = 0 as number | Float32Array,
  calculatedValues = null as null | Float32Array,
  calculatedValueLabel = '',
  normalizedValues = null as null | Float32Array,
  opacity = 1,
  pointRadii = 4 as number | Float32Array,
  screenshot = 0,
  featureDataTable = {} as DataTable,
  featureFilter = new Float32Array(0),
  tooltip = [] as string[],
  cbTooltip = {} as any,
}) {
  const PRECISION = 4

  // const features = globalStore.state.globalCache[viewId] as any[]
  const [features, setFeatures] = useState([] as any[])

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [screenshotCount, setScreenshot] = useState(screenshot)

  const _mapRef = useRef<MapRef>() as any
  // release _mapRef on unmount to avoid memory leak
  // TODO: WAIT! Releasing _mapRef breaks screenshot functionality.
  // useEffect(() => {
  //   if (screenshot <= screenshotCount) _mapRef.current = false
  // })

  // MAP VIEW -------------------------------------------------------------------------
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  // Feature setter hack:
  // Using the array itself causes an enormous memory leak. I am not sure why
  // Vue/React/Deck.gl are not managing this array correctly. Surely the problem
  // is in our code, not theirs? But I spent days trying to find it.
  // Anyway, making this deep copy of the feature array seems to solve it.
  REACT_VIEW_HANDLES[1000 + viewId] = (features: any[]) => {
    const fullCopy = features.map(feature => {
      const f = {
        type: '' + feature.type,
        geometry: JSON.parse(JSON.stringify(feature.geometry)),
        properties: JSON.parse(JSON.stringify(feature?.properties || {})),
      } as any
      if ('id' in feature) f.id = '' + feature.id
      return f
    })
    setFeatures(fullCopy)
  }

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
      if (features[o.index].properties._hide) return [0, 0, 0, 0]

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

  function handleViewState(view: any) {
    if (!view.latitude) return
    view.center = [view.longitude, view.latitude]
    setViewState(view)
    globalStore.commit('setMapCamera', view)
  }

  // CLICK  ---------------------------------------------------------------------
  function handleClick() {
    console.log('click!')
  }

  // this will only round a number if it is a plain old regular number with
  // a fractional part to the right of the decimal point.
  function truncateFractionalPart({ value, precision }: { value: any; precision: number }) {
    if (typeof value !== 'number') return value

    let printValue = '' + value
    if (printValue.includes('.') && printValue.indexOf('.') === printValue.lastIndexOf('.')) {
      if (/\d$/.test(printValue))
        return printValue.substring(0, 1 + PRECISION + printValue.lastIndexOf('.')) // precise(value, precision)
    }
    return value
  }

  // TOOLTIP ------------------------------------------------------------------
  function getTooltip({ object, index }: { object: any; index: number }) {
    // tooltip will show values for color settings and for width settings.
    // if there is base data, it will also show values and diff vs. base for both color and width.

    if (!cbTooltip) return null

    if (object === null || !features[index]?.properties) {
      cbTooltip(null)
      return null
    }

    const propList = []

    // normalized value first
    if (normalizedValues) {
      const label = calculatedValueLabel ?? 'Normalized Value'
      let value = truncateFractionalPart({ value: normalizedValues[index], precision: PRECISION })

      propList.push(
        `<tr><td style="text-align: right; padding-right: 0.5rem;">${label}</td><td><b>${value}</b></td></tr>`
      )
    }

    // calculated value
    if (calculatedValues) {
      let cLabel = calculatedValueLabel ?? 'Value'

      const label = normalizedValues ? cLabel.substring(0, cLabel.lastIndexOf('/')) : cLabel
      let value = truncateFractionalPart({ value: calculatedValues[index], precision: PRECISION })

      if (calculatedValueLabel.startsWith('%')) value = `${value} %`

      propList.push(
        `<tr><td style="text-align: right; padding-right: 0.5rem;">${label}</td><td><b>${value}</b></td></tr>
         <tr><td>&nbsp;</td></tr>`
      )
    }

    // --- dataset tooltip lines ---
    let datasetProps = ''
    const featureTips = Object.entries(features[index].properties)

    for (const [tipKey, tipValue] of featureTips) {
      if (tipValue === null) continue

      // Truncate fractional digits IF it is a simple number that has a fraction
      let value = truncateFractionalPart({ value: tipValue, precision: 4 })
      datasetProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${tipKey}</td><td><b>${value}</b></td></tr>`
    }

    if (datasetProps) propList.push(datasetProps)

    // --- boundary feature tooltip lines ---
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
        if (typeof value == 'number') value = truncateFractionalPart({ value, precision: 4 })

        featureProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${column}</td><td><b>${value}</b></td></tr>`
      }
    })
    if (featureProps) propList.push(featureProps)

    // nothing to show? no tooltip
    if (!propList.length) {
      cbTooltip(null)
      return
    }

    let finalHTML = propList.join('')
    const html = `<table>${finalHTML}</table>`

    cbTooltip(html)

    return null
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
    lineWidthMinPixels: typeof lineWidths === 'number' ? 0 : 1,
    lineWidthMaxPixels: 50,
    getOffset: OFFSET_DIRECTION.RIGHT,
    opacity: fillHeights ? 1.0 : 0.8, // 3D must be opaque
    pickable: true,
    pointRadiusUnits: 'pixels',
    pointRadiusMinPixels: 2,
    // pointRadiusMaxPixels: 50,
    stroked: isStroked,
    useDevicePixels: isTakingScreenshot,
    fp64: false,
    // material: false,
    updateTriggers: {
      getFillColor: fillColors,
      getLineColor: lineColors,
      getLineWidth: lineWidths,
      getPointRadius: pointRadii,
      getElevation: fillHeights,
      getFilterValue: featureFilter,
    },
    transitions: {
      getFillColor: 300,
      getLineColor: 300,
      getLineWidth: 300,
      getPointRadius: 300,
    },
    parameters: {
      depthTest: !!fillHeights,
      fp64: false,
    },
    glOptions: {
      // https://developer.mozilla.org/en-US/docs/Web/API/HTMLCanvasElement/getContext
      preserveDrawingBuffer: true,
      fp64: false,
    },
    // filter shapes
    extensions: [new DataFilterExtension({ filterSize: 1 })],
    filterRange: [0, 1], // set filter to -1 to filter element out
    getFilterValue: (_: any, o: DeckObject) => {
      return featureFilter[o.index]
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
        <StaticMap mapStyle={globalStore.getters.mapStyle} mapboxApiAccessToken={MAPBOX_TOKEN} />
      }
    </DeckGL>
  )

  return deckInstance
}
