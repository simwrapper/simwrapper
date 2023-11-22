<template lang="pug">
sankey-diagram.deck-map(
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :config="config"
  :thumbnail="false"
  @error="$emit('error', $event)"
)

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { FileSystemConfig } from '@/Globals'
import SankeyDiagram from '@/plugins/sankey/SankeyDiagram.vue'

export default defineComponent({
  name: 'SankeyDiagramPanel',
  components: { SankeyDiagram },
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

.deck-map {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
}
</style>
