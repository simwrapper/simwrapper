import React, { useEffect, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { FlowmapLayer, FlowmapLayerPickingInfo, PickingType } from '@flowmap.gl/layers'
import { ScatterplotLayer } from '@deck.gl/layers';
import { FlowmapData, getViewStateForLocations } from '@flowmap.gl/data'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import globalStore from '@/store'

export default function Layer({
  props = {} as any,
  viewId = 0, // viewId: this must be unique;
}) {
  const { locations, flows, dark, elapsed, vizDetails } = props

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [hoverInfo, setHoverInfo] = useState({})
  // const [data, setData] = useState<FlowmapData<LocationDatum, FlowDatum>>()

  // register setViewState in global view updater so we can respond to map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  function handleClick() {
    console.log('click!')
  }

  function handleHover(hover: any) {
    console.log(hover)
    setHoverInfo(hover)
  }

  function handleViewState(view: any) {
    setViewState(view)
    view.center = [view.longitude, view.latitude]
    globalStore.commit('setMapCamera', view)
  }



  const layer = new FlowmapLayer({
    data: props,
    id: 'my-flowmap-' + viewId,
    getLocationId: (location: any) => location.id,
    getLocationLat: (location: any) => location.lat,
    getLocationLon: (location: any) => location.lon,
    getLocationName: (location: any) => location.id,
    getFlowOriginId: (flow: any) => flow.o,
    getFlowDestId: (flow: any) => flow.d,
    getFlowMagnitude: (flow: any) => flow.v || null,
    adaptiveScalesEnabled: true,
    parameters: { depthTest: false },
    colorScheme: props.vizDetails.colorScheme,
    animationEnabled: vizDetails.animationEnabled,
    clusteringEnabled: vizDetails.clustering,
    clusteringAuto: vizDetails.clustering,
    clusteringLevel: vizDetails.clusteringLevel,
    darkMode: dark,
    drawOutline: false,
    fadeEnabled: true,
    opacity: 1,
    pickable: true,
    // adaptiveScalesEnabled: true,
    // darkMode: false,
  })

  console.log(props.slider)

  return (
    /*
    //@ts-ignore */
    <DeckGL
      layers={[layer]}
      controller={true}
      viewState={viewState}
      pickingRadius={4}
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
