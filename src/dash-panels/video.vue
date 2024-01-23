<template lang="pug">

figure(class="video_container")

  video(:controls="controls" :loop='loop' :allowfullscreen='allowfullscreen' :autoplay="autoplay" :muted="muted")

    source(v-for="(src, type) in sources" :src="src" :type="type" :key="type")

    p(v-for="(src, type) in sources" :key="type") Video tag not supported. Download the video&nbsp;
      a(:href="src" target="_blank") here

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

export default defineComponent({
  name: 'VideoPanel',
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
  },
  data: () => {
    return {
      controls: '', // string | null = null,
      loop: '', // string | null = null
      allowfullscreen: '', // : string | null = null
      autoplay: '', // string | null = null
      muted: '', // string | null = null
      sources: {} as { [key: string]: string },
      r: new RegExp('^(?:[a-z]+:)?//', 'i'),
    }
  },
  async mounted() {
    this.controls = this.config.controls
    this.loop = this.config.loop
    this.allowfullscreen = this.config.allowfullscreen
    this.autoplay = this.config.autoplay
    this.muted = this.config.muted

    this.sources = {}

    const fileApi = new HTTPFileSystem(this.fileSystemConfig)

    // Resolve relative URLs
    for (const k in this.config.sources) {
      try {
        let url = this.config.sources[k]
        if (!this.r.test(url)) url = fileApi.cleanURL(`${this.subfolder}/${url}`)
        this.sources[k] = url
      } catch (e) {
        if (fileApi.hasHandle()) {
          this.$emit('error', 'Cannot play videos on Chrome local filesystem')
        } else {
          this.$emit('error', '' + e)
        }
      }
    }

    this.$emit('isLoaded')
  },
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
}

@media only screen and (max-width: 640px) {
}
</style>
