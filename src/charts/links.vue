<template lang="pug">
link-volumes.deck-map(
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :config="config"
  :thumbnail="false"
  :datamanager="datamanager"
  @isLoaded="isLoaded"
)

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import { FileSystemConfig } from '@/Globals'
import LinkVolumes from '@/plugins/links-gl/LinkVolumes.vue'
import DashboardDataManager from '@/js/DashboardDataManager'

@Component({ components: { LinkVolumes } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop({ required: false }) datamanager!: DashboardDataManager

  private mounted() {
    // console.log(this.fileSystemConfig)
    // console.log('subfolder', this.subfolder)
    // console.log('config', this.config)
    // this.$emit('isLoaded')
  }

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
