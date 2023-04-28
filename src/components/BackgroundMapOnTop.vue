<template lang="pug">
.mymaplibre-map(:id="containerId")
  .mymap(:id="mapId")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import maplibregl, { MapMouseEvent, PositionOptions } from 'maplibre-gl'

import globalStore from '@/store'
import { ColorScheme } from '@/Globals'

const Component = defineComponent({
  name: 'BackgroundMapOnTop',
  components: {},
  data: () => {
    return {
      containerId: `c${Math.floor(1e12 * Math.random())}`,
      globalState: globalStore.state,
      isDarkMode: false,
      isMapMoving: false,
      mapId: `map-${Math.floor(1e12 * Math.random())}`,
      mymap: {} as maplibregl.Map,
      resizer: null as ResizeObserver | null,
    }
  },
  computed: {},
  methods: {
    setupResizer() {
      this.resizer = new ResizeObserver(() => {
        this.mymap.resize()
      })

      const viz = document.getElementById(this.containerId) as HTMLElement
      this.resizer.observe(viz)
    },
    handleMapMotion() {
      const mapCamera = {
        longitude: this.mymap.getCenter().lng,
        latitude: this.mymap.getCenter().lat,
        bearing: this.mymap.getBearing(),
        zoom: this.mymap.getZoom(),
        pitch: this.mymap.getPitch(),
      }

      this.$store.commit('setMapCamera', mapCamera)
      if (!this.isMapMoving) this.isMapMoving = true
    },

    async setupMap() {
      const styles = globalStore.state.mapStyles
      try {
        this.mymap = new maplibregl.Map({
          container: this.mapId,
          style: this.isDarkMode ? styles.transparentDark : styles.transparentLight,
          logoPosition: 'top-left',
        })

        // make sure it starts up aligned with main map
        const view = { ...this.globalState.viewState } as any
        this.mymap.jumpTo(view)
      } catch (e) {
        console.error('HUH?' + e)
        return
      }

      // Start doing stuff AFTER the MapLibre library has fully initialized
      this.mymap.on('load', this.mapIsReady)
      this.mymap.on('move', this.handleMapMotion)

      // We are always in thumbnail mode oo-/
      // if (this.thumbnail) {
      if (true) {
        let baubles = document.getElementsByClassName(
          'mapboxgl-ctrl mapboxgl-ctrl-attrib mapboxgl-compact'
        )
        for (const elem of baubles) elem.setAttribute('style', 'display: none')

        baubles = document.getElementsByClassName('mapboxgl-ctrl mapboxgl-ctrl-group')
        for (const elem of baubles) elem.setAttribute('style', 'display: none')

        baubles = document.getElementsByClassName('mapboxgl-ctrl-logo')
        for (const elem of baubles) elem.setAttribute('style', 'display: none')
      } else {
        let baubles = document.getElementsByClassName('mapboxgl-ctrl-logo')
        for (const elem of baubles) elem.setAttribute('style', 'margin-bottom: 3rem;')
      }
    },

    async mapIsReady() {
      this.setupResizer()
    },

    viewMoved(value: any) {
      if (!this.mymap || this.isMapMoving) {
        this.isMapMoving = false
        return
      }

      const { bearing, longitude, latitude, zoom, pitch } = value

      // sometimes closing a view returns a null map, ignore it!
      if (!zoom) return

      this.mymap.off('move', this.handleMapMotion)

      this.mymap.jumpTo({
        bearing,
        zoom,
        center: [longitude, latitude],
        pitch,
      })

      this.mymap.on('move', this.handleMapMotion)
    },
  },
  watch: {
    '$store.state.viewState'(value: any) {
      this.viewMoved(value)
    },

    '$store.state.colorScheme'() {
      this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
      if (!this.mymap) return

      const styles = globalStore.state.mapStyles
      this.mymap.setStyle(this.isDarkMode ? styles.transparentDark : styles.transparentLight)

      this.mymap.on('style.load', () => {})
    },

    '$store.state.resizeEvents'() {
      if (this.mymap) this.mymap.resize()
    },
  },
  async mounted() {
    this.isDarkMode = this.$store.state.colorScheme === ColorScheme.DarkMode
    this.setupMap()
  },
})
export default Component
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.mymaplibre-map {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
}

.mymap {
  height: 100%;
}
</style>
