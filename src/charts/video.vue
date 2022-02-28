<template lang="pug">

video(:controls="controls" :loop='loop')

  source(v-for="source in sources" :src="source.src" :type="source.type")

  p(v-for="source in sources") Video tag not supported. Download the video&nbsp;
    a(:href="source.src" target="_blank") here

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

  private controls: string | null = null
  private loop: string | null = null
  private sources: { [key: string]: string } = {}

  // true for absolute URLs
  private r: RegExp = new RegExp('^(?:[a-z]+:)?//', 'i')

  private async mounted() {
    this.controls = this.config.controls
    this.loop = this.config.loop

    this.sources = {}

    // Resolve relative URLs
    for (const k in this.config.sources) {
      var url = this.config.sources[k]

      if (!this.r.test(url)) url = `${this.subfolder}/${url}`

      this.sources[k] = url
    }

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
