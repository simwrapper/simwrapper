<template lang="pug">
.c-xmlviewer.flex-col(:class="{'is-thumbnail': thumbnail}")
  b-input.xml-searchbox(
    type="search"
    icon-pack="fas"
    icon="search"
    placeholder="search..."
    v-model="searchTerm"
  )
  .viewer
    tree-view.things(v-if="isLoaded"
      :initialData="viewXml"
      :expandAll="isSearch"
      :level="0"
      :numberOfUnfoldLevel="numberOfUnfoldLevel"
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
import debounce from 'debounce'

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
      viewXml: {} as any,
      fullXml: null as any,
      searchXml: null as any,
      searchTerm: '',
      debounceSearch: {} as any,
      isLoaded: false,
      isSearch: false,
      numberOfUnfoldLevel: 1,
    }
  },

  watch: {
    searchTerm() {
      this.debounceSearch()
    },
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
    this.debounceSearch = debounce(this.handleSearch, 500)

    try {
      this.getVizDetails()
      // only continue if we are on a real page and not the file browser
      if (this.thumbnail) return

      const answer = await this.fetchXml()

      //TODO remove '?xml' correctly
      this.fullXml = answer[1]
      this.viewXml = this.fullXml
      this.isLoaded = true
    } catch (err) {
      const e = err as any
      console.error({ e })
      this.loadingText = '' + e
    }

    this.numberOfUnfoldLevel = this.config?.unfoldLevel ?? 0 + 1
  },

  methods: {
    getVizDetails() {
      if (this.config) {
        // config came in from the dashboard and is already parsed
        this.vizDetails = { ...this.config }
        this.vizDetails.file = `/${this.subfolder}/${this.config.file}`
        this.$emit('titles', this.vizDetails.title || this.vizDetails.file || 'XML')
      } else {
        // Otherwise this is an XML file
        const filename = this.yamlConfig ?? ''
        this.vizDetails = {
          title: filename,
          description: '',
          file: this.subfolder + '/' + filename,
        }
      }
      // if (!this.vizDetails.title) this.vizDetails.title = 'XML'
      this.$emit('titles', this.vizDetails.title)
    },

    async fetchXml() {
      this.loadingText = `Loading ${this.vizDetails.file}...`

      if (this.xmlWorker) this.xmlWorker.terminate()
      this.xmlWorker = new XmlWorker()

      return new Promise<any>((resolve, reject) => {
        this.xmlWorker.onmessage = (message: MessageEvent) => {
          this.xmlWorker.terminate()

          if (message.data.error) reject(message.data.error)
          if (message.data.resolvedFilename && !this.vizDetails.title) {
            const slash = message.data.resolvedFilename.lastIndexOf('/')
            if (slash > -1)
              this.$emit('titles', 'XML Config: ' + message.data.resolvedFilename.slice(slash + 1))
          }

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

    async handleSearch() {
      console.log('search:', this.searchTerm)

      if (!this.searchTerm) {
        // clear empty search
        this.viewXml = this.fullXml
        this.isSearch = false
      } else {
        const searchXML = this.findSearchTermInElement(
          [this.fullXml],
          this.searchTerm.toLocaleLowerCase()
        )
        this.viewXml = searchXML[0]
        this.isSearch = true
      }
      this.isLoaded = false
      await this.$nextTick()
      this.isLoaded = true
    },

    findSearchTermInElement(element: any[], term: string): any[] {
      if (term !== this.searchTerm.toLocaleLowerCase()) return []

      const found = [] as any[]
      for (const node of element) {
        const items = { ...node }
        // check attributes
        if (items[':@']) {
          const attributes = JSON.stringify(items[':@']).toLocaleLowerCase()
          if (attributes.indexOf(term) > -1) {
            found.push(node)
            continue
          }
        }

        // check #text
        if (items['#text']) {
          // convert to string!
          if (`${items['#text']}`.toLocaleLowerCase().indexOf(term) > -1) {
            found.push(node)
          }
          continue
        }

        // check children
        const attr = items[':@']
        delete items[':@']
        const key = Object.keys(items)[0]
        const children = items[key]
        if (!children.length) continue

        // recurse into kids:
        const foundInChildren = this.findSearchTermInElement(children, term)
        if (foundInChildren.length) {
          const leaf = {} as any
          if (attr) leaf[':@'] = attr
          leaf[key] = foundInChildren
          found.push(leaf)
        }
      }
      return found
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.c-xmlviewer {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-color: var(--bgCardFrame);
  padding: 0.25rem 0.5rem !important;
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
  width: 100%;
  padding: 0.25rem 0;
}
</style>

<style lang="scss">
.xml-searchbox {
  margin-bottom: 0.5rem;
}

.xml-searchbox input {
  background-color: var(--bgPanel);
  border: 1px solid var(--bgCream3);
  color: var(--link);
}
</style>
