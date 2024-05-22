<template lang="pug">
.layer-config.flex-col
  .pale
    p.center: b Points

  column-selector(v-model="lon" :datasets="datasets" @update="lon=$event")
    p.tight Longitude

  column-selector(v-model="lat" :datasets="datasets" @update="lat=$event")
    p.tight Latitude

  column-selector(v-model="radius" :datasets="datasets" @update="radius=$event")
    p.tight Radius

  column-selector(v-model="color" :datasets="datasets" @update="color=$event")
    p.tight Color

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import ColumnSelector from '@/plugins/layer-map/components/ColumnSelector.vue'

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
import DashboardDataManager from '@/js/DashboardDataManager'

export default defineComponent({
  name: 'PointsLayerConfig',
  components: { ColumnSelector },

  props: {
    datasets: { type: Object as PropType<{ [id: string]: DataTable }>, required: true },
    options: { type: Object, required: true },
  },

  data() {
    return {
      lon: '',
      lat: '',
      radius: '',
      color: '',
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

      this.$emit('update', update)
    },
  },

  async mounted() {
    console.log('POINTS options', this.options)

    this.color = this.options.color
    this.lon = this.options.lon
    this.lat = this.options.lat
    this.radius = this.options.radius

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

.pale {
  background-color: #88888822;
}

.tight {
  margin-top: 0.5rem;
}
</style>
