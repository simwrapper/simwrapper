<template lang="pug">
//- NOT .deck-map: DeckMapComponent.vue declares that class in a *global* style block,
//- and the panel wrapper's copy lands on the plugin's root element
matrix-viewer.matrix-panel(
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

import MatrixViewer from '@/plugins/matrix/MatrixViewer.vue'

export default defineComponent({
  name: 'MatrixPanel',
  components: { MatrixViewer },
  emits: ['isLoaded', 'error', 'dimension-resizer'],
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
.matrix-panel {
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
