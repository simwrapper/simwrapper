<template lang="pug">
.sqlite-reader
  .loading(v-if="loading") {{ loadingText }}
  slot(
    v-if="!loading"
    :geoJsonFeatures="geoJsonFeatures"
    :legendItems="legendItems"
    :fillColors="fillColors"
    :lineColors="lineColors"
    :lineWidths="lineWidths"
    :pointRadii="pointRadii"
    :fillHeights="fillHeights"
    :featureFilter="featureFilter"
    :isRGBA="isRGBA"
    :redrawCounter="redrawCounter"
    :initialView="initialView"
  )
</template>

<script lang="ts">
import { defineComponent, markRaw } from 'vue'
import globalStore from '@/store'
import { initSql, releaseSql, acquireLoadingSlot } from './loader'
import {
  applyStylesToVm,
  loadDbWithCache,
  releaseMainDbFromVm,
  createLazyDbLoader,
} from './helpers'
import { openDb, getTableNames, getTableSchema, getRowCount } from './db'
import { hasGeometryColumn } from './utils'
import { buildTables, buildGeoFeatures } from './feature-builder'
import type { GeoFeature, VizDetails } from './types'

export default defineComponent({
  name: 'SqliteMapComponent',
  props: {
    // configuration object with database path, layers, and styling
    config: { type: Object as any, required: true },
    // subfolder path for resolving relative paths
    subfolder: { type: String, required: true },
    // file system API with getFileBlob method
    fileApi: { type: Object, required: true },
  },
  data() {
    return {
      loading: false,
      loadingText: '',
      db: null as any,
      geoJsonFeatures: [] as GeoFeature[],
      legendItems: [] as Array<{ label: string; color: string; value: any }>,
      hasGeometry: false,
      tables: [] as Array<{ name: string; type: string; rowCount: number; columns: any[] }>,
      fillColors: new Uint8ClampedArray(),
      lineColors: new Uint8ClampedArray(),
      lineWidths: new Float32Array(),
      pointRadii: new Float32Array(),
      fillHeights: new Float32Array(),
      featureFilter: new Float32Array(),
      isRGBA: false,
      redrawCounter: 0,
      releaseSlot: null as (() => void) | null,
      spl: null as any,
      initialView: null as any,
    }
  },

  methods: {
    async loadDatabase(): Promise<void> {
      try {
        this.loadingText = 'Loading SQL engine...'
        this.spl = await initSql()

        this.loadingText = 'Loading database...'
        const dbPath = this.config.database

        if (!dbPath) {
          throw new Error('No database path specified in configuration')
        }

        // Use helper that handles file loading
        this.db = await loadDbWithCache(this.spl, this.fileApi, openDb, dbPath)

        this.loadingText = 'Reading tables...'
        const layerConfigs = this.config.layers || {}
        const { tables, hasGeometry } = await buildTables(this.db, layerConfigs)
        this.tables = tables
        this.hasGeometry = hasGeometry
      } catch (error) {
        throw new Error(
          `Failed to load database: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    },

    computeInitialViewFromConfig(config: any) {
      if (!config) return null
      const center = config.center
      const zoom = config.zoom ?? 9
      const bearing = config.bearing ?? 0
      const pitch = config.pitch ?? 0
      if (!center) return null

      let lon: number | undefined
      let lat: number | undefined

      if (Array.isArray(center) && center.length >= 2) {
        lon = Number(center[0])
        lat = Number(center[1])
      } else if (typeof center === 'string') {
        const parts = center.split(',').map((s: string) => s.trim())
        if (parts.length >= 2) {
          lon = parseFloat(parts[0])
          lat = parseFloat(parts[1])
        }
      } else if (
        typeof center === 'object' &&
        center.lon !== undefined &&
        center.lat !== undefined
      ) {
        lon = Number((center as any).lon)
        lat = Number((center as any).lat)
      }

      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return null

      return {
        longitude: lon,
        latitude: lat,
        zoom,
        bearing,
        pitch,
      }
    },

    async extractGeometries(): Promise<void> {
      if (!this.hasGeometry) {
        return
      }

      try {
        this.loadingText = 'Extracting geometries...'

        const memoryOptions = {
          limit: this.config.geometryLimit ?? 100000,
          minimalProperties: this.config.minimalProperties !== false,
        }

        // Create a lazy loader for extra databases
        const extraDbPaths = this.config.extraDatabases || {}
        const lazyDbLoader = createLazyDbLoader(
          this.spl,
          this.fileApi,
          openDb,
          extraDbPaths,
          (msg: string) => (this.loadingText = msg)
        )

        const layerConfigs = this.config.layers || {}
        const features = await buildGeoFeatures(
          this.db,
          this.tables,
          layerConfigs,
          lazyDbLoader,
          memoryOptions
        )
        this.geoJsonFeatures = markRaw(features)

        // Release main database after feature extraction
        releaseMainDbFromVm(this)

        // Give GC a chance to run before building styles
        await new Promise(resolve => setTimeout(resolve, 10))

        applyStylesToVm(this, features, this.config as VizDetails, layerConfigs)
      } catch (error) {
        throw new Error(
          `Failed to extract geometries: ${error instanceof Error ? error.message : String(error)}`
        )
      }
    },

    buildLegend(): void {
      const legend = this.config.legend

      if (Array.isArray(legend)) {
        this.legendItems = legend.map(entry => {
          if (entry.subtitle) {
            return { type: 'subtitle', label: entry.subtitle }
          }

          return {
            type: entry.shape || 'line',
            label: entry.label || '',
            color: this.convertColorForLegend(entry.color),
            size: entry.size,
            value: entry.label || '',
          }
        })
      } else {
        this.legendItems = []
      }
    },

    convertColorForLegend(color?: string): string | undefined {
      return color
        ?.replace('#', '')
        .match(/.{1,2}/g)
        ?.map(x => parseInt(x, 16))
        .join(',')
    },

    cleanupMemory(): void {
      releaseMainDbFromVm(this)
      releaseSql()
      this.spl = null
      this.geoJsonFeatures = []
      this.tables = []
      this.fillColors = new Uint8ClampedArray()
      this.lineColors = new Uint8ClampedArray()
      this.lineWidths = new Float32Array()
      this.pointRadii = new Float32Array()
      this.fillHeights = new Float32Array()
      this.featureFilter = new Float32Array()
    },
  },

  async mounted() {
    try {
      if (this.config.thumbnail) {
        this.$emit('isLoaded')
        return
      }

      this.loading = true
      this.loadingText = 'Waiting for other maps to load...'
      this.releaseSlot = await acquireLoadingSlot()
      await this.loadDatabase()
      await this.extractGeometries()
      if (this.releaseSlot) {
        this.releaseSlot()
        this.releaseSlot = null
      }
      this.buildLegend()

      // compute and apply initial view from config after geometries are ready so DeckMap
      // initializes with the correct camera when the slot renders.
      const iv = this.computeInitialViewFromConfig(this.config)
      if (iv) {
        this.initialView = iv
        try {
          globalStore.commit('setMapCamera', iv)
        } catch (e) {
          // ignore if store commit fails
        }
      }
    } catch (error) {
      this.loadingText = `Error: ${error instanceof Error ? error.message : String(error)}`
    } finally {
      this.loading = false
      if (this.releaseSlot) {
        this.releaseSlot()
        this.releaseSlot = null
      }
      this.$emit('isLoaded')
    }
  },

  beforeUnmount() {
    if (this.releaseSlot) {
      this.releaseSlot()
      this.releaseSlot = null
    }
    this.cleanupMemory()
  },
})
</script>

<style scoped>
.sqlite-reader {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.loading {
  text-align: center;
  font-size: 1.2rem;
  color: var(--textFancy);
}
</style>
