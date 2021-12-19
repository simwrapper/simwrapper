<template lang="pug">
sankey-diagram.deck-map(
  :root="fileSystemConfig.slug"
  :subfolder="subfolder"
  :config="config"
  :thumbnail="false"
  :dimensions="dimensions"
)

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import { FileSystemConfig } from '@/Globals'
import SankeyDiagram from '@/plugins/sankey/SankeyDiagram.vue'

@Component({ components: { SankeyDiagram } })
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any
  @Prop() cardId!: string

  private dimensions: { width: number; height: number } = { width: 0, height: 0 }

  private mounted() {
    this.$emit('dimension-resizer', { id: this.cardId, resizer: this.changeDimensions })
    this.$emit('isLoaded')
  }

  /** Our dashboard system tells us procedurally when we have a new dimension */
  private changeDimensions(dimensions: { width: number; height: number }) {
    this.dimensions = dimensions
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
</style>
