<template lang="pug">
.map-scale(v-show="showScale")

  .meters(:style="{width: `${metric.pixels}px`}")
    p {{metric.length}}&nbsp;{{metric.label}}

  .feet(:style="{width: `${miles.pixels}px`}")
    p {{miles.length}}&nbsp;{{miles.label}}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import globalStore from '@/store'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  private globalState = globalStore.state

  private showScale = false

  private mounted() {
    this.zoomChanged()
  }

  @Watch('globalState.viewState.zoom')
  @Watch('globalState.viewState.pitch')
  @Watch('globalState.viewState.latitude')
  private zoomChanged() {
    // hide scale if map is pitched forward
    if (this.globalState.viewState.pitch > 15 || this.globalState.viewState.zoom < 5) {
      this.showScale = false
      return
    }

    this.showScale = true

    // generate scale based on latitude and zoom
    // https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames#Resolution_and_Scale
    const metersPerPixelAtEquator = 156543.03
    const latitude = (Math.PI / 180.0) * this.globalState.viewState.latitude
    const zoomLevel = this.globalState.viewState.zoom
    const metersPerPixel = (metersPerPixelAtEquator * Math.cos(latitude)) / 2.0 ** zoomLevel

    const pixelsForOneKM = (window.devicePixelRatio * 1000) / metersPerPixel
    this.calculateBestMeasurements(pixelsForOneKM)
  }

  private breakpointsMetric = [
    { pixels: 10000, factor: 0.01, length: 10, label: 'm' },
    { pixels: 5000, factor: 0.02, length: 20, label: 'm' },
    { pixels: 2000, factor: 0.05, length: 50, label: 'm' },
    { pixels: 1000, factor: 0.1, length: 100, label: 'm' },
    { pixels: 500, factor: 0.2, length: 200, label: 'm' },
    { pixels: 250, factor: 0.5, length: 500, label: 'm' },
    { pixels: 100, factor: 1, length: 1, label: 'km' },
    { pixels: 50, factor: 2, length: 2, label: 'km' },
    { pixels: 20, factor: 5, length: 5, label: 'km' },
    { pixels: 8, factor: 10, length: 10, label: 'km' },
    { pixels: 4, factor: 20, length: 20, label: 'km' },
    { pixels: 2, factor: 50, length: 50, label: 'km' },
    { pixels: 1, factor: 100, length: 100, label: 'km' },
  ]

  private breakpointsMiles = [
    { pixels: 20000, factor: 0.003787878, length: 20, label: 'ft' },
    { pixels: 10000, factor: 0.00946969696, length: 50, label: 'ft' },
    { pixels: 5000, factor: 0.0189393939, length: 100, label: 'ft' },
    { pixels: 2500, factor: 0.04734848, length: 250, label: 'ft' },
    { pixels: 1000, factor: 0.09469696, length: 500, label: 'ft' },
    { pixels: 500, factor: 0.18939393, length: 1000, label: 'ft' },
    { pixels: 300, factor: 0.25, length: 0.25, label: 'mi' },
    { pixels: 180, factor: 0.5, length: 0.5, label: 'mi' },
    { pixels: 80, factor: 1, length: 1, label: 'mi' },
    { pixels: 40, factor: 2, length: 2, label: 'mi' },
    { pixels: 20, factor: 5, length: 5, label: 'mi' },
    { pixels: 8, factor: 10, length: 10, label: 'mi' },
    { pixels: 4, factor: 25, length: 25, label: 'mi' },
    { pixels: 1.5, factor: 50, length: 50, label: 'mi' },
  ]

  private metric = { pixels: 100, length: 1000, label: 'm' }
  private miles = { pixels: 100, length: 1000, label: 'mi' }

  private calculateBestMeasurements(pixelsForOneKM: number) {
    // Metric: use either km or meters
    let scaleMetric = { pixels: pixelsForOneKM / 200, length: 5, label: 'm' }

    for (let i = 0; i < this.breakpointsMetric.length; i++) {
      const breakpoint = this.breakpointsMetric[i]
      if (pixelsForOneKM > breakpoint.pixels) break
      scaleMetric = {
        pixels: pixelsForOneKM * breakpoint.factor,
        length: breakpoint.length,
        label: breakpoint.label,
      }
    }

    // U.S.: use either feet or miles
    const pixelsForOneMile = pixelsForOneKM * 1.609344
    let scaleMiles = { pixels: (10 * pixelsForOneMile) / 5280, length: 10, label: 'ft' }

    for (let i = 0; i < this.breakpointsMiles.length; i++) {
      const breakpoint = this.breakpointsMiles[i]
      if (pixelsForOneMile > breakpoint.pixels) break
      scaleMiles = {
        pixels: pixelsForOneMile * breakpoint.factor,
        length: breakpoint.length,
        label: breakpoint.label,
      }
    }

    this.metric = scaleMetric
    this.miles = scaleMiles
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.map-scale {
  display: flex;
  flex-direction: column;
  overflow-x: hidden;
  pointer-events: none;
  margin: 0.15rem 0.5rem 0 0;
}

p {
  margin: 0px 0px;
  padding: 1px 4px;
  font-size: 0.8rem;
  color: var(--textBold);
  opacity: 0.7;
  text-align: right;
}

.meters {
  margin-left: auto;
  background-color: var(--scaleBg);
  border-left: var(--scaleBorder);
  border-right: var(--scaleBorder);
  border-bottom: var(--scaleBorder);
}

.feet {
  margin-left: auto;
  margin-top: -1px;
  background-color: var(--scaleBg);
  border-left: var(--scaleBorder);
  border-right: var(--scaleBorder);
  border-top: var(--scaleBorder);
}

@media only screen and (max-width: 640px) {
}
</style>
