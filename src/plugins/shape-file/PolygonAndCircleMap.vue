<template lang="pug">
.map(:id="mapID")
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import { GeoJsonLayer } from '@deck.gl/layers'
import { scaleLinear, scaleThreshold, scaleOrdinal } from 'd3-scale'
import { rgb } from 'd3-color'

import LayerManager from '@/js/LayerManager'
import { ScatterplotLayer } from '@deck.gl/layers'

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private props!: {
    data: any[]
    dark: boolean
    colors: string[]
    activeColumn: string
    maxValue: number
    opacity: number
    useCircles: boolean
    expColors: boolean
  }

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
      getTooltip: this.getTooltip,
      onViewStateChange: ({ viewState }: any) => {
        this.$store.commit('setMapCamera', viewState)
      },
    })
  }

  private handleClick() {
    console.log('click!')
  }

  private getTooltip(hoverInfo: any) {
    const { object, x, y } = hoverInfo
    if (!object) return

    if (object.properties.centerX) delete object.properties.centerX
    if (object.properties.centerY) delete object.properties.centerY

    // round fractions
    for (const key of Object.keys(object.properties)) {
      const value = object.properties[key]
      if (!isNaN(value)) {
        object.properties[key] = Math.round(1000 * value) / 1000
      }
    }

    const entries = Object.entries(object.properties)
    if (!entries.length) return null

    // try to figure out how tall it is? So tooltip doesn't go below the screen bottom
    let tooltipHeight = 22 * entries.length
    if (y + tooltipHeight < window.innerHeight) tooltipHeight = 0

    let html = `<div id="shape-tooltip" class="tooltip">`

    if (object.properties.value) {
      html = html + `<div>Value:&nbsp;<b>${object.properties.value}</b></div><br/>`
    }

    for (const [key, value] of entries.filter(entry => entry[0] !== 'value')) {
      html = html + `<div>${key}:&nbsp;<b>${value}</b></div>`
    }

    return {
      html,
      style: {
        position: 'absolute',
        top: y - tooltipHeight,
        left: x + 10,
        backgroundColor: this.props.dark ? '#445' : 'white',
        boxShadow: '0px 2px 10px #22222266',
        color: this.props.dark ? 'white' : '#222',
        fontSize: '0.9rem',
        opacity: 0.85,
        padding: '0.5rem 1rem',
      },
    }
  }

  private updateLayers() {
    // deck.gl colors must be in rgb[] or rgba[] format
    const colorsAsRGB: any = this.props.colors.map(hexcolor => {
      const c = rgb(hexcolor)
      return [c.r, c.g, c.b]
    })

    // Build breakpoints between 0.0 - 1.0 to match the number of color swatches
    // e.g. If there are five colors, then we need 4 breakpoints: 0.2, 0.4, 0.6, 0.8.
    // An exponent reduces visual dominance of very large values at the high end of the scale
    const exponent = 3.0
    const domain = new Array(this.props.colors.length - 1)
      .fill(0)
      .map((v, i) => Math.pow((1 / this.props.colors.length) * (i + 1), exponent))

    // *scaleOrdinal* is the d3 function that maps categorical variables to colors.
    // *scaleThreshold* is the d3 function that maps numerical values from [0.0,1.0) to the color buckets
    // *range* is the list of colors;
    // *domain* is the list of breakpoints in the 0-1.0 continuum; it is auto-created from data for categorical.
    // *colorRampType* is 0 if a categorical color ramp is chosen
    const isCategorical = false // colorRampType === 0 || buildColumn.type == DataType.STRING
    const setColorBasedOnValue: any = isCategorical
      ? scaleOrdinal().range(colorsAsRGB)
      : scaleThreshold().range(colorsAsRGB).domain(domain)

    // this assumes that zero means hide the link. This may not be generic enough
    // const colorPaleGrey = this.props.dark ? [80, 80, 80, 96] : [212, 212, 212]
    // const colorInvisible = [0, 0, 0, 0]

    // const fetchColor = scaleThreshold()
    //   .domain(new Array(20).fill(0).map((v, i) => 0.05 * i))
    //   .range(builtColors)

    this.layerManager.removeLayer('shapefileLayer')
    this.layerManager.removeLayer('scatterplot-layer')
    this.layerManager.addLayer(
      this.props.useCircles
        ? new ScatterplotLayer({
            id: 'scatterplot-layer',
            data: this.props.data,
            pickable: true,
            autoHighlight: true,
            highlightColor: [255, 0, 200],
            opacity: 0.01 * this.props.opacity,
            stroked: true,
            filled: true,
            radiusScale: 2,
            radiusMinPixels: 0,
            radiusMaxPixels: 50,
            radiusUnits: 'pixels',
            lineWidthMinPixels: 1,
            getLineColor: this.props.dark ? [0, 0, 0] : [200, 200, 200],
            getPosition: (d: any) => d.geometry.coordinates,
            getRadius: (d: any) => {
              const v = 15 * Math.sqrt(d.properties.value / this.props.maxValue)
              // const v = Math.sqrt(d.properties.value)
              return isNaN(v) ? 0 : v
            },
            getFillColor: (d: any) => {
              if (this.props.colors.length === 1) return colorsAsRGB[0]
              const v = d.properties[this.props.activeColumn]
              if (isNaN(v)) return this.props.dark ? [100, 100, 100] : [200, 200, 200]
              let ratio = v / this.props.maxValue
              if (this.props.expColors) ratio = Math.sqrt(ratio)
              return setColorBasedOnValue(ratio) as any
            },
            updateTriggers: {
              getFillColor: {
                data: this.props.data,
                dark: this.props.dark,
                colors: this.props.colors,
                activeColumn: this.props.activeColumn,
                maxValue: this.props.maxValue,
              },
            },
            transitions: { getFillColor: 250, getRadius: 250 },
            parameters: { depthTest: false },
          })
        : new GeoJsonLayer({
            id: 'shapefileLayer',
            data: this.props.data,
            filled: true,
            lineWidthUnits: 'pixels',
            lineWidthMinPixels: 1,
            pickable: true,
            stroked: false, // this.props.data.length < 2500, // turn off borders for huge GeoJSON
            opacity: 0.01 * this.props.opacity,
            autoHighlight: true,
            highlightColor: [255, 0, 200],
            getLineWidth: 1,
            getLineColor: this.props.dark ? [96, 96, 96, 96] : [192, 192, 192, 64],
            getFillColor: (d: any) => {
              if (this.props.colors.length === 1) return colorsAsRGB[0]
              const v = d.properties[this.props.activeColumn]
              if (isNaN(v)) return this.props.dark ? [40, 40, 40] : [224, 224, 224, 128]
              let ratio = v / this.props.maxValue
              if (this.props.expColors) ratio = Math.sqrt(ratio)
              return setColorBasedOnValue(ratio) as any
            },
            getTooltip: this.getTooltip,
            updateTriggers: {
              getFillColor: {
                dark: this.props.dark,
                colors: this.props.colors,
                activeColumn: this.props.activeColumn,
                maxValue: this.props.maxValue,
              },
            },
            transitions: { getFillColor: 250 },
            parameters: { depthTest: false },
          })
    )
  }
}
</script>
