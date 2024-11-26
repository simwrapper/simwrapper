<template lang="pug">
.geomap(:id="mapID")
//-   .holder
//- b-button.xbutton(@click="zclicked") CLICKME
//- .thing(v-if="showMap")

  </template>

<script lang="ts">
import { Deck, MapView } from '@deck.gl/core'
// import { MapboxOverlay } from '@deck.gl/mapbox';
import { ScatterplotLayer, LineLayer } from '@deck.gl/layers'
// import { Map, NavigationControl } from 'maplibre-gl'
// import 'maplibre-gl/dist/maplibre-gl.css'
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

  methods: {
    zclicked() {
      console.log('CLICK')
      this.deck.setProps({ layers: [] })
      this.deck.finalize()
      this.deck = null
    },
  },

  beforeDestroy() {
    console.log('###DIESTRY')
    this.deck.setProps({ layers: [] })
    this.deck.finalize()
    this.deck = null
  },

  mounted() {
    const scatterplotLayer = new ScatterplotLayer({
      id: 'bart-stations',
      data: this.bart, // 'https://raw.githubusercontent.com/visgl/deck.gl-data/refs/heads/master/website/bart-stations.json',
      getRadius: (d: any) => Math.sqrt(d.entries) * 50,
      getPosition: (d: any) => d.coordinates,
      getFillColor: [24, 228, 163],
    })

    this.deck = new Deck({
      parent: document.getElementById('mapID'),
      initialViewState: {
        longitude: -122.4, // 14.3,
        latitude: 37.7, // 51.7,
        zoom: 8,
      },
      width: '100vw',
      controller: true,
      layers: [scatterplotLayer],
    })
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
