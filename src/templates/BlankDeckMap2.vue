<template lang="pug">
.map(:id="mapID" @click="handleEmptyClick")
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
// import { ArcLayer } from '@deck.gl/layers'

import LayerManager from '@/js/LayerManager'
import globalStore from '@/store'

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private props!: {
    dark: boolean
    data: any[]
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
      mapStyle: globalStore.getters.mapStyle,
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

    return {
      html: `<p>${object}</p>`,
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

  private handleViewState(view: any) {
    this.$store.commit('setMapCamera', view)
  }

  private updateLayers() {
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
    //     getSourceColor: this.props.dark ? [144, 96, 128, 192] : [192, 192, 240],
    //     getTargetColor: this.props.dark ? [144, 96, 128, 192] : [192, 192, 240],
    //   })
    // )
  }
}
</script>
