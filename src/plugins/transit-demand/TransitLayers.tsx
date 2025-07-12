import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { COORDINATE_SYSTEM } from '@deck.gl/core'

import { StaticMap } from 'react-map-gl'
import { color } from 'd3-color'

import { GeoJsonLayer, IconLayer, SolidPolygonLayer } from '@deck.gl/layers'

import { LineOffsetLayer, OFFSET_DIRECTION } from '@/layers/LineOffsetLayer'
// import PieChartLayer, { PieInfo } from '@/layers/PieChartLayer2'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import globalStore from '@/store'

export interface PieInfo {
  center: number[]
  radius: number
  slices: { value: number; color: string | number[] }[]
}

export interface PtLine {
  name: string
  a: number
  b: number
}

const BASE_URL = import.meta.env.BASE_URL

const calculatePieSlicePaths = (pies: PieInfo[], scl?: number) => {
  const polygons = []

  const scalingFactor = scl || 0.05

  // loop on each piechart ------
  for (const piechart of pies) {
    const { center, radius, slices } = piechart
    const width = radius * scalingFactor

    let startAngle = Math.PI / 2
    let endAngle = startAngle
    const curviness = 48

    // lat/long are only perfectly symmetric at the equator. This makes the circles round
    const roundnessRatio = Math.cos((center[1] * Math.PI) / 180)

    // user values might not add to 1.000...
    const total = slices.reduce((a, b) => a + b.value, 0)

    slices.forEach(slice => {
      //@ts-ignore
      slice.percent = slice.value / total
    })

    // for tooltip
    const tooltipValues = slices.reduce((obj, slice) => {
      //@ts-ignore
      obj[slice.label] = slice.value
      return obj
    }, {} as any)

    // background circle (we can't use lineWidth because of the internal pie slice lines)
    const bgCircle = []
    const bgWidth = width * 1.02
    for (let i = 0; i <= curviness * 2; i++) {
      endAngle = startAngle + (i / (curviness * 2)) * Math.PI * 2
      bgCircle.push([
        center[0] + (bgWidth * Math.cos(endAngle)) / roundnessRatio,
        center[1] + bgWidth * Math.sin(endAngle),
      ])
    }
    const isDark = globalStore.state.isDarkMode

    polygons.push([
      {
        polygon: bgCircle,
        color: colorToRGB(isDark ? 'black' : 'white'),
        width: width + 1e-5, // to fix firefox sort
        values: tooltipValues,
      },
    ])

    // loop on each slice --------------
    const vertices = slices.map(slice => {
      // start at center
      const polygon = [center]

      for (let i = 0; i <= curviness; i++) {
        // @ts-ignore
        const percent = slice.percent || 0
        endAngle = startAngle + (i / curviness) * percent * Math.PI * 2
        polygon.push([
          center[0] + (width * Math.cos(endAngle)) / roundnessRatio,
          center[1] + width * Math.sin(endAngle),
        ])
      }
      polygon.push(center)
      startAngle = endAngle

      // convert css colors to rgb[]
      const color = Array.isArray(slice.color) ? slice.color : colorToRGB(slice.color)
      return { polygon, color, width, values: tooltipValues }
    })
    polygons.push(vertices)
  }
  const flat = polygons.flat()

  // small pies on top!
  flat.sort((a, b) => (a.width <= b.width ? 1 : -1))
  return flat
}

const colorToRGB = (colorString: string) => {
  try {
    const rgb = color(colorString)
    if (!rgb) return [0, 0, 0]
    // d3.color provides r, g, b properties directly
    return [rgb.r, rgb.g, rgb.b] as number[]
  } catch (error) {
    return [0, 0, 0]
  }
}

export default function Component({
  viewId = 0,
  links = {} as any,
  selectedFeatures = [] as any[],
  transitLines = {} as { [id: string]: any },
  stopMarkers = [] as any[],
  mapIsIndependent = false,
  projection = 'EPSG:4326',
  handleClickEvent = null as any,
  pieSlider = 20,
  widthSlider = 50,
  vizDetails = null as any,
}) {
  // ------- draw frame begins here -----------------------------

  const dark = globalStore.state.isDarkMode
  const locale = globalStore.state.locale

  const power = 1 - (100 - widthSlider) / 100
  const scale = 0.1

  // register setViewState in global view updater so we can respond to external map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  const [viewState, setViewState] = useState(globalStore.state.viewState)

  // ----------------------------------------------
  const data = useMemo(() => {
    const linestrings = links.features.map((feature: any) => {
      // convert css colors to rgb[]
      // const currentColor = feature.properties.currentColor
      // const useColor = Array.isArray(currentColor) ? currentColor : colorToRGB(currentColor)
      return {
        source: [...feature.geometry.coordinates[0], feature.properties.sort],
        target: [...feature.geometry.coordinates[1], feature.properties.sort],
        color: feature.properties.currentColor,
        width: Math.pow(feature.properties.width, power),
      }
    })
    return linestrings
  }, [links, widthSlider])

  // ----------------------------------------------
  const slices: any[] = useMemo(() => {
    if (!vizDetails?.demand) return []

    // no boarding data? no pies.
    if (!stopMarkers.length || stopMarkers[0].boardings == undefined) return []

    // too many pies? show no pies.
    if (stopMarkers.length > 10000) return []

    const fullPies = stopMarkers.map(stop => {
      let selectedLineStopBoardingsCount = 0
      let selectedLineStopAlightingsCount = 0

      const stopPTLines = stop.ptLines as any
      if (stopPTLines) {
        Object.values(stopPTLines).forEach((stopLine: any) => {
          const selectedPtLine = transitLines[stopLine.name]
          if (selectedPtLine) {
            selectedLineStopBoardingsCount += stopLine.b
            selectedLineStopAlightingsCount += stopLine.a
          }
        })
      }

      return {
        center: stop.xy,
        radius:
          0.00002 *
          pieSlider *
          Math.sqrt(selectedLineStopBoardingsCount + selectedLineStopAlightingsCount),
        slices: [
          { label: 'boardings', color: 'gold', value: selectedLineStopBoardingsCount },
          { label: 'alightings', color: 'darkmagenta', value: selectedLineStopAlightingsCount },
        ],
      }
    })
    const individualSlices = calculatePieSlicePaths(fullPies)
    return individualSlices
  }, [stopMarkers, pieSlider])

  function handleClick(event: any) {
    if (handleClickEvent) handleClickEvent(event)
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    if (!mapIsIndependent) globalStore.commit('setMapCamera', view)
  }

  // ----------------------------------------------------------------------
  function getTooltip(z: { object: any; index: number; layer: any }) {
    const { object, index, layer } = z
    if (index == -1) return null
    if (!object) return null

    // ---------------
    if (layer.id.startsWith('stop-pie-charts-layer')) {
      let html = '<div class="map-popup">'
      const { boardings, alightings } = object.values
      object.values.total = boardings + alightings
      for (const [label, value] of Object.entries(object.values)) {
        html += `
        <div style="display: flex">
          <div>${label}:&nbsp;&nbsp;</div>
          <b style="margin-left: auto; text-align: right">${value}</b>
        </div>`
      }
      html += '</div>'
      return {
        html,
        style: {
          fontSize: '0.8rem',
          color: dark ? '#ccc' : '#223',
          backgroundColor: dark ? '#2a4f4f' : '#f4fff4',
          margin: '2rem 0 0rem 0rem',
        },
      }
    }

    // ---------------
    const metrics = [
      { field: 'pax', name_en: 'Passengers', name_de: 'Passagiere' },
      { field: 'departures', name_en: 'Departures', name_de: 'Abfahrten' },
      { field: 'cap', name_en: 'Capacity', name_de: 'Kapazität' },
      { field: 'loadfac', name_en: 'Load factor', name_de: 'Load factor' },
    ]

    try {
      let html = '<div class="map-popup">'

      const props = links.features[index].properties

      // no tooltip if greyed out link
      if (props.sort == 0) return null

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

      html += '</div>'
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
      widthScale: scale, // 1.0, // widthSlider,
      widthMinPixels: 1,
      widthMaxPixels: 100,
      pickable: true,
      coordinateSystem,
      opacity: 1,
      autoHighlight: false,
      offsetDirection: OFFSET_DIRECTION.RIGHT,
      parameters: { depthTest: true },
      transitions: {
        getColor: 200,
        getWidth: 200,
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
        getLineWidth: 1,
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
  // -${Math.random()}

  // PIE CHARTS
  // if (slices.length) {
  layers.push(
    new SolidPolygonLayer({
      id: `stop-pie-charts-layer-${pieSlider}-${stopMarkers.length}`,
      data: slices,
      getPolygon: (d: any) => d.polygon,
      getFillColor: (d: any) => d.color,
      stroked: false,
      filled: true,
      pickable: true,
      extruded: false,
      opacity: 1,
      sizeScale: 1,
      autoHighlight: false,
      parameters: { depthTest: false },
    })
  )
  // }

  // STOP ICONS ----------------

  // ############

  return (
    /*
    //@ts-ignore */
    <DeckGL
      layers={layers}
      viewState={viewState}
      controller={true}
      pickingRadius={3}
      parameters={{ blend: false }}
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
