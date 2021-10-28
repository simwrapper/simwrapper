import React, { useState, useMemo, useEffect } from 'react'
import { StaticMap } from 'react-map-gl'
import DeckGL from '@deck.gl/react'
import FlowMapLayer from '@flowmap.gl/core'
import * as ReactDOM from 'react-dom'

import { MAPBOX_TOKEN, MAP_STYLES } from '@/Globals'

function ZLayer({
  props = {} as any,
  initialView = { latitude: 37.76, longitude: -122.45, zoom: 11, pitch: 0 } as any,
}) {
  const { locations, flows, dark, elapsed } = props

  const layer = new FlowMapLayer({
    id: 'my-flowmap-layer',
    locations,
    flows,
    getFlowMagnitude: flow => flow.count || null,
    getFlowOriginId: flow => flow.origin,
    getFlowDestId: flow => flow.destination,
    getLocationId: (location: any) => location.id,
    getLocationCentroid: (location: any) => [location.lon, location.lat],
    pickable: true,
    animate: true,
    animationCurrentTime: elapsed,
    showTotals: true,
    showOnlyTopFlows: 3000,
  })

  return (
    /*
    //@ts-ignore */
    <DeckGL controller={true} initialViewState={initialView} layers={[layer]}>
      {
        /*
      // @ts-ignore */
        <StaticMap
          reuseMaps
          mapStyle={MAP_STYLES.light}
          preventStyleDiffing={true}
          mapboxApiAccessToken={MAPBOX_TOKEN}
        />
      }
    </DeckGL>
  )
}
export default ZLayer
