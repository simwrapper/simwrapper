<template lang="pug">
.draw-thing
  .map(:id="mapID" v-show="showShapeDrawer")

  .map-actions
    button.button.draw-button.is-tiny(v-if="isDark && showShapeDrawer" title="Draw" @click="toggleShapeDrawer"
      :class="{'is-drawing': showShapeDrawer}" :style="{border: `1px solid rgb(119,119,119)`}"
    )
      img(src="./images/draw-icon-dm.png" width=16)
    button.button.draw-button.is-tiny(v-else-if="isDark && !showShapeDrawer" title="Draw" @click="toggleShapeDrawer"
      :class="{'is-drawing': showShapeDrawer}" :style="{background: `rgb(43,60,78)`, border: `1px solid rgb(119,119,119)`}"
    )
      img(src="./images/draw-icon-dm.png" width=16)
    button.button.draw-button.is-tiny(v-else title="Draw" @click="toggleShapeDrawer"
      :class="{'is-drawing': showShapeDrawer}" :style="{border: '1px solid rgb(224,224,224)'}"
    )
      img(src="./images/draw-icon.png" width=16)

  .control-panel(v-if="showShapeDrawer")
    h3 {{ $t('title')}}
    p {{ hint }}

    .buttons
      button.button.is-small.export-button(@click="exportIt"
        :disabled="!canExport" :style="{'is-outlined': !canExport}"
      ) {{ $t('shapefile') }}

      button.button.is-small.is-outlined(@click="cancel") {{ $t('clear') }}

</template>

<script lang="ts">
// :style="{background: `rgb(43,60,78)`, border: `1px solid rgb(119,119,119)`
const i18n = {
  messages: {
    en: {
      title: 'Draw Shapes',
      hint: 'Click on map to draw shapes.',
      clear: 'Clear',
      shapefile: 'Export',
      'close-shape': 'Add more points to close shape.',
      'more-shapes': 'Export now or start new shape.',
    },
    de: {},
  },
}
import { defineComponent } from 'vue'
import { GeoJsonLayer, ScatterplotLayer } from '@deck.gl/layers'
import proj4 from 'proj4'
import ShapeWriter from 'shp-write'

import LayerManager from '@/js/LayerManager'
import globalStore from '@/store'
import { TranslateResult } from 'vue-i18n'

export default defineComponent({
  name: 'DrawingTool',
  i18n,

  data: () => {
    const points = [] as any

    return {
      canExport: false,
      hint: '' as TranslateResult,
      isDark: globalStore.state.isDarkMode,
      points,
      showShapeDrawer: false,
      layerManager: new LayerManager(),
      mapID: `map-id-${Math.floor(1e12 * Math.random())}`,
      polygons: [
        {
          type: 'Feature',
          geometry: { type: 'Polygon', coordinates: [points] },
          finished: false,
        },
      ],
    }
  },

  mounted() {
    this.hint = this.$t('hint')
    this.setupLayerManager()
    this.updateLayers()
  },

  beforeDestroy() {
    this.layerManager.destroy()
  },

  watch: {
    viewState() {
      this.layerManager.deckInstance.setProps({ viewState: this.viewState })
    },
    'globalStore.state.isDarkMode'() {
      this.isDark = this.$store.state.isDarkMode
      this.layerManager.updateStyle()
    },
  },
  computed: {
    viewState(): any {
      return this.$store.state.viewState
    },
  },
  methods: {
    toggleShapeDrawer() {
      this.clearShapes()
      this.updateLayers()
      this.showShapeDrawer = !this.showShapeDrawer
    },

    clearShapes() {
      this.canExport = false
      this.points = []
      this.polygons = [
        {
          type: 'Feature',
          geometry: {
            type: 'Polygon',
            coordinates: [this.points],
          },
          finished: false,
        },
      ]
    },

    setupLayerManager() {
      this.layerManager.init({
        container: `#${this.mapID}`,
        viewState: this.$store.state.viewState,
        pickingRadius: 3,
        mapStyle: null, // globalStore.state.isDarkMode ? MAP_STYLES.dark : MAP_STYLES.light,
        getCursor: ({ isDragging, isHovering }: any) =>
          isDragging ? 'grabbing' : isHovering ? 'pointer' : 'crosshair',
        onViewStateChange: ({ viewState }: any) => {
          this.$store.commit('setMapCamera', viewState)
        },
        onClick: this.handleMapClick,
      })
    },

    exportIt() {
      // only export closed polygons
      this.polygons = this.polygons.filter(p => p.finished)
      this.points = []
      this.updateLayers()

      const geojson = {
        type: 'FeatureCollection',
        features: this.polygons,
      }

      ShapeWriter.download(geojson, {
        folder: 'shapefile-wgs84',
        types: {
          point: 'points',
          polygon: 'polygons',
          line: 'lines',
        },
      })

      this.startNewPolygon()
    },

    cancel() {
      this.hint = this.$t('hint')
      this.clearShapes()
      this.updateLayers()
      this.showShapeDrawer = false
    },

    handleMapClick(object: any, event: any) {
      if (object.coordinate) {
        if (event.rightButton) {
          this.points.pop()
        } else {
          this.points.push(object.coordinate)
          this.hint = this.$t('close-shape')
        }

        this.updateLayers()
      }
    },

    startNewPolygon() {
      this.points = []
      this.polygons.push({
        type: 'Feature',
        geometry: {
          type: 'Polygon',
          coordinates: [this.points],
        },
        finished: false,
      })
    },

    handlePointClick(object: any) {
      if (object.index === 0) {
        // close this polygon
        this.points.push(this.points[0])
        this.polygons[this.polygons.length - 1].finished = true

        // start new polygon!
        this.startNewPolygon()

        // enable export
        this.canExport = true
        this.hint = this.$t('more-shapes')
        this.updateLayers()
      }
      return true // stop event
    },

    handleViewState(view: any) {
      this.$store.commit('setMapCamera', view)
    },

    updateLayers() {
      // view isn't picking the changes up, let's force it
      const shapes = this.polygons.slice(0)
      const dots = this.points.slice(0)

      this.layerManager.removeLayer('draw-polygon-layer')
      this.layerManager.addLayer(
        new GeoJsonLayer({
          id: 'draw-polygon-layer',
          data: shapes,
          pickable: false,
          stroked: true,
          filled: true,
          extruded: false,
          lineWidthMinPixels: 4,
          getFillColor: [175, 160, 255, 80],
          getLineColor: [255, 0, 200],
          getLineWidth: 10,
          parameters: {
            depthTest: false,
          },
        })
      )

      this.layerManager.removeLayer('scatterplot-layer')
      this.layerManager.addLayer(
        new ScatterplotLayer({
          id: 'scatterplot-layer',
          data: dots,
          getPosition: (d: any) => d,
          pickable: true,
          stroked: true,
          filled: true,
          // autoHighlight: true,
          radiusMinPixels: 6,
          radiusMaxPixels: 6,
          lineWidthMinPixels: 2,
          getFillColor: [255, 0, 200],
          getLineColor: [255, 255, 255],
          opacity: 1.0,
          onClick: this.handlePointClick,
        })
      )
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.draw-thing {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.map {
  pointer-events: all;
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
}

.control-panel {
  background-color: var(--bgPanel);
  pointer-events: all;
  padding: 0.5rem 1rem;
  z-index: 0;
  position: absolute;
  top: 6px;
  right: 31px;
  filter: $filterShadow;
  border-radius: 3px;
}

.drawing-tool {
  grid-column: 1 / 3;
  grid-row: 1 / 4;
}

.draw-button {
  padding: 0px 4px;
  border: var(--borderZoomButtons);
  border-radius: 4px;
  width: 24px;
  height: 24px;
}

.draw-button:hover {
  background-color: #f0f0f0;
}

.draw-button.is-drawing {
  background-color: rgb(255, 0, 200);
  border-color: rgb(255, 0, 200);
}

.draw-button.is-drawing-dark {
  background-color: rgb(37, 185, 104);
  border-color: rgb(37, 185, 104);
}

.map-actions {
  pointer-events: all;
  cursor: pointer;
  position: absolute;
  display: flex;
  flex-direction: column;
  top: 100px;
  right: 7px;
}

.buttons {
  font-size: 0.9rem;
  margin-top: 0.25rem;
  margin-right: 0.5rem;
}

.export-button {
  background-color: rgb(255, 0, 200);
}
</style>
