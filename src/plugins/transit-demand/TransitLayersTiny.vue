<template lang="pug">
.geomap(:id="mapID")
//-   .holder
//- b-button.xbutton(@click="zclicked") CLICKME
//- .thing(v-if="showMap")

  </template>

<script lang="ts">
import { Deck, MapView } from '@deck.gl/core'
import { BASEMAP } from '@deck.gl/carto'
import { Map, NavigationControl } from 'maplibre-gl'
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox'
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
import 'maplibre-gl/dist/maplibre-gl.css'
// import mapboxgl from 'mapbox-gl';
// import 'mapbox-gl/dist/mapbox-gl.css';

export default {
  name: 'MyDeckGLMap',

  props: {},

  data() {
    return {
      map: null as any,
      deck: null as any,
      deckOverlay: null as any,
      mapID: 'mapID',
      isReady: false,
      showMap: true,
      layers: [] as any[],
      bart: [
        {
          name: 'Lafayette (LAFY)',
          code: 'LF',
          address: '3601 Deer Hill Road, Lafayette CA 94549',
          entries: '3481',
          exits: '3616',
          coordinates: [-122.123801, 37.893394],
        },
        {
          name: '12th St. Oakland City Center (12TH)',
          code: '12',
          address: '1245 Broadway, Oakland CA 94612',
          entries: '13418',
          exits: '13547',
          coordinates: [-122.271604, 37.803664],
        },
        {
          name: '16th St. Mission (16TH)',
          code: '16',
          address: '2000 Mission Street, San Francisco CA 94110',
          entries: '12409',
          exits: '12351',
          coordinates: [-122.419694, 37.765062],
        },
        {
          name: '19th St. Oakland (19TH)',
          code: '19',
          address: '1900 Broadway, Oakland CA 94612',
          entries: '13108',
          exits: '13090',
          coordinates: [-122.269029, 37.80787],
        },
        {
          name: 'West Oakland (WOAK)',
          code: 'OW',
          address: '1451 7th Street, Oakland CA 94607',
          entries: '7312',
          exits: '6838',
          coordinates: [-122.294582, 37.804675],
        },
      ],
    }
  },

  watch: {},

  beforeDestroy() {
    console.log('###DIESTRY')
    this.map.off('move', this.syncMapCamera)
    this.deck.setProps({ layers: [] })
    this.deck.finalize()
    this.map.remove()
    // this.deck = null
    // this.map = null
  },

  mounted() {
    this.initMap()
  },

  methods: {
    zclicked() {
      console.log('CLICK')
      this.deck.setProps({ layers: [] })
      this.deck.finalize()
      this.deck = null
    },

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
      const dots = new ScatterplotLayer({
        id: 'bart-stations',
        data: this.bart, // 'https://raw.githubusercontent.com/visgl/deck.gl-data/refs/heads/master/website/bart-stations.json',
        getRadius: (d: any) => Math.sqrt(d.entries) * 50,
        getPosition: (d: any) => d.coordinates,
        getFillColor: [24, 228, 163],
      })

      this.map = new Map({
        container: `${this.mapID}`,
        style: BASEMAP.POSITRON_NOLABELS, // DARK_MATTER_NOLABELS,
        interactive: true,
        center: [-122.2, 37.7],
        zoom: 9,
      })

      // keep map in sync
      this.map.on('move', this.syncMapCamera)

      this.deck = new DeckOverlay({
        layers: [dots],
      })

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

.holder {
  position: absolute;
  top: 0;
  bottom: 0;
  display: flex;
  flex-direction: column;
}

.thing {
  flex: 1;
  position: relative;
}
.xbutton {
  z-index: 5;
}
</style>
