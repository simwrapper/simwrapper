<template lang="pug">
.blank-card(
)

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import LayerMap from '@/plugins/layer-map/LayerMap.vue'

export default defineComponent({
  name: 'BlankPanel',
  components: {},
  props: {},
  methods: {},
  mounted() {
    this.$emit('isLoaded')
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.blank-card {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
}
</style>
