<template lang="pug">
layer-map.layer-map-panel(
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :configFromDashboard="config"
  :thumbnail="false"
  :datamanager="datamanager"
  :yamlConfig="'config'"
  @isLoaded="isLoaded"
  @error="$emit('error', $event)"
)

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import LayerMap from '@/plugins/layer-map/LayerMap.vue'

export default defineComponent({
  name: 'LayerMapPanel',
  components: { LayerMap },
  props: {
    config: Object,
    datamanager: Object,
    fileSystemConfig: Object,
    subfolder: String,
    yamlConfig: String,
  },
  methods: {
    isLoaded() {
      this.$emit('isLoaded')
    },
  },
})
</script>

<style scoped lang="scss">

// no display:flex here -- this class lands on the LayerMap root, whose own .layer-map
// rule lays the panel and the map out as an overlapping grid. A flex column instead
// stacked them, and the map got zero height.
.layer-map-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

@media only screen and (max-width: 640px) {
}
</style>
