<template lang="pug">
.mycomponent(:class="{'is-thumbnail': thumbnail}")
  b-input.searchbox(placeholder="Search TBA...")
  .viewer
    tree-view.things(v-if="fullXml"
      :initialData="fullXml"
      @navigate="handleNavigation($event)"
    )

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

// import yaml from 'yaml'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import TreeView from './TreeView.vue'
import XmlWorker from '@/workers/NewXmlFetcher.worker?worker'

import { FileSystemConfig, UI_FONT, BG_COLOR_DASHBOARD } from '@/Globals'

//@ts-ignore
const isChrome = !!window.showDirectoryPicker // Chrome has File Access API
const isFirefox = !isChrome

const MyComponent = defineComponent({
  name: 'XmlViewer',
  components: { TreeView },
  i18n,
  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    config: { type: Object as any },
    resize: Object as any,
    thumbnail: Boolean,
    yamlConfig: String,
  },

  data() {
    return {
      globalState: globalStore.state,
      vizDetails: { title: '', description: '', file: '' },
      loadingText: '',
      id: `id-${Math.floor(1e12 * Math.random())}` as any,
      xmlWorker: null as any,
      fullXml: null as any,
    }
  },

  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },
  },

  async mounted() {
    try {
      await this.getVizDetails()
      // only continue if we are on a real page and not the file browser
      if (this.thumbnail) return

      const answer = await this.fetchXml()

      //TODO remove '?xml' correctly
      this.fullXml = answer[1]
    } catch (err) {
      const e = err as any
      console.error({ e })
      this.loadingText = '' + e
    }
  },

  methods: {
    async getVizDetails() {
      if (this.config) {
        // config came in from the dashboard and is already parsed
        this.vizDetails = { ...this.config }
        this.vizDetails.file = `/${this.subfolder}/${this.config.file}`
        this.$emit('title', this.vizDetails.title || this.vizDetails.file || 'XML')
      } else {
        // Otherwise this is an XML file
        const filename = this.yamlConfig ?? ''
        this.vizDetails = {
          title: filename,
          description: '',
          file: this.subfolder + '/' + filename,
        }
      }
      if (!this.vizDetails.title) this.vizDetails.title = 'XML'
      this.$emit('title', this.vizDetails.title)
    },

    async fetchXml() {
      this.loadingText = `Loading ${this.vizDetails.file}...`

      if (this.xmlWorker) this.xmlWorker.terminate()
      this.xmlWorker = new XmlWorker()

      return new Promise<any>((resolve, reject) => {
        this.xmlWorker.onmessage = (message: MessageEvent) => {
          this.xmlWorker.terminate()

          if (message.data.error) reject(message.data.error)
          resolve(message.data.xml)
        }

        this.xmlWorker.postMessage({
          id: 1,
          fileSystem: this.fileSystem,
          filePath: this.vizDetails.file,
          options: {
            ignoreAttributes: false,
            preserveOrder: true,
            attributeNamePrefix: '$$',
            isFirefox,
          },
        })
      })
    },

    handleNavigation(event: any) {
      console.log('EVENT!', event)
    },
  },
})

// !register plugin!
globalStore.commit('registerPlugin', {
  kebabName: 'xml-viewer',
  prettyName: 'XML Viewer',
  description: 'Browse any (small) XML file',
  filePatterns: ['**/*.xml*'],
  component: MyComponent,
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.mycomponent {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  // margin: 1rem;
}

.mycomponent.is-thumbnail {
  padding-top: 0;
  height: $thumbnailHeight;
}

.viewer {
  height: 100%;
  width: 100%;
  flex: 1;
  margin: 0 auto;
  overflow: auto;
}

.viewer.is-thumbnail {
  padding: 0rem 0rem;
  margin: 0 0;
}

.things {
  background-color: var(--bgBold);
  width: 100%;
  padding: 0.25rem 0;
}

.searchbox {
  padding: 1px 0px;
}
</style>
