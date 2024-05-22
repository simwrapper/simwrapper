<template lang="pug">
.layer-config.flex-col
  .pale
    p.center: b Points

  p Longitude
  b-input.zinput(v-model="lon")
  p Latitude
  b-input.zinput(v-model="lat")
  p Radius
  b-input.zinput(v-model="radius")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import globalStore from '@/store'
import {
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
  components: {},

  props: {
    options: { type: Object, required: true },
  },

  data() {
    return {
      lon: '',
      lat: '',
      radius: '',
      isInitialized: false,
    }
  },

  computed: {},
  watch: {
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
      update.lon = this.lon
      update.lat = this.lat
      update.radius = this.radius

      this.$emit('update', update)
    },
  },

  async mounted() {
    console.log('POINTS options', this.options)
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
  margin-bottom: 0.5rem;
}

.zinput {
  margin-bottom: 0.5rem;
}
</style>
