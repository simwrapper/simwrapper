<template lang="pug">
plotly-diagram.plotly-panel(
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :config="config"
  :thumbnail="false"
  :resize="resizeEvent"
  @error="$emit('error', $event)"
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

  data: () => {
    return {
      resizeEvent: {} as any,
    }
  },

  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    config: { type: Object, required: true },
    cardId: String,
  },
  mounted() {
    this.$emit('isLoaded')
    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
  },
  methods: {
    changeDimensions(event: any) {
      this.resizeEvent = event
    },
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
  // background-color: cyan;
}
</style>
