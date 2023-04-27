<template lang="pug">
plotly-diagram.plotly-panel(
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :config="config"
  :thumbnail="false"
)
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { FileSystemConfig } from '@/Globals'
import PlotlyDiagram from '@/plugins/plotly/PlotlyDiagram.vue'

export default defineComponent({
  name: 'PlotlyDiagramPanel',
  components: { PlotlyDiagram },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    config: { type: Object, required: true },
  },
  mounted() {
    this.$emit('isLoaded')
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.plotly-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
}
</style>
