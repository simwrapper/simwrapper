<template lang="pug">
.panel

  .top-panel
    h4 Runs

  .middle-panel

    .hint-clicks(style="margin-bottom: 1rem; opacity: 1")
        p Connect to SimWrapper cloud resources here.

    h3(style="margin-top: 1rem") Servers

    .curate-content
      .folder-table
        .folder(v-for="server in serverNames" :key="server"
          @click="clickedOnServer(server)"
        )
          i.fa.fa-server
          p &nbsp;{{ cleanName(server) }}
          i.fa.fa-times(
            @click="removeServer(server)"
            style="margin-left: auto"
          )

    .connect-here
      h3(@click="showAddResource=!showAddResource" style="margin-top: 1rem") Add new server
        i.fa(style="float: right"
          :class="{'fa-times': showAddResource, 'fa-arrow-up': !showAddResource}"
        )

      .add-details(v-if="showAddResource")
        p Label
        b-input.b-input(v-model="addNickname" size="is-small" placeholder="server" maxlength="255")
        p Server URL
        b-input.b-input(v-model="addUrl" size="is-small" placeholder="https://server" maxlength="255")
        p Authentication Key
        b-input.b-input(v-model="addKey" size="is-small" placeholder="user-123456" maxlength="255")

        b-button.add-button.is-small(type="is-warning" @click="addServer") &nbsp;&nbsp;Add&nbsp;&nbsp;
</template>

<script lang="ts">
const BASE_URL = import.meta.env.BASE_URL

const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import globalStore from '@/store'
import { BreadCrumb, FileSystemConfig, YamlConfigs } from '@/Globals'

export default defineComponent({
  name: 'BrowserPanel',
  i18n,
  components: {},
  data: () => {
    return {
      globalState: globalStore.state,
      addKey: '',
      addNickname: '',
      addUrl: '',
      subfolder: '',
      root: '',
      highlightedViz: -2, // -2:none, -1: dashboard, 0-x: tile
      errorStatus: '',
      servers: {} as { [id: string]: { serverNickname: string; url: string; key: string } },
      serverNames: [] as string[],
      isLoading: false,
      showAddResource: false,
    }
  },
  mounted() {
    this.updateShortcuts()
    const servers = localStorage.getItem('simrunner-servers') || '{}'
    this.servers = JSON.parse(servers)
    this.serverNames = Object.keys(this.servers).sort()
    if (!this.serverNames.length) this.showAddResource = true
  },

  watch: {
    'globalState.svnProjects'() {
      this.updateShortcuts()
    },
    subfolder() {
      this.updateRoute()
    },
  },

  computed: {},

  methods: {
    addServer() {
      if (!this.addUrl || !this.addKey) return
      console.log('ADD: ', this.addUrl, this.addKey, this.addNickname)

      const nickname = this.cleanName(this.addNickname || this.addUrl)
      const server = {
        serverNickname: nickname,
        key: this.addKey,
        url: this.addUrl,
      }
      this.servers[server.serverNickname] = server
      this.servers = Object.assign({}, this.servers)
      this.serverNames = Object.keys(this.servers).sort()
      localStorage.setItem('simrunner-servers', JSON.stringify(this.servers))
    },

    removeServer(server: string) {
      delete this.servers[server]
      this.serverNames = Object.keys(this.servers).sort()
      localStorage.setItem('simrunner-servers', JSON.stringify(this.servers))
    },

    updateRoute() {
      if (!this.root) return

      const svnProject = this.getFileSystem(this.root)

      this.highlightedViz = -2
    },

    updateShortcuts() {
      const roots = this.globalState.svnProjects.filter(
        source => !source.hidden && !source.slug.startsWith('fs')
      )
    },

    cleanName(text: string) {
      return decodeURIComponent(text)
    },

    getFileSystem(name: string) {
      const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )

      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }

      return svnProject[0]
    },

    clickedOnServer(serverName: string) {
      const server = this.servers[serverName]

      const runnerPage = {
        component: 'SimRunner',
        props: Object.assign({}, server, {
          root: '',
          xsubfolder: '',
        }),
      }

      this.$emit('navigate', runnerPage)
      return
    },

    dragEnd() {
      this.$emit('isDragging', false)
    },

    dragStart(event: DragEvent, folder: string) {
      this.$emit('isDragging', true)

      const panel = { component: 'TabbedDashboardView', props: {} }
      const root = this.root || folder // might be at root panel
      const correctFolder = this.root ? folder : ''

      const bundle = Object.assign({}, panel, {
        root,
        subfolder: correctFolder,
        xsubfolder: correctFolder,
      }) as any

      bundle.yamlConfig = bundle.config
      delete bundle.config

      const text = JSON.stringify(bundle) as any
      event.dataTransfer?.setData('bundle', text)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
.panel {
  display: flex;
  flex-direction: column;
  padding-top: 0.25rem;
  user-select: none;
  font-size: 0.9rem;
  color: #ddd;
}

.top-panel {
  display: flex;
  flex-direction: column;
  margin: 0.25rem 1rem 1rem 1rem;
}

h4 {
  background-color: #00000080;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
  font-weight: bold;
  text-transform: uppercase;
  color: #ddd;
}

.middle-panel,
.bottom-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  // width: 100%;
  margin: 0 0;
  padding: 0 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  text-align: left;
  user-select: none;

  h1 {
    letter-spacing: -1px;
  }
  h3 {
    font-size: 1rem;
    line-height: 1.2rem;
    border-bottom: 1px solid #cccccc80;
    margin-bottom: 0.25rem;
    padding-bottom: 1px;
    text-transform: uppercase;
    // text-align: center;
  }

  p,
  a {
    max-width: 100%;
    overflow-wrap: break-word;
  }
}

.bottom-panel {
  padding: 0 0.5rem 0.25rem 0.5rem;
  flex: unset;
}

.white {
  background-color: var(--bgBold);
}

.cream {
  background-color: var(--bgCream);
}

h2 {
  font-size: 1.8rem;
}

.badnews {
  border-left: 3rem solid #af232f;
  margin: 0rem 0rem;
  padding: 0.5rem 0rem;
  background-color: #ffc;
  color: $matsimBlue;
}

.viz-table {
  display: flex;
  flex-direction: column;
  list-style: none;
}

.viz-grid-item {
  z-index: 1;
  margin: 4px 0;
  // padding: 2px 2px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  background-color: var(--bgMapPanel);
  border-radius: 4px;
}

.viz-frame-component {
  background-color: var(--bgPanel);
}

.folder-table {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 0.5rem;
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: row;
  background-color: #14141a;
  color: #c6c1b9;
  line-height: 1.05rem;
  padding: 5px 7px;
  border-radius: 4px;
  word-wrap: break-word;

  i {
    margin-top: 1px;
  }
  p {
    margin-left: 4px;
  }
}

.folder:hover {
  background-color: #21516d;
  transition: background-color 0.08s ease-in-out;
}

.folder .fa-times {
  opacity: 0;
}

.folder:hover .fa-times {
  opacity: 0.3;
}

.fade {
  opacity: 0.4;
  pointer-events: none;
}

.curated-sections {
  display: flex;
  flex-direction: column;
}

.curate-heading {
  padding: 0rem 0rem;
  margin: 0rem 0rem;
}

.curate-content {
  margin-bottom: 2rem;
}

.viz-image-table {
  display: grid;
  grid-gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  list-style: none;
}

.fa-arrow-up {
  margin-right: 2px;
}

.project-root {
  display: flex;
  flex-direction: column;
  margin-top: 0.75rem;
  padding: 0.5rem 0.5rem;
  background-color: #14141a;
  color: #bbb;
  border-left: 3px solid var(--sliderThumb);

  h5 {
    font-size: 1rem;
    line-height: 1rem;
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  p {
    line-height: 1.1rem;
  }
}

.project-root.local {
  border-left: 3px solid $matsimBlue;
}

.project-root:hover {
  cursor: pointer;
  background-color: #21516d;
  transition: background-color 0.1s ease-in-out;
}

.flex-row {
  display: flex;
  flex-direction: row;
}

.hint-clicks {
  margin: 0 0 0 0;
  line-height: 1.2rem;
  opacity: 0;
  transition: opacity 0.2s ease-in;
  // padding: 0.25rem 0.25rem;

  p {
    max-width: 12rem;
    text-align: center;
    margin: 0 auto;
  }
}

.config-sources {
  margin-top: 0.5rem;
  text-align: right;
  a {
    color: var(--text);
  }
}

.config-sources a:hover {
  cursor: pointer;
  color: var(--linkHover);
}

.viz-frame {
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  flex: 1;
  overflow: hidden;
  padding: 4px 0 0 4px;
  border-radius: 3px;
  p {
    margin: 0 0 0 0;
    line-height: 1rem;
    padding: 0 0;
    color: var(--text);
    word-wrap: break-word;
    /* Required for text-overflow to do anything */
    // text-overflow: ellipsis;
    // white-space: nowrap;
    // overflow: hidden;
  }
}

.viz-frame:hover {
  background-color: var(--bgHover);
  border-radius: 3px;
  transition: background-color 0.08s ease-in-out;
}

.highlighted {
  background-color: var(--bgHover);
}

// p.v-title {
//   // font-size: 1rem;
// }

p.v-filename {
  margin: 5px 0;
}

p.v-plugin {
  text-align: right;
  text-transform: lowercase;
  margin-left: auto;
  color: white;
  background-color: var(--bgCream3);
  padding: 2px 3px;
  border-radius: 0 0 4px 0;
}

.trail {
  display: flex;
  width: 100%;
  font-size: 0.8rem;
  p:hover {
    color: var(--linkHover);
    cursor: pointer;
  }
}

.x-breadcrumbs {
  flex: 1;
  display: flex;
  flex-flow: row wrap;
  line-height: 0.85rem;
  max-width: 100%;
  margin-top: 3px;

  p {
    width: max-content;
  }

  p:hover {
    color: var(--linkHover);
    cursor: pointer;
  }
}

.add-folder {
  margin-top: 1rem;
}

.fa-times,
.fa-arrow-up {
  opacity: 0.3;
  float: right;
  padding: 1px 1px;
}

.fa-times:hover {
  opacity: 1;
  color: red;
}

.fa-times:active {
  color: darkred;
}

.folder:hover .fa-times:hover {
  opacity: 1;
  color: red;
}

.folder:hover .fa-times:active {
  color: darkred;
}

.project-root:hover .fa-times {
  opacity: 0.15;
}

.project-root:hover .fa-times:hover {
  opacity: 1;
}

.logo {
  margin: 1.5rem auto 0.5rem auto;
}

.logo:hover {
  color: var(--linkHover);
  cursor: pointer;
}

.b-input {
  margin-bottom: 0.5rem;
}

.connect-here {
  margin-top: auto;
  padding: 1rem 0;

  h3 {
    cursor: pointer;
  }
}
.add-button:active {
  opacity: 0.8;
}
</style>
