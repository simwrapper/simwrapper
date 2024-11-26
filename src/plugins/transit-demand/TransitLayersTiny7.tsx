import { DeckGL } from '@deck.gl/react'
import { StaticMap } from 'react-map-gl'
import { BASEMAP } from '@deck.gl/carto'
// hello

const thing = () => {
  return (
    <DeckGL initialViewState={INITIAL_VIEW_STATE} controller={true} layers={layers}>
      <StaticMap mapStyle={BASEMAP.POSITRON} />
    </DeckGL>
  )
}
