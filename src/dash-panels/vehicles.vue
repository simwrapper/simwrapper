<template lang="pug">
vehicle-animation.deck-map(
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
import VehicleAnimation from '@/plugins/vehicle-animation/VehicleAnimation.vue'

export default {
  name: 'VehiclesPanel',
  components: { VehicleAnimation },
  props: {
    config: Object,
    datamanager: Object,
    fileSystemConfig: Object,
    subfolder: String,
    yamlConfig: String,
  },

  mounted() {
    this.$emit('isLoaded')
  },

  methods: {
    isLoaded() {
      this.$emit('isLoaded')
    },
  },
}
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
