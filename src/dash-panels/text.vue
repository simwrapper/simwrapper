<template lang="pug">
.text-panel-element(:class="{absolute: hasHeight}")
  .scrollable
    .curate-content.markdown(
      v-if="readmeContent"
      v-html="htmlWithProcessedRelativeImageTags"
      v-markdown-links
    )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import markdown from 'markdown-it'
import markdownTex from 'markdown-it-texmath'
import katex from 'katex'

import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const mdRenderer = new markdown({
  html: true,
  linkify: true,
  typographer: true,
}).use(markdownTex, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { macros: { '\\RR': '\\mathbb{R}' } },
})

export default defineComponent({
  name: 'TextPanel',
  props: {
    fileSystemConfig: { type: Object as PropType<FileSystemConfig>, required: true },
    subfolder: { type: String, required: true },
    split: { type: Object, required: true }, // {y,x}
    files: { type: Array, required: true },
    config: { type: Object as any, required: true },
  },

  // Vue directives let me process user clicks on links: needed for links in splitview mode
  directives: {
    markdownLinks: {
      unbind(el: any) {
        if (el._markdownHandler) {
          el.removeEventListener('click', el._markdownHandler)
          delete el._markdownHandler
        }
      },
      inserted(el: Element, binding: any, vnode: any) {
        const handler = (event: any) => {
          try {
            const target = event.target?.closest('a')
            if (target) {
              const path = vnode?.context?.$route?.path || ''
              if (path.startsWith('/split/')) {
                const href = target.getAttribute('href')
                // only capture local relative links; external links behave as normal.
                if (!href.startsWith('http')) {
                  // figure out relative path and get this panel's details
                  const mythis = vnode.context
                  const split = mythis.$props.split
                  const splitData = JSON.parse(atob(path.slice(7)))
                  const thisPanel = splitData[split.row][split.col]

                  // generate new path for this panel
                  thisPanel.key = Math.random()
                  const proposed = `${mythis.$props.subfolder}/${href}`
                  thisPanel.key = Math.random()
                  thisPanel.props.xsubfolder = proposed

                  // regenerate base64 for split URL
                  const base64 = btoa(JSON.stringify(splitData))

                  // halt regular navigation
                  event.preventDefault()

                  // goooo
                  mythis.$router.push(`/split/${base64}`)
                }
              }
            }
          } catch (e) {
            console.error('FAILED special split nav; sorry: ' + e)
          }
        }

        // store the listener so we can remove it later
        //@ts-ignore
        el._markdownHandler = handler
        el.addEventListener('click', handler)
      },
    },
  },

  data: () => {
    return {
      readmeContent: '',
      hasHeight: false,
    }
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystemConfig, globalStore)
    },

    htmlWithProcessedRelativeImageTags() {
      const fixed = this.readmeContent.replace(
        /src="\.(\/.*?)"/g,
        (_, path) => `src="${this.fileSystemConfig.baseURL}/${this.subfolder}/${path}"`
      )
      return fixed
    },
  },

  async mounted() {
    let filename
    try {
      // if height is defined, honor it. Otherwise, panel will stretch to fit content
      this.hasHeight = !!this.config.height

      if (!this.config.content) {
        const fileApi = new HTTPFileSystem(this.fileSystemConfig)
        filename = `${this.subfolder}/${this.config.file}`
        const text = await fileApi.getFileText(filename)
        this.readmeContent = mdRenderer.render(text)
      } else {
        this.readmeContent = mdRenderer.render(this.config.content)
      }
    } catch (e: any) {
      this.$emit('error', `Error loading: ${filename}`)

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
  padding: 0.25rem 0.5rem;
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
