<template lang="pug">
.pmtiles-viewer.flex-col
  .map-viewer(:id="`map-${layerId}`")
    //- .legend-overlay(v-if="legendItems && legendItems.length" :style="{background: legendBgColor}")
    //-   LegendColors(:items="legendItems" title="Legend")

    //- zoom-buttons(v-if="!thumbnail")
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import maplibregl from 'maplibre-gl'
import { PMTiles, type Header } from 'pmtiles'
import { MapboxOverlay } from '@deck.gl/mapbox'
import { GeoJsonLayer } from '@deck.gl/layers'
import { TileLayer } from '@deck.gl/geo-layers'
import { load } from '@loaders.gl/core'
import { MVTLoader } from '@loaders.gl/mvt'

import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { disable3DBuildings, enable3DBuildings } from '@/js/maplibre/threeDBuildings'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'PMTilesComponent',
  components: {},
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    config: { type: Object as any },
    resize: Object as any,
    yamlConfig: String,
  },

  data() {
    const uid = Math.floor(1e12 * Math.random())
    return {
      globalState: globalStore.state,
      vizConfig: {
        title: '',
        description: '',
        dataset: '',
        layers: {},
        legend: [],
      },
      layerId: uid,
      fileApi: null as HTTPFileSystem | null,
      isDestroyed: false,
      show3dBuildings: false,
      mymap: null as maplibregl.Map | null,
      deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
      pmtiler: null as PMTiles | null,
      header: null as Header | null,
    }
  },

  computed: {
    fileSystem(): FileSystemConfig {
      const project = this.$store.state.svnProjects.find(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (!project) throw new Error(`Project '${this.root}' not found`)
      return project
    },

    layers(): any[] {
      const pmtiler = this.pmtiler
      const header = this.header

      if (!pmtiler || !header) return []

      const layer = new TileLayer({
        id: `pmtiles-${this.layerId}`,
        minZoom: header.minZoom,
        maxZoom: header.maxZoom,
        extent: [header.minLon, header.minLat, header.maxLon, header.maxLat],
        pickable: true,

        getTileData: async ({ index, signal }: any) => {
          const { x, y, z } = index
          const tile = await pmtiler.getZxy(z, x, y, signal)
          if (!tile) return []

          return load(tile.data, MVTLoader, {
            worker: false,
            mvt: {
              coordinates: 'wgs84',
              tileIndex: { x, y, z },
              layerProperty: 'layerName',
            },
          })
        },

        renderSubLayers: (props: any) =>
          new GeoJsonLayer({
            ...props,
            data: props.data,
            lineWidthMinPixels: 1,
            getFillColor: [200, 0, 80, 100],
            getLineColor: [0, 96, 224, 255],
          }),
      })
      return [layer]
    },
  },

  watch: {
    resize() {
      this.mymap?.resize()
    },
    layers() {
      this.deckOverlay?.setProps({ layers: this.layers })
    },
  },

  async mounted() {
    try {
      this.isDestroyed = false
      this.fileApi = new HTTPFileSystem(this.fileSystem, globalStore)
      await this.loadConfig()
      if (this.isDestroyed) return

      // MAP

      const style = `${BASE_URL}map-styles/${
        this.globalState.isDarkMode ? 'dark' : 'positron'
      }.json`
      const container = `map-${this.layerId}`
      const view = this.globalState.viewState

      //@ts-ignore
      this.mymap = markRaw(
        new maplibregl.Map({
          container,
          center: [view.longitude, view.latitude],
          style,
          zoom: view.zoom,
          bearing: view.bearing || 0,
          pitch: view.pitch || 0,
        })
      )

      this.mymap.on('move', this.handleMove)

      this.mymap.on('style.load', () => {
        if (this.show3dBuildings && this.mymap) {
          enable3DBuildings(this.mymap)
        }

        this.deckOverlay = markRaw(
          new MapboxOverlay({
            interleaved: true,
            layers: this.layers,
            onClick: this.handleClick,
          })
        )
        this.mymap?.addControl(this.deckOverlay)
      })

      if (this.header && view.startup) this.zoomToArchiveExtent()
    } catch (err) {
      console.error('Error loading PMTiles:', err)
    }
  },

  beforeUnmount() {
    this.isDestroyed = true
    if (this.deckOverlay) this.mymap?.removeControl(this.deckOverlay)
    this.mymap?.remove()
    this.mymap = null
    this.fileApi = null
  },

  methods: {
    handleClick() {
      console.log('click!')
    },

    handleMove() {
      const center = this.mymap?.getCenter() as any
      const view = {
        latitude: center.lat,
        longitude: center.lng,
        zoom: this.mymap?.getZoom(),
        bearing: this.mymap?.getBearing(),
        pitch: this.mymap?.getPitch(),
        jump: true,
      }
      globalStore.commit('setMapCamera', view)
    },

    zoomToArchiveExtent() {
      const h = this.header
      if (!h || !this.mymap) return
      if (h.minLon >= h.maxLon || h.minLat >= h.maxLat) return
      this.mymap.fitBounds(
        [
          [h.minLon, h.minLat],
          [h.maxLon, h.maxLat],
        ],
        { padding: 30, animate: false }
      )
    },

    async loadConfig(): Promise<void> {
      if (this.config) this.vizConfig = { ...this.vizConfig, ...this.config }

      const filename = this.vizConfig.dataset || this.yamlConfig
      if (!filename) throw Error('No pmtiles dataset provided')

      const url = `${this.fileSystem.baseURL}/${this.subfolder}/${filename}`

      // markRaw: the reader keeps an internal tile/directory cache that Vue has no
      // business making reactive, and nothing in the template reads it.
      this.pmtiler = markRaw(new PMTiles(url))
      this.header = await this.pmtiler.getHeader()
    },

    handleTooltip(hoverInfo: any) {
      const props = hoverInfo?.object?.properties
      return props
        ? Object.entries(props)
            .map(([k, v]) => `${k}: ${v}`)
            .join('<br>')
        : ''
    },

    handleFeatureClick(clickInfo: any) {},
  },
})
</script>

<style scoped lang="scss">
.pmtiles-viewer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--bgCardFrame);
  display: flex;
  flex-direction: column;
  z-index: 0;
}

.map-viewer {
  position: relative;
  flex: 1;
  width: 100%;
  height: 100%;
  z-index: 1;
}

.legend-overlay {
  position: absolute;
  top: 1rem;
  left: 1rem;
  z-index: 100;
  border-radius: 6px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
  padding: 0.5rem 1rem;
  min-width: 120px;
  max-width: 240px;
  pointer-events: auto;
}

.loading {
  padding: 2rem;
  text-align: center;
  font-size: 1.2rem;
  color: var(--textFancy);
}
</style>
