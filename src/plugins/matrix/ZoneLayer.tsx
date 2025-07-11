import React, { useState, useMemo, useEffect, useRef } from 'react'
import DeckGL from '@deck.gl/react'
import { GeoJsonLayer } from '@deck.gl/layers'
import { StaticMap, MapRef } from 'react-map-gl'
import { rgb } from 'd3-color'

import globalStore from '@/store'
import screenshots from '@/js/screenshots'
import { DataTable, MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'

export default function Component({
  viewId = 0,
  features = [] as any[],
  fillColors = '#59a14f' as string | Uint8Array,
  fillHeights = 0 as number | Float32Array,
  screenshot = 0,
  cbTooltip = null as any,
  clickedZone = {} as any,
  activeZoneFeature = null as any,
  altZoneFeature = null as any,
  isLoading = false,
}) {
  const PRECISION = 4
  const DEFAULT_FILL = [32, 64, 128, 255]

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [screenshotCount, setScreenshot] = useState(screenshot)
  const _mapRef = useRef<MapRef>() as any

  // // MAP VIEW -------------------------------------------------------------------------
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
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
    cbFillColor = (_: any, o: any) => {
      return [
        fillColors[o.index * 3 + 0], // r
        fillColors[o.index * 3 + 1], // g
        fillColors[o.index * 3 + 2], // b
        255, // no opacity, for now
      ]
    }
  }

  function handleViewState(view: any) {
    if (!view.latitude) return
    view.center = [view.longitude, view.latitude]
    setViewState(view)
    globalStore.commit('setMapCamera', view)
  }

  // CLICK  ---------------------------------------------------------------------
  function handleClick(e: any) {
    console.log('click!')
    if (!e.object) return
    clickedZone({ index: e.index, properties: e.object.properties })
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
  function getTooltip(event: any) {
    const { index, object } = event
    if (cbTooltip) cbTooltip({ index, object })
  }

  // --------------------------------------------------------------------------
  const highlights = []
  if (activeZoneFeature) {
    highlights.push(activeZoneFeature)
    if (altZoneFeature) highlights.push(altZoneFeature)
  }

  const highlightColor = [255, 0, 224]
  const altColor = [255, 255, 128]

  const highlightLayer = new GeoJsonLayer({
    id: 'HighlightLayer',
    data: highlights,
    getLineWidth: 6,
    getLineColor: (_: any, o: any) => (o.index === 0 ? highlightColor : altColor),
    getFillColor: [0, 0, 0, 0], // fully transparent
    lineJointRounded: true,
    lineWidthUnits: 'pixels',
    lineWidthScale: 1,
    opacity: 1.0,
    pickable: false,
    fp64: false,
    parameters: {
      depthTest: false,
      fp64: false,
    },
  }) as any

  const layer = new GeoJsonLayer({
    id: 'ZonalLayer',
    data: features,
    getFillColor: (d: any) => d.properties.color || DEFAULT_FILL,
    autoHighlight: true,
    extruded: !!fillHeights,
    opacity: isLoading ? 0.8 : 1.0, // fillHeights ? 1.0 : 0.8, // 3D must be opaque
    pickable: true,
    stroked: false,
    highlightColor: [255, 255, 255, 128],
    useDevicePixels: isTakingScreenshot,
    fp64: false,
    material: false,
    transitions: {
      getFillColor: 250,
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
  }) as any

  const deckInstance = (
    /*
      //@ts-ignore */
    <DeckGL
      layers={[layer, highlightLayer]}
      viewState={viewState}
      controller={true}
      pickingRadius={4}
      getTooltip={getTooltip}
      getCursor={({ isDragging, isHovering }: any) =>
        isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
      }
      onClick={(e: any) => handleClick(e)}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
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
