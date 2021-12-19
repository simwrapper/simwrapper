<template lang="pug">
.map-complications

  map-scale.map-scale

  .zoom-buttons
    .button-single.button-top
      img.img-button(
          :title="$t('in')"
          @click="zoomIn()"
          src="@/assets/images/sw_plus.jpg")
    .button-single
      img.img-button(@click="zoomOut()"
          :title="$t('out')"
          src="@/assets/images/sw_minus.jpg")
    .button-single.button-bottom
      img.img-button(@click="setNorth()"
          :title="$t('center')"
          src="@/assets/images/sw_north_arrow.png"
          :style="{transform: `rotate(${arrowRotation}deg)`}"
    )


</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { in: 'Zoom in', out: 'Zoom out', center: 'Recenter' },
    de: { in: 'Einzoomen', out: 'Auszoomen', center: 'zentrieren' },
  },
}

import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import globalStore from '@/store'
import MapScale from '@/components/MapScale.vue'

@Component({ i18n, components: { MapScale }, props: {} })
export default class VueComponent extends Vue {
  private zoomInFactor = 0.5
  private zoomOutFactor = 0.5
  private maxZoomIn = 20
  private maxZoomOut = 0
  private arrowRotation = 0

  private smooth = [
    0.0125, 0.025, 0.05, 0.1, 0.15, 0.2, 0.3, 0.4, 0.6, 0.7, 0.8, 0.85, 0.9, 0.95, 0.975, 0.9875,
    1.0,
  ]

  private globalState = globalStore.state

  private mounted() {}

  private setNorth() {
    const currentMapDirection = globalStore.state.viewState
    for (let i = 0; i < this.smooth.length; i++) {
      setTimeout(() => {
        const mergedMap = Object.assign({}, currentMapDirection, {
          bearing: currentMapDirection.bearing - this.smooth[i] * currentMapDirection.bearing,
          pitch: currentMapDirection.pitch - this.smooth[i] * currentMapDirection.pitch,
        })
        globalStore.commit('setMapCamera', mergedMap)
      }, 24 * i)
    }
  }

  private zoomIn() {
    let currentZoom = globalStore.state.viewState.zoom
    if (currentZoom + this.zoomInFactor <= this.maxZoomIn) {
      for (let i = 0; i < this.smooth.length; i++) {
        setTimeout(() => {
          const newDirection = { zoom: currentZoom + this.smooth[i] * this.zoomInFactor }
          const currentMapDirection = globalStore.state.viewState
          const mergedMap = Object.assign({}, currentMapDirection, newDirection)
          globalStore.commit('setMapCamera', mergedMap)
        }, 16.67 * i)
      }
    }
  }

  private zoomOut() {
    var currentZoom = globalStore.state.viewState.zoom
    if (currentZoom - this.zoomOutFactor >= this.maxZoomOut) {
      for (let i = 0; i < this.smooth.length; i++) {
        setTimeout(() => {
          const newDirection = { zoom: currentZoom - this.smooth[i] * this.zoomInFactor }
          const currentMapDirection = globalStore.state.viewState
          const mergedMap = Object.assign({}, currentMapDirection, newDirection)
          globalStore.commit('setMapCamera', mergedMap)
        }, 16.67 * i)
      }
    }
  }

  @Watch('globalState.viewState.bearing') updateNorthArrow() {
    this.arrowRotation = -1 * this.globalState.viewState.bearing
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.map-complications {
  position: absolute;
  top: 4px;
  right: 4px;
  display: flex;
  flex-direction: row;
  pointer-events: none;
  cursor: pointer;
}

.zoom-buttons {
  margin-left: auto;
  pointer-events: auto;
}

.button-single:last-child {
  margin-bottom: 0;
}

.button-single {
  width: 24px;
  height: 24px;
  text-align: center;
  border: var(--borderZoomButtons);
  background-color: white;
  overflow: hidden;
}

.img-button {
  height: 22px;
}

.button-top {
  border-bottom-width: 0px;
  border-top-left-radius: 4px;
  border-top-right-radius: 4px;
}

.button-bottom {
  border-top-width: 0px;
  border-bottom-left-radius: 4px;
  border-bottom-right-radius: 4px;
  height: 21px;
}

.map-scale {
  margin: 0.15rem 0.25rem 0 0;
}

@media only screen and (max-width: 640px) {
}
</style>
