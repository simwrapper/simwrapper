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
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import { FileSystemConfig } from '@/Globals'
import FancyPolygonMap from '@/plugins/shape-file/FancyPolygonMap.vue'
import DashboardDataManager from '@/js/DashboardDataManager'

@Component({ components: { FancyPolygonMap } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop({ required: false }) datamanager!: DashboardDataManager
  @Prop({ required: false }) yamlConfig!: string

  private isLoaded() {
    this.$emit('isLoaded')
  }
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
