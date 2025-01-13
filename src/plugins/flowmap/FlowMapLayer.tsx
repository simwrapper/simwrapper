import React, { useEffect, useState } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { FlowmapLayer, FlowmapLayerPickingInfo, PickingType } from '@flowmap.gl/layers'
import {ScatterplotLayer} from '@deck.gl/layers';
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
    // console.log(hover)
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
    // animationEnabled: vizDetails.animationEnabled,
    // clusteringEnabled: vizDetails.clustering,
    // clusteringAuto: vizDetails.clustering,
    // clusteringLevel: vizDetails.clusteringLevel,
    // colorScheme: vizDetails.colorScheme,
    darkMode: dark,
    drawOutline: false,
    fadeEnabled: true,
    fadeAmount: 20,
    fadeOpacityEnabled: true,
    locationLabelsEnabled: vizDetails.locationLabelsEnabled,
    // locationTotalsEnabled: vizDetails.locationTotalsEnabled,
    onHover: handleHover,
    opacity: 1.0, // vizDetails.opacity,
    outlineThickness: vizDetails.outlineThickness,
    pickable: false,
    getFillColor: [255, 140, 0],
    getLineColor: [0, 0, 0],
    // highlightColor: [1, 0.9, 0],
    // showOnlyTopFlows: vizDetails.showOnlyTopFlows,
    // labelsEnabled: vizDetails.labelsEnabled,
    maxFlowThickness: 15,
    // maxTopFlowsDisplayNum: vizDetails.maxTopFlowsDisplayNum,
    // maxLocationCircleSize: 20,
  })

  let data = [
    { "id": "loc1", "lat": 48.999093, "lon": 9.126977 },
    { "id": "loc2", "lat": 49.021825, "lon": 9.195446 },
    { "id": "loc3", "lat": 49.043201, "lon": 9.113273 }
  ]
  const scatterLayer = new ScatterplotLayer({
    id: 'scatter-layer',
    data: data,
    getPosition: (location:any) => [location.lon, location.lat],
    getRadius: 100,
    getFillColor: [255, 140, 0],
    getLineColor: [0, 0, 0],
    getLineWidth: 10,
    radiusScale: 6,
    pickable: true
  });

  console.log(scatterLayer)

  return (
    /*
    //@ts-ignore */
    <DeckGL
      layers={[scatterLayer]}
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
