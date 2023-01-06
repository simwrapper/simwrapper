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
)
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import { FileSystemConfig } from '@/Globals'
import FlowMap from '@/plugins/flowmap/Flowmap.vue'
import DashboardDataManager from '@/js/DashboardDataManager'

@Component({ components: { FlowMap } })
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
