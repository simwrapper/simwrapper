<template lang="pug">

video(:controls='controls' :loop='loop')

  each type, src in source
   source(:src="src" :type="type")

  each type, src in source
    Video tag not supported. Download the video 
    a(:href="src" target="_blank")=here


</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import { FileSystemConfig } from '@/Globals'

@Component({})
export default class VueComponent extends Vue {
  @Prop({ required: true }) fileSystemConfig!: FileSystemConfig
  @Prop({ required: true }) subfolder!: string
  @Prop({ required: true }) files!: string[]
  @Prop({ required: true }) config!: any

  private controls = null
  private loop = null
  private sources = null

  private async mounted() {
    

    const filename = `${this.subfolder}/${this.config.file}`


    // TODO

    this.$emit('isLoaded')
  }
}
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
}

@media only screen and (max-width: 640px) {
}
</style>
