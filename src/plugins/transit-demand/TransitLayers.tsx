import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { COORDINATE_SYSTEM } from '@deck.gl/core'

import { StaticMap } from 'react-map-gl'
import { format } from 'mathjs'
import { color } from 'd3-color'

import { GeoJsonLayer, IconLayer } from '@deck.gl/layers'

import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import globalStore from '@/store'

const BASE_URL = import.meta.env.BASE_URL

const ICON_MAPPING = {
  marker: { x: 0, y: 0, width: 128, height: 128, mask: true },
  info: { x: 128, y: 0, width: 128, height: 128, mask: true },
  vehicle: { x: 128, y: 128, width: 128, height: 128, mask: true },
  diamond: { x: 0, y: 128, width: 128, height: 128, mask: false },
}

const colorToRGB = (colorString: string) => {
  try {
    const rgb = color(colorString)
    if (!rgb) return [0, 0, 0]
    // d3.color provides r, g, b properties directly
    return [rgb.r, rgb.g, rgb.b]
  } catch (error) {
    return [0, 0, 0]
  }
}

export default function Component({
  viewId = 0,
  links = {} as any,
  selectedFeatures = [] as any[],
  stopMarkers = [] as any[],
  mapIsIndependent = false,
  projection = 'EPSG:4326',
  handleClickEvent = null as any,
}) {
  // ------- draw frame begins here -----------------------------

  const dark = globalStore.state.isDarkMode
  const locale = globalStore.state.locale

  // register setViewState in global view updater so we can respond to external map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  const [viewState, setViewState] = useState(globalStore.state.viewState)

  const data = useMemo(
    () =>
      links.features.map((feature: any) => {
        // convert css colors to rgb[]
        const currentColor = feature.properties.currentColor
        const useColor = Array.isArray(currentColor) ? currentColor : colorToRGB(currentColor)

        return {
          source: feature.geometry.coordinates[0],
          target: feature.geometry.coordinates[1],
          color: useColor,
          width: feature.properties.width,
        }
      }),
    [links]
  )

  function handleClick(event: any) {
    if (handleClickEvent) handleClickEvent(event)
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    if (!mapIsIndependent) globalStore.commit('setMapCamera', view)
  }

  function precise(x: number) {
    return format(x, { lowerExp: -6, upperExp: 6, precision: 5 })
  }

  function getTooltip({ object, index }: { object: any; index: number }) {
    if (index == -1) return null

    const metrics = [
      { field: 'pax', name_en: 'Passengers', name_de: 'Passagiere' },
      { field: 'departures', name_en: 'Departures', name_de: 'Abfahrten' },
      { field: 'cap', name_en: 'Capacity', name_de: 'Kapazität' },
      { field: 'loadfac', name_en: 'Load factor', name_de: 'Load factor' },
    ]

    try {
      let html = '<div class="map-popup">'

      const props = links.features[index].properties

      for (const metric of metrics) {
        let label = locale == 'de' ? metric.name_de : metric.name_en
        label = label.replaceAll(' ', '&nbsp;')

        if (Number.isFinite(props[metric.field]))
          html += `
            <div style="display: flex">
              <div>${label}:&nbsp;&nbsp;</div>
              <b style="margin-left: auto; text-align: right">${props[metric.field]}</b>
            </div>`
      }

      html += '<div>'
      return {
        html,
        style: {
          fontSize: '0.8rem',
          color: dark ? '#ccc' : '#223',
          backgroundColor: dark ? '#2a3c4f' : 'white',
          margin: '2rem 0 0rem 0rem',
        },
      }
    } catch (e) {
      // weird, no
      return null
    }
  }

  // Atlantis is pre-converted now in the RoadNetworkLoader to lng/lat
  // projection == 'Atlantis' ? COORDINATE_SYSTEM.METER_OFFSETS : COORDINATE_SYSTEM.DEFAULT
  const coordinateSystem = COORDINATE_SYSTEM.DEFAULT
  const showBackgroundMap = projection && projection !== 'Atlantis'

  const layers = [] as any[]

  layers.push(
    //@ts-ignore
    new LineOffsetLayer({
      id: 'linkLayer',
      data,
      getSourcePosition: (d: any) => d.source,
      getTargetPosition: (d: any) => d.target,
      getColor: (d: any) => d.color,
      getWidth: (d: any) => d.width,
      widthUnits: 'pixels',
      widthScale: 1,
      widthMinPixels: 2,
      widthMaxPixels: 50,
      pickable: true,
      coordinateSystem,
      opacity: 1,
      autoHighlight: false,
      // highlightColor: [255, 0, 224],
      offsetDirection: OFFSET_DIRECTION.RIGHT,
      parameters: { depthTest: false },
      // updateTriggers: {
      //   getSourcePosition: [links.source],
      //   getTargetPosition: [links.dest],
      //   getColor: [newColors, dark],
      //   getWidth: [newWidths],
      // },
      transitions: {
        getColor: 200,
        // getWidth: 200,
        // widthScale: 200,
      },
    })
  )

  // YELLOW HIGHLIGHT LINES ---------
  if (selectedFeatures.length)
    layers.push(
      new GeoJsonLayer({
        id: 'selected-links',
        data: selectedFeatures,
        getLineColor: colorToRGB(dark ? '#fbff66' : '#ccff66'),
        getLineWidth: 3,
        lineWidthUnits: 'pixels',
        stroked: true,
        filled: false,
        pickable: false,
        coordinateSystem,
        opacity: 1,
        autoHighlight: false,
        offsetDirection: OFFSET_DIRECTION.RIGHT,
        parameters: { depthTest: false },
      })
    )

  // STOP ICONS ----------------
  if (stopMarkers.length)
    layers.push(
      new IconLayer({
        id: 'stop-icon-layer',
        data: stopMarkers,
        getPosition: (d: any) => d.xy,
        getAngle: (d: any) => d.bearing,
        getIcon: (d: any) => 'marker',
        getSize: 8,
        pickable: false,
        billboard: true,
        opacity: 1,
        sizeScale: 1,
        autoHighlight: false,
        parameters: { depthTest: false },
        iconAtlas: `${BASE_URL}icon-stop-triangle.png`,
        iconMapping: {
          marker: {
            x: 0,
            y: 0,
            width: 250,
            height: 121,
            anchorX: 125,
            anchorY: 118,
          },
        },
      })
    )

  // ############

  return (
    /*
    //@ts-ignore */
    <DeckGL
      layers={layers}
      viewState={viewState}
      controller={true}
      pickingRadius={4}
      getTooltip={getTooltip}
      getCursor={({ isDragging, isHovering }: any) =>
        isDragging ? 'grabbing' : isHovering ? 'pointer' : 'grab'
      }
      onClick={handleClick}
      onViewStateChange={(e: any) => handleViewState(e.viewState)}
    >
      {showBackgroundMap && (
        /*
        // @ts-ignore */
        <StaticMap mapStyle={globalStore.getters.mapStyle} mapboxApiAccessToken={MAPBOX_TOKEN} />
      )}
    </DeckGL>
  )
}
