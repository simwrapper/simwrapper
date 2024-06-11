<template lang="pug">
.text-panel-element(:class="{absolute: hasHeight}")
  .scrollable
    .curate-content.markdown(
      v-if="readmeContent"
      v-html="readmeContent"
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import markdown from 'markdown-it'

import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const mdRenderer = new markdown({
  html: true,
  linkify: true,
  typographer: true,
})

export default defineComponent({
  name: 'TextPanel',
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
  },
  data: () => {
    return {
      readmeContent: '',
      hasHeight: false,
    }
  },
  async mounted() {
    try {
      // if height is defined, honor it. Otherwise, panel will stretch to fit content
      this.hasHeight = !!this.config.height

      if (!this.config.content) {
        const fileApi = new HTTPFileSystem(this.fileSystemConfig)
        const filename = `${this.subfolder}/${this.config.file}`
        const text = await fileApi.getFileText(filename)
        this.readmeContent = mdRenderer.render(text)
      } else {
        this.readmeContent = this.config.content
      }
    } catch (e: any) {
      console.error({ e })
      let error = '' + e
      if (e.statusText) error = e.statusText

      this.readmeContent = `${this.config.file}: ${error}`
    }

    this.$emit('isLoaded')
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.text-panel-element {
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.text-panel-element.absolute {
  position: absolute;
}

.scrollable {
  overflow: auto;
  height: 100%;
  width: 100%;
}
</style>
