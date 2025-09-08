// import React, { useState, useMemo, useEffect, useRef } from 'react'
import DeckGL from '@deck.gl/react'
import { DataFilterExtension } from '@deck.gl/extensions'

// import { StaticMap, MapRef } from 'react-map-gl'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import globalStore from '@/store'
import screenshots from '@/js/screenshots'

interface DeckObject {
  index: number
  target: number[]
  data: any
}

export default function Component({
  viewId = 0,
  layers = [] as any[],
  screenshot = 0,
  cbTooltip = null as any,
  cbError = null as any,
}) {
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

  // SCREENSHOT -----------------------------------------------------------------------
  let isTakingScreenshot = screenshot > screenshotCount

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

  // TOOLTIP ------------------------------------------------------------------
  function getTooltip({ object, index }: { object: any; index: number }) {
    if (cbTooltip) cbTooltip(index, object)
  }

  const mapLayers = layers
    .map(layer => {
      try {
        return layer.deckLayer()
      } catch (e) {
        if (cbError) cbError(e)
      }
    })
    .reverse()

  const deckInstance = (
    /*
    //@ts-ignore */
    <DeckGL
      layers={mapLayers}
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
