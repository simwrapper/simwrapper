<template lang="pug">
flow-map.deck-map(
    :root="fileSystemConfig.slug"
    :subfolder="subfolder"
    :configFromDashboard="config"
    :thumbnail="false"
    :fsConfig="fileSystemConfig"
    :datamanager="datamanager"
    :yamlConfig="'noconfig'"
    @isLoaded="isLoaded"
    @error="$emit('error', $event)"
)
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { FileSystemConfig } from '@/Globals'
import DashboardDataManager from '@/js/DashboardDataManager'
import FlowMap from '@/plugins/flowmap/Flowmap.vue'

export default defineComponent({
  name: 'FlowmapPanel',
  components: { FlowMap },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object, required: true },
    datamanager: Object as PropType<DashboardDataManager>,
    // yamlConfig: String,
  },
  mounted() {
    this.$emit('isLoaded')
  },
  methods: {
    isLoaded() {
      this.$emit('isLoaded')
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.deck-map {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
}

@media only screen and (max-width: 640px) {
}
</style>
