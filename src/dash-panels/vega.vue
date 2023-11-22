<template lang="pug">
vega-lite.dash-element(
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :config="config.config"
  :cardId="cardId"
  :thumbnail="false"
  @dimension-resizer="$emit('dimension-resizer', $event)"
  @error="$emit('error', $event)"
)

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { FileSystemConfig } from '@/Globals'
import VegaLite from '@/plugins/vega-lite/VegaLite.vue'

export default defineComponent({
  name: 'VegaLitePanel',
  components: { VegaLite },
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object, required: true },
    cardId: { type: String, required: true },
  },
  mounted() {
    this.$emit('isLoaded')
  },
  methods: {},
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dash-element {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bgCardFrame);
}

@media only screen and (max-width: 640px) {
}
</style>
