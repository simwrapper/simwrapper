import React, { useState, useMemo, useEffect } from 'react'
import DeckGL from '@deck.gl/react'
import { ScatterplotLayer } from '@deck.gl/layers'
import { StaticMap } from 'react-map-gl'

import { COORDINATE_SYSTEM } from '@deck.gl/core'
import { MAPBOX_TOKEN } from '@/Globals'

function App({ data = [], initialView = {} as any }) {
  const layer = new ScatterplotLayer({
    id: 'scatterplot-layer',
    coordinateSystem: COORDINATE_SYSTEM.METER_OFFSETS,
    coordinateOrigin: [13.5, 52.6, 0],
    data,
    pickable: true,
    opacity: 0.8,
    stroked: false,
    filled: true,
    radiusScale: 2,
    numColors: 2,
    radiusMinPixels: 1,
    radiusMaxPixels: 100,
    lineWidthMinPixels: 1,
    getPosition: (d: any) => [d[1] - 4600000, d[2] - 5830000],
    getRadius: 100, // (d: any) => Math.sqrt(d.exits),
    getFillColor: (d: any) => (d[0] === 'car' ? [255, 100, 0] : [108, 0, 200]),
    getLineColor: (d: any) => [0, 0, 0],
    parameters: {
      depthTest: false,
    },
  })

  return (
    /*
    //@ts-ignore */
    <DeckGL controller={true} initialViewState={initialView} layers={[layer]}>
      {
        /*
        // @ts-ignore */
        <StaticMap mapStyle={MAP_STYLES.light} mapboxApiAccessToken={MAPBOX_TOKEN} />
      }
    </DeckGL>
  )

  //   getTooltip={({ object }) => object && `${object.name}\n${object.address}`}
}

export default App
