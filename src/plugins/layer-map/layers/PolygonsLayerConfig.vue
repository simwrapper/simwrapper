<template lang="pug">
.layer-config.flex-col
  .panel-title.flex-row(@click="$emit('open')")

    p.center.flex1: b Polygons
    span.closer(title="Remove layer" @click="$emit('update', 'delete')"): i.fas.fa-trash

  .panel-content(v-if="open")

    .coordinates.flex-row(style="gap: 0.25rem")
        column-selector.flex1(v-model="lon" :datasets="datasets" @update="lon=$event")
          p.tight Longitude/X

        column-selector.flex1(v-model="lat" :datasets="datasets" @update="lat=$event")
          p.tight Latitude/Y

    .coordinates.flex-row(style="gap: 0.25rem")
        column-selector.flex1(v-model="radius" :datasets="datasets" @update="radius=$event")
          p.tight Radius

        column-selector.flex1(v-model="color" :datasets="datasets" @update="color=$event")
          p.tight Color

    .coordidnates.flex-row(style="gap: 0.25rem" title="EPSG code for transforming non-lat/long coordinates")
        text-selector.flex1(v-model="projection" :datasets="datasets" @update="projection=$event")
          p.tight() Transform (EPSG)


</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import ColumnSelector from '@/plugins/layer-map/components/ColumnSelector.vue'
import TextSelector from '@/plugins/layer-map/components/TextSelector.vue'

import globalStore from '@/store'
import {
  DataSet,
  DataTable,
  DataTableColumn,
  DataType,
  FileSystemConfig,
  VisualizationPlugin,
  DEFAULT_PROJECTION,
  REACT_VIEW_HANDLES,
  Status,
} from '@/Globals'

export default defineComponent({
  name: 'PointsLayerConfig',
  components: { ColumnSelector, TextSelector },

  props: {
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
    options: { type: Object, required: true },
    open: Boolean,
  },

  data() {
    return {
      lon: '',
      lat: '',
      radius: '',
      color: '',
      projection: '',
      isInitialized: false,
    }
  },

  computed: {},
  watch: {
    color() {
      this.updateConfig()
    },
    lon() {
      this.updateConfig()
    },
    lat() {
      this.updateConfig()
    },
    radius() {
      this.updateConfig()
    },
    projection() {
      this.updateConfig()
    },
  },

  methods: {
    updateConfig() {
      if (!this.isInitialized) return

      console.log('GOT NEW CONFIG')
      const update = JSON.parse(JSON.stringify(this.options))
      update.color = this.color
      update.lon = this.lon
      update.lat = this.lat
      update.radius = this.radius
      update.projection = this.projection

      this.$emit('update', update)
    },
  },

  async mounted() {
    console.log('POINTS options', this.options)

    this.color = this.options.color
    this.lon = this.options.lon
    this.lat = this.options.lat
    this.radius = this.options.radius
    this.projection = this.options.projection

    // don't send update events on first draw
    await this.$nextTick()
    this.isInitialized = true
  },

  beforeDestroy() {},
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.layer-config {
  display: flex;
  flex-direction: column;
}

.layer-config:hover .panel-title .closer {
  color: #aaaaaa88;
}

.closer:hover {
  cursor: pointer;
  color: red !important;
}

.closer {
  color: #00000000;
  margin-right: 0.25rem;
}

.panel-title {
  background-color: $panelTitle;
  color: white;
  padding: 1px 0;
}

.panel-content {
  padding: 0 5px 6px 5px;
}

.tight {
  margin-left: 0.25rem;
  margin-top: 0.75rem;
}
</style>
