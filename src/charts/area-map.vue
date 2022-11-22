<template lang="pug">
fancy-polygon-map.deck-map(
  :fsConfig="fileSystemConfig"
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :configFromDashboard="config"
  :thumbnail="false"
  :datamanager="datamanager"
  :yamlConfig="'config'"
  @isLoaded="isLoaded"
)

</template>

<script lang="ts">
import FancyPolygonMap from '@/plugins/shape-file/FancyPolygonMap.vue'

export default {
  name: 'AreaMapPanel',
  components: { FancyPolygonMap },
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
