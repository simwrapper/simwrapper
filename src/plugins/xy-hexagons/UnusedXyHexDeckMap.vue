<template lang="pug">
.map(:id="mapID")
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { ArcLayer, LineLayer } from '@deck.gl/layers'
import colormap from 'colormap'

// import HexagonLayer from './SelectableHexLayer'
import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { pointToHexbin } from './HexagonAggregator'

import LayerManager from '@/util/LayerManager'

const material = {
  ambient: 0.64,
  diffuse: 0.6,
  shininess: 32,
  specularColor: [51, 51, 51],
}

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private props!: {
    colorRamp: string
    coverage: number
    dark: boolean
    data: any[]
    extrude: boolean
    highlights: any[]
    maxHeight: number
    metric: string
    radius: number
    upperPercentile: number
    selectedHexStats: { rows: number; numHexagons: number; selectedHexagonIds: any[] }
  }
  // draw begins here

  private layerManager!: LayerManager
  private mapID = `map-id-${Math.floor(1e12 * Math.random())}`

  private get viewState() {
    return this.$store.state.viewState
  }

  @Watch('viewState') viewMoved() {
    this.layerManager.deckInstance.setProps({ viewState: this.viewState })
  }

  @Watch('props')
  private handlePropsChanged() {
    if (this.layerManager) this.updateLayers()
  }

  private mounted() {
    console.log(this.mapID)
    this.setupLayerManager()
    this.updateLayers()
  }

  private beforeDestroy() {
    this.layerManager.destroy()
  }

  private setupLayerManager() {
    this.layerManager = new LayerManager()

    this.layerManager.init({
      container: `#${this.mapID}`,
      viewState: this.$store.state.viewState,
      pickingRadius: 3,
      onViewStateChange: ({ viewState }: any) => {
        this.$store.commit('setMapCamera', viewState)
      },
    })
  }

  private getTooltip({ object }: any) {
    if (!object || !object.position || !object.position.length) {
      return null
    }

    const lat = object.position[1]
    const lng = object.position[0]
    const count = object.points.length

    return {
      html: `\
        <b>${this.props.highlights.length ? 'Count' : this.props.metric}: ${count} </b><br/>
        ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
        Number.isFinite(lng) ? lng.toFixed(4) : ''
      }
      `,
    }
  }

  private handleClick(target: any, event: any) {
    // this.onClick(target, event)
  }

  private handleViewState(view: any) {
    this.$store.commit('setMapCamera', view)
  }

  private updateLayers() {
    const colors = colormap({
      colormap: this.props.colorRamp,
      nshades: 10,
      format: 'rba',
      alpha: 1,
    }).map((c: number[]) => [c[0], c[1], c[2]])

    this.layerManager.removeLayer('arc-layer')
    this.layerManager.removeLayer('hex-layer')

    // this.layerManager.addLayer(
    //   new ArcLayer({
    //     id: 'arc-layer',
    //     data: this.props.highlights,
    //     getSourcePosition: (d: any) => d[0],
    //     getTargetPosition: (d: any) => d[1],
    //     pickable: false,
    //     opacity: 0.4,
    //     getHeight: 0,
    //     getWidth: 1,
    //     getSourceColor: this.props.dark ? [144, 96, 128] : [192, 192, 240],
    //     getTargetColor: this.props.dark ? [144, 96, 128] : [192, 192, 240],
    //   })
    // )

    this.layerManager.addLayer(
      new HexagonLayer({
        id: 'hex-layer',
        colorRange: this.props.dark ? colors.slice(1) : colors.reverse().slice(1),
        coverage: this.props.coverage,
        data: this.props.data,
        autoHighlight: true,
        elevationRange: [0, this.props.maxHeight],
        elevationScale: this.props.data && this.props.data.length ? 50 : 0,
        extruded: this.props.extrude,
        selectedHexStats: this.props.selectedHexStats,
        getPosition: (d: any) => d,
        hexagonAggregator: pointToHexbin,
        // center: [viewState.longitude, viewState.latitude],
        pickable: true,
        opacity: 0.75, // dark && highlights.length ? 0.6 : 0.8,
        radius: this.props.radius,
        upperPercentile: this.props.upperPercentile,
        material,
        transitions: {
          elevationScale: { type: 'interpolation', duration: 1000 },
          opacity: { type: 'interpolation', duration: 200 },
        },
      })
    )
  }

  // return (
  //   /*
  //   //@ts-ignore */
  //   <DeckGL
  //     layers={layers}
  //     viewState={viewState}
  //     controller={true}
  //     getTooltip={getTooltip}
  //     onClick={handleClick}
  //     onViewStateChange={(e: any) => handleViewState(e.viewState)}
  //   >
  //     {
  //       /*
  //       // @ts-ignore */
  //       <InteractiveMap
  //         reuseMaps
  //         mapStyle={dark ? MAP_STYLES.dark : MAP_STYLES.light}
  //         preventStyleDiffing={true}
  //         mapboxApiAccessToken={MAPBOX_TOKEN}
  //       />
  //     }
  //   </DeckGL>
  // )
}
</script>
