<template lang="pug">

figure.video_container

  video(:controls="controls" :loop='loop' :allowfullscreen='allowfullscreen' :autoplay="autoplay" :muted="muted")
    source(v-for="(src, type) in sources" :src="src" :type="type" :key="type")
    p(v-for="(src, type) in sources" :key="'p1 '+type") Video tag not supported. Download the video&nbsp;
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
      controls: 'controls',
      allowfullscreen: 'allowfullscreen',
      loop: '',
      autoplay: '',
      muted: '',
      sources: {} as { [key: string]: string },
      r: new RegExp('^(?:[a-z]+:)?//', 'i'),
    }
  },

  mounted() {
    this.loop = this.config.loop ?? 'loop'
    this.allowfullscreen = this.config.allowfullscreen ?? 'allowfullscreen'
    this.controls = this.config.controls ?? 'controls'
    this.autoplay = this.config.autoplay ?? ''
    this.muted = this.config.muted ?? ''

    const fileApi = new HTTPFileSystem(this.fileSystemConfig)

    // Resolve relative URLs
    for (let k in this.config.sources) {
      try {
        let url = this.config.sources[k]
        if (!this.r.test(url)) url = fileApi.cleanURL(`${this.subfolder}/${url}`)
        if (k.indexOf('/') == -1 || !k.startsWith('video/')) k = 'video/' + k
        this.sources[k] = url
      } catch (e) {
        if (fileApi.hasHandle()) {
          this.$emit('error', 'Cannot play videos on Chrome local filesystem')
        } else {
          this.$emit('error', '' + e + '...make sure video type is video/mp4')
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
