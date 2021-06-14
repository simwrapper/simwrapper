<template lang="pug">
.map(:id="mapID")
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { ArcLayer } from '@deck.gl/layers'
import colormap from 'colormap'

import SelectableHexagonLayer from './SelectableHexLayer'
import { pointToHexbin } from './HexagonAggregator'

import LayerManager from '@/util/LayerManager'
import { MAP_STYLES } from '@/Globals'

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
    data: { raw: Float32Array; length: number }
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

  @Watch('props.dark') swapTheme() {
    this.layerManager.updateStyle()
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
      mapStyle: this.props.dark ? MAP_STYLES.dark : MAP_STYLES.light,
      getTooltip: this.getTooltip,
      onViewStateChange: ({ viewState }: any) => {
        this.$store.commit('setMapCamera', viewState)
      },
    })
  }

  private getTooltip(hoverInfo: any) {
    const { object, x, y } = hoverInfo
    if (!object || !object.position || !object.position.length) {
      return null
    }

    const lat = object.position[1]
    const lng = object.position[0]
    const count = object.points.length

    return {
      html: `\
        <b>${this.props.highlights.length ? 'Count' : this.props.metric}: ${count} </b><br/>
      `,
      //       html: `\
      //   <b>${this.props.highlights.length ? 'Count' : this.props.metric}: ${count} </b><br/>
      //   ${Number.isFinite(lat) ? lat.toFixed(4) : ''} / ${
      //   Number.isFinite(lng) ? lng.toFixed(4) : ''
      // }
      // `,
      style: {
        backgroundColor: this.props.dark ? '#445' : 'white',
        color: this.props.dark ? 'white' : '#222',
        padding: '1rem 1rem',
        position: 'absolute',
        left: x + 4,
        top: y - 80,
        boxShadow: '0px 2px 10px #22222266',
      },
    }
  }

  private handleClick(target: any, event: any) {
    console.log('layerClick')
    this.$emit('hexClick', target, event)
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

    // this.layerManager.removeLayer('arc-layer')
    // this.layerManager.removeLayer('hex-layer')

    this.layerManager.addLayer(
      new ArcLayer({
        id: 'arc-layer',
        data: this.props.highlights,
        getSourcePosition: (d: any) => d[0],
        getTargetPosition: (d: any) => d[1],
        pickable: false,
        opacity: 0.4,
        getHeight: 0,
        getWidth: 1,
        getSourceColor: this.props.dark ? [144, 96, 128] : [192, 192, 240],
        getTargetColor: this.props.dark ? [144, 96, 128] : [192, 192, 240],
      })
    )

    this.layerManager.addLayer(
      new SelectableHexagonLayer({
        id: 'hex-layer',
        data: this.props.data
          ? {
              length: this.props.data ? this.props.data.length : 0,
              attributes: {
                getPosition: { value: this.props.data.raw, size: 2 },
              },
            }
          : undefined,
        colorRange: this.props.dark ? colors.slice(1) : colors.reverse().slice(1),
        coverage: this.props.coverage,
        autoHighlight: true,
        elevationRange: [0, this.props.maxHeight],
        elevationScale: this.props.data && this.props.data.length ? 50 : 0,
        extruded: this.props.extrude,
        selectedHexStats: this.props.selectedHexStats,
        hexagonAggregator: pointToHexbin,
        // center: [viewState.longitude, viewState.latitude],
        pickable: true,
        opacity: 0.7, // dark && highlights.length ? 0.6 : 0.8,
        radius: this.props.radius,
        upperPercentile: this.props.upperPercentile,
        material,
        transitions: {
          elevationScale: { type: 'interpolation', duration: 1000 },
          opacity: { type: 'interpolation', duration: 200 },
        },
        // onClick: this.handleClick,
      }) as any // honestly no idea why typescript is mad at me :-(
    )
  }
}
</script>
