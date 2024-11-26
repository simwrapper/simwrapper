<template lang="pug">
.geomap(:id="mapID")
</template>

<script lang="ts">
import { Deck, MapView } from '@deck.gl/core'
import { BASEMAP } from '@deck.gl/carto'
import { Map, NavigationControl } from 'maplibre-gl'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'

export default {
  name: 'transit-layers',
  props: {
    viewId: Number,
    links: { type: Array, required: true },
    selectedFeatures: { type: Array, required: true },
    stopMarkers: { type: Array, required: true },
    // mapIsIndependent: { type: Boolean, required: true },
    pieSlider: { type: Number, required: true },
    widthSlider: { type: Number, required: true },
  },

  data() {
    return {
      map: null as any,
      deck: null as any,
      deckOverlay: null as any,
      mapID: 'mapID',
    }
  },

  watch: {
    allLayers() {
      this.deck.setProps({ layers: this.allLayers })
    },
  },

  computed: {
    // new line data -- Vue doesn't want internal so we have to do copies
    lineSegments() {
      const linedata = this.links.map((feature: any) => {
        return {
          source: [...feature.geometry.coordinates[0], feature.properties.sort],
          target: [...feature.geometry.coordinates[1], feature.properties.sort],
          color: feature.properties.currentColor,
          width: feature.properties.width,
        }
      })
      return linedata
    },

    allLayers() {
      const layers = []
      if (this.lineSegments.length) {
        layers.push(
          new LineLayer({
            id: 'linkLayer',
            data: this.lineSegments,
            getSourcePosition: (d: any) => d.source,
            getTargetPosition: (d: any) => d.target,
            getColor: (d: any) => d.color,
            getWidth: (d: any) => d.width,
            widthUnits: 'pixels',
            widthScale: this.widthSlider / 50,
            widthMinPixels: 1.5,
            widthMaxPixels: 50,
            pickable: true,
            opacity: 1,
            autoHighlight: false,
            // offsetDirection: OFFSET_DIRECTION.RIGHT,
            parameters: { depthTest: true }, // need this for proper highlighting
            transitions: {
              getColor: 200,
              getWidth: 200,
            },
          })
        )
      }
      return layers
    },
  },

  beforeDestroy() {
    console.log('###DIESTRY')
    this.map.off('move', this.syncMapCamera)
    this.deck.setProps({ layers: [] })
    this.deck.finalize()
    this.map.remove()
  },

  mounted() {
    this.initMap()
  },

  methods: {
    syncMapCamera() {
      if (!this.map || !this.deck) return

      const center = this.map.getCenter()
      this.deck.setProps({
        viewState: {
          longitude: center.lng,
          latitude: center.lat,
          zoom: this.map.getZoom(),
          pitch: this.map.getPitch(),
          bearing: this.map.getBearing(),
        },
      })
    },

    initMap() {
      this.map = new Map({
        container: `${this.mapID}`,
        style: BASEMAP.POSITRON_NOLABELS, // DARK_MATTER_NOLABELS,
        interactive: true,
        center: [13.45, 52.5],
        zoom: 9,
      })

      // keep map in sync
      this.map.on('move', this.syncMapCamera)
      this.deck = new DeckOverlay({})
      this.map.addControl(this.deck)
    },
  },
}
</script>

<style scoped lang="scss">
.geomap {
  pointer-events: auto;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 5;
}
</style>
