import React, { useState } from 'react'
import DeckGL from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { FlowmapLayer, FlowmapLayerPickingInfo, PickingType } from '@flowmap.gl/layers'

import { MAPBOX_TOKEN, REACT_VIEW_HANDLES } from '@/Globals'
import globalStore from '@/store'

export default function Layer({
  props = {} as any,
  viewId = 0, // viewId: this must be unique;
}) {
  const { dark, vizDetails } = props

  // type TooltipState = {
  //   content: ReactNode;
  // };

  const [viewState, setViewState] = useState(globalStore.state.viewState)
  const [info, setTooltip] = useState<FlowmapLayerPickingInfo<any, any>>()

  // register setViewState in global view updater so we can respond to map motion
  REACT_VIEW_HANDLES[viewId] = () => {
    setViewState(globalStore.state.viewState)
  }

  function handleClick() {
    console.log('click!')
  }

  // function handleHover(hover: any) {
  //   // console.log(hover)
  //   setHoverInfo(hover)
  // }

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
    colorScheme: vizDetails.colorScheme,
    animationEnabled: vizDetails.animationEnabled,
    clusteringEnabled: vizDetails.clustering,
    clusteringAuto: vizDetails.clustering,
    clusteringLevel: vizDetails.clusteringLevel,
    darkMode: dark,
    drawOutline: false,
    fadeEnabled: true,
    opacity: 1,
    pickable: true,
    onHover: info => setTooltip(info),
    // adaptiveScalesEnabled: true,
    // darkMode: false,
  })

  function getTooltipState(info: FlowmapLayerPickingInfo<any, any> | undefined) {
    if (!info) return undefined
    const { x, y, object } = info
    const position = { left: x, top: y }
    switch (object?.type) {
      case PickingType.LOCATION:
        return (
          <div
            className="tooltip"
            style={{
              fontSize: '0.8rem',
              backgroundColor: '#334455ee',
              boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
              color: '#eee',
              padding: '0.5rem 0.5rem',
              position: 'absolute',
              left: x + 20,
              top: y - 30,
            }}
          >
            <b>{object?.type}</b>
            <br />
            Location ID: {object?.id}
          </div>
        )
      case PickingType.FLOW:
        if (vizDetails.selectedMetric.valueTransform.enum == 'inverse') {
          return (
            <div
              className="tooltip"
              style={{
                fontSize: '0.8rem',
                backgroundColor: '#334455ee',
                boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
                color: '#eee',
                padding: '0.5rem 0.5rem',
                position: 'absolute',
                left: x + 20,
                top: y - 30,
              }}
            >
              <b>{object?.type}</b>
              <br />
              Station IDs: {object?.origin.id} → {object?.dest.id} <br />
              {vizDetails.selectedMetricLabel}: {(Number(object?.count) || 0).toFixed(6)}
            </div>
          )
        } else {
          return (
            <div
              className="tooltip"
              style={{
                fontSize: '0.8rem',
                backgroundColor: '#334455ee',
                boxShadow: '2.5px 2px 4px rgba(0,0,0,0.25)',
                color: '#eee',
                padding: '0.5rem 0.5rem',
                position: 'absolute',
                left: x + 20,
                top: y - 30,
              }}
            >
              <b>{object?.type}</b>
              <br />
              Station IDs: {object?.origin.id} → {object?.dest.id} <br />
              {vizDetails.selectedMetricLabel}: {object?.count}
            </div>
          )
        }
    }
    return undefined
  }

  return (
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
      {getTooltipState(info)}
    </DeckGL>
  )
}
