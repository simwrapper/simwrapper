<template lang="pug">
  #mymap  
  input.my-slider(type="range" min="1" max="3" v-model="sliderValue" @input="updateSlider" class="form-range")
</template>

<script setup lang="ts">
import { SolidPolygonLayer } from '@deck.gl/layers';
import { MapboxOverlay as DeckOverlay } from '@deck.gl/mapbox';
import mapboxgl from 'mapbox-gl'
import { onMounted, ref, watch } from 'vue';

var polygons: any = [];
let map: mapboxgl.Map | null = null;
let deckOverlay: DeckOverlay;
let layers: any[] = [];

function createPolygon(factor: number) {
  const shape = {
    path: [
      [13.344897737114668, 52.509281513572965],
      [13.384897737114668 - factor, 52.547337040269156 + factor],
      [13.304662748475898 + factor, 52.54682373380698 + factor]
    ]
  };
  polygons.push(shape);
}

function updateLayers() {
  console.log(polygons)
  layers = [
    new SolidPolygonLayer({
      id: 'SolidPolygonLayer',
      data: polygons,
      getPolygon: (d: any) => d.path,
      getLineColor: [80, 80, 80],
      getFillColor: [0, 128, 255],
      pickable: true
    })
  ];
  deckOverlay.setProps({ layers: [] });
  deckOverlay.setProps({ layers });
  
}

const sliderValue = ref(3);

watch(sliderValue, (newSliderValue) => {
  polygons = []
  createPolygon(newSliderValue / 10);
  console.log(polygons)
  updateLayers();
});

mapboxgl.accessToken = 'pk.eyJ1IjoidnNwLXR1LWJlcmxpbiIsImEiOiJjamNpemh1bmEzNmF0MndudHI5aGFmeXpoIn0.u9f04rjFo7ZbWiSceTTXyA';

onMounted(() => {
  map = new mapboxgl.Map({
    container: 'mymap',
    style: 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
    zoom: 9,
    bearing: 0,
    center: [13.5, 52.5],
    pitch: 0,
  });
  map.addControl(new mapboxgl.NavigationControl());

  deckOverlay = new DeckOverlay({ interleaved: true, layers });
  map.addControl(deckOverlay);

  createPolygon(sliderValue.value / 10);
  updateLayers();
});
</script>

<style scoped>
#mymap {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  width: 100%;
}

.my-slider {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 20rem;
  margin: 2rem;
  padding: 1rem;
  background-color: #1583a4;
}
</style>
