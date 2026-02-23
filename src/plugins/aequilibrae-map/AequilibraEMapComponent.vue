<template lang="pug">
.c-aequilibrae-viewer.flex-col(:class="{'is-thumbnail': thumbnail}")
  .map-viewer
    SqliteMapComponent(
      v-if="fileApi"
      ref="sqliteReader"
      :config="vizConfig"
      :subfolder="subfolder"
      :fileApi="fileApi"
      @isLoaded="$emit('isLoaded')"
      v-slot="{ geoJsonFeatures, fillColors, lineColors, lineWidths, pointRadii, fillHeights, featureFilter, isRGBA, redrawCounter, legendItems: slotLegendItems, initialView }"
    )
      DeckMapComponent(
        ref="deckMap"
        v-if="geoJsonFeatures.length && bgLayers && layerId"
        :features="geoJsonFeatures"
        :bgLayers="bgLayers"
        :cbTooltip="handleTooltip"
        :cbClickEvent="handleFeatureClick"
        :dark="globalState.isDarkMode"
        :featureFilter="featureFilter"
        :fillColors="fillColors"
        :fillHeights="fillHeights"
        :highlightedLinkIndex="-1"
        :initialView="initialView"
        :isRGBA="isRGBA"
        :isAtlantis="false"
        :lineColors="lineColors"
        :lineWidths="lineWidths"
        :mapIsIndependent="false"
        :opacity="1"
        :pointRadii="pointRadii"
        :redraw="redrawCounter"
        :screenshot="0"
        :viewId="layerId"
        :lineWidthUnits="'meters'"
        :pointRadiusUnits="'meters'"
      )
      div(v-show="false" :data-legend="syncLegend(slotLegendItems)")

      zoom-buttons(v-if="!thumbnail")

  .legend-overlay(v-if="currentLegendItems && currentLegendItems.length" :style="{background: legendBgColor, left: '1rem', right: 'unset'}")
    LegendColors(:items="currentLegendItems" title="Legend")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import SqliteMapComponent from '@/plugins/sqlite-map/SqliteMapComponent.vue'
import { parseYamlConfig } from './parseYaml'
import { resolvePath } from '../sqlite-map/utils'
import DeckMapComponent from '@/plugins/shape-file/DeckMapComponent.vue'
import LegendColors from '@/components/LegendColors.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import BackgroundLayers from '@/js/BackgroundLayers'
import type { VizDetails } from '../sqlite-map/types'

export default defineComponent({
  name: 'AequilibraEMapComponent',
  components: { DeckMapComponent, LegendColors, SqliteMapComponent, ZoomButtons },
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    config: { type: Object as any },
    resize: Object as any,
    thumbnail: Boolean,
    yamlConfig: String,
  },
  data() {
    const uid = Math.floor(1e12 * Math.random())
    return {
      globalState: globalStore.state,
      vizConfig: {
        title: '',
        description: '',
        database: '',
        layers: {},
        legend: [],
      } as VizDetails,
      layerId: uid,
      fileApi: null as HTTPFileSystem | null,
      bgLayers: null as BackgroundLayers | null,
      currentLegendItems: [] as Array<{ label: string; color: string; value: any }>,
      isDestroyed: false,
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
    legendBgColor(): string {
      return this.globalState.isDarkMode ? 'rgba(32,32,32,0.95)' : 'rgba(255,255,255,0.95)' // TODO: move this logic to the legend
    },
  },

  watch: {
    resize() {
      this.$forceUpdate()
    },
  },

  async mounted() {
    try {
      this.isDestroyed = false
      this.fileApi = new HTTPFileSystem(this.fileSystem, globalStore)
      if (this.thumbnail) {
        this.$emit('isLoaded')
        return
      }
      await this.loadConfig()
      if (this.isDestroyed) return

      this.bgLayers = new BackgroundLayers({
        vizDetails: this.vizConfig,
        fileApi: this.fileApi,
        subfolder: this.subfolder,
      })
      await this.bgLayers.initialLoad()
      if (this.isDestroyed) return
    } catch (err) {
      console.error('Error loading AequilibraE reader:', err)
    }
  },

  beforeDestroy() {
    this.isDestroyed = true
    this.currentLegendItems = []
    this.bgLayers = null
    this.fileApi = null
  },

  methods: {
    syncLegend(items: any[]) {
      if (items && items.length) {
        this.currentLegendItems = items
      }
      return items
    },

    async loadConfig(): Promise<void> {
      if (this.config) {
        this.vizConfig = { ...this.config }
        this.vizConfig.database = resolvePath(this.config.database || this.config.file, this.subfolder)
        if (this.config.extraDatabases) {
          this.vizConfig.extraDatabases = Object.fromEntries(
            Object.entries(this.config.extraDatabases).map(([name, path]) => [
              name,
              resolvePath(path as string, this.subfolder),
            ])
          )
        }
      } else if (this.yamlConfig) {
        const yamlBlob = await this.fileApi!.getFileBlob(resolvePath(this.yamlConfig, this.subfolder))
        this.vizConfig = await parseYamlConfig(await yamlBlob.text(), this.subfolder)
      } else {
        throw new Error('No config or yamlConfig provided')
      }
    },

    handleTooltip(hoverInfo: any) {
      const props = hoverInfo?.object?.properties
      return props
        ? Object.entries(props)
            .map(([k, v]) => `${k}: ${v}`)
            .join('<br>')
        : ''
    },

    handleFeatureClick(clickInfo: any) {
      
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
@import '../sqlite-map/reader.scss';

.c-aequilibrae-viewer {
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
  right: 1rem;
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
