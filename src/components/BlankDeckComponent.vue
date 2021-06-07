<template lang="pug">
div(:id="mapID")
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { LineLayer } from '@deck.gl/layers'
import LayerManager from '@/util/LayerManager'

@Component({ components: {} })
export default class VueComponent extends Vue {
  private layerManager!: LayerManager

  private mapID = `map-${Math.floor(10000000000 * Math.random())}`

  @Prop({ required: true })
  private props!: {
    data: any[]
  }

  @Prop({ required: true, default: false })
  private dark!: boolean

  private get viewState() {
    return this.$store.state.viewState
  }

  @Watch('viewState') viewMoved() {
    this.layerManager.deckInstance.setProps({ viewState: this.viewState })
  }

  @Watch('props')
  private handlePropsChanged() {}

  private mounted() {
    console.log(this.mapID)

    this.setupLayerManager()

    this.addLayers()
  }

  private setupLayerManager() {
    this.layerManager = new LayerManager()

    this.layerManager.init({
      container: `#${this.mapID}`,
      viewState: this.$store.state.viewState,
      onViewStateChange: ({ viewState }: any) => {
        this.$store.commit('setMapCamera', viewState)
      },
    })
  }

  private addLayers() {
    // TODO: this should be improved: layer doesn't update if we don't remove it first :-/
    this.layerManager.removeLayer('my-layer')
    this.layerManager.addLayer(
      new LineLayer({
        id: 'my-layer',
        data: this.props.data,
        widthUnits: 'pixels',
        pickable: true,
        autoHighlight: true,
        parameters: { depthTest: false },

        getSourcePosition: (link: any) => link.from,
        getTargetPosition: (link: any) => link.to,

        getColor: [0, 64, 255],
        getWidth: 4,
      })
    )
  }

  private renderTooltip({ hoverInfo }: any) {
    return { html: '<p>tooltip</p>', style: '' }
  }
}
</script>
