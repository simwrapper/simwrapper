import React, { useState } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import FlowMapLayer from '@flowmap.gl/core'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import globalStore from '@/store'

export default function Layer({
  props = {} as any,
  viewId = 0, // viewId: this must be unique;
}) {
  const { locations, flows, dark, elapsed } = props

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [hoverInfo, setHoverInfo] = useState({})

  // register setViewState in global view updater so we can respond to map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  function handleClick() {
    console.log('click!')
  }

  function handleHover(hover: any) {
    console.log(hover)
    // setHoverInfo(hover)
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    globalStore.commit('setMapCamera', view)
  }

  const layer = new FlowMapLayer({
    id: 'my-flowmap-layer',
    locations,
    flows,
    getFlowOriginId: flow => flow.o,
    getFlowDestId: flow => flow.d,
    getFlowMagnitude: flow => flow.v || null,
    getLocationId: (location: any) => location.id,
    getLocationCentroid: (location: any) => [location.lon, location.lat],
    onHover: handleHover,
    // animate: true,
    // animationCurrentTime: elapsed,
    // showTotals: true,
    // selectedLocationIds: ['10'], //  '5', '10', '20'],
    pickable: true,
    maxFlowThickness: 15,
    maxLocationCircleSize: 20,
    // opacity: 0.5,
    outlineThickness: -1,
    showOnlyTopFlows: 2000,
  })

  return (
    /*
    //@ts-ignore */
    <DeckGL
      layers={[layer]}
      controller={true}
      viewState={viewState}
      pickingRadius={5}
      getCursor={() => 'pointer'}
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
