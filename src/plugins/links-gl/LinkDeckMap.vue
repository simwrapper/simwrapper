<template lang="pug">
.map(:id="mapID")
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { LineLayer } from '@deck.gl/layers'
import { scaleLinear, ScaleThreshold, scaleThreshold } from 'd3-scale'
import colormap from 'colormap'

import globalStore from '@/store'
import LayerManager from '@/util/LayerManager'

enum COLUMNS {
  offset = 0,
  coordFrom = 1,
  coordTo = 2,
}

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private props!: {
    geojson: any[]
    colors: string
    dark: boolean
    scaleWidth: number
    build: { header: any; headerMax: any; activeColumn: any }
    buildData: Float32Array
    baseData: Float32Array
    showDiffs: boolean
  }

  private layerManager!: LayerManager

  private mapID = `map-${Math.floor(100000000000 * Math.random())}`

  private colorPaleGrey = this.props.dark ? [80, 80, 80, 80] : [212, 212, 212, 80]
  private colorInvisible = [0, 0, 0, 0]
  private color0: any
  private color1: any

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

  private calculateColorRamp(): ScaleThreshold<number, number> {
    const builtColors = colormap({
      colormap: this.props.colors,
      nshades: 20,
      format: 'rba',
    }).map((a: number[]) => [a[0], a[1], a[2], 255])

    const fetchColor = scaleThreshold()
      .domain(new Array(20).fill(0).map((v, i) => 0.05 * i))
      .range(builtColors)
      .range(this.props.dark ? builtColors : builtColors.reverse())

    // // this assumes that zero means hide the link. This may not be generic enough
    this.colorPaleGrey = this.props.dark ? [80, 80, 80, 40] : [212, 212, 212, 40]
    this.colorInvisible = [0, 0, 0, 0]
    this.color0 = fetchColor(0)
    this.color1 = fetchColor(1)

    return fetchColor
  }

  // --- LINE COLORS -----------------------------------------------
  private getLineColor = (feature: any, colorRamp: any) => {
    const value = this.props.buildData[feature[COLUMNS.offset]]

    if (!value) return this.colorPaleGrey // this.colorInvisible

    // comparison?
    if (this.props.showDiffs) {
      const baseValue = this.props.baseData[feature[COLUMNS.offset]]
      const diff = value - baseValue

      if (diff === 0) return 0 // fetchColor(0.5)
      return baseValue < value ? this.color1 : this.color0
    } else {
      const scaledValue =
        Math.log(value) / Math.log(this.props.build.headerMax[this.props.build.activeColumn])
      if (scaledValue < 0.0001) return this.colorPaleGrey

      return colorRamp(scaledValue)
    }
  }

  // --- LINE WIDTHS -----------------------------------------------
  // --> 2 pixels if no line width at all
  // --> Scaled up to 50 pixels, scaled vs. maxWidth
  private getLineWidth = (feature: any) => {
    const value = this.props.buildData[feature[COLUMNS.offset]]

    // comparison?
    if (this.props.showDiffs) {
      const baseValue = this.props.baseData[feature[COLUMNS.offset]]
      const diff = Math.abs(value - baseValue)
      return diff / this.props.scaleWidth
    } else {
      return value / this.props.scaleWidth
    }
  }

  private updateLayers() {
    console.log('add layers')
    console.log({ props: this.props })
    const colorRamp = this.calculateColorRamp()

    this.layerManager.removeLayer('link-bandwidths')
    this.layerManager.addLayer(
      new LineLayer({
        id: 'link-bandwidths',
        data: this.props.geojson,
        widthUnits: 'pixels',
        widthMinPixels: 0,
        widthMaxPixels: 200,
        pickable: false,
        autoHighlight: false,
        opacity: 1.0,
        parameters: {
          depthTest: false,
        },

        getSourcePosition: (link: any[]) => link[COLUMNS.coordFrom],
        getTargetPosition: (link: any[]) => link[COLUMNS.coordTo],

        getColor: (d: any) => this.getLineColor(d, colorRamp),
        getWidth: this.getLineWidth,
        // onHover: setHoverInfo,

        // updateTriggers: {
        //   getColor: {
        //     data: this.buildData,
        //     showDiffs: this.showDiffs,
        //     dark: this.dark,
        //     colors: this.colors,
        //     activeColumn: this.build.activeColumn,
        //   },
        //   getWidth: {
        //     showDiffs: this.showDiffs,
        //     scaleWidth: this.scaleWidth,
        //     activeColumn: this.build.activeColumn,
        //   },
        // },

        transitions: {
          getColor: 350,
          getWidth: 350,
        },
      })
    )
  }

  private renderTooltip({ hoverInfo }: any) {
    return { html: '<p>tooltip</p>', style: '' }
  }
}
</script>
<style scoped style="scss">
.map {
  background-color: var(--bgCream);
}
</style>
