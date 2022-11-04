<template lang="pug">
.panel
  //- router-link.logo(:to="baseURL")
  //-   img(src="@/assets/simwrapper-logo/SW_logo_icon_white.png")
  //-   h3 {{globalState.app }}

  .top-panel
    h4 SimWrapper

  .middle-panel
    .root-files(v-for="node,i in rootNodes" :key="i")
      h3: b {{ node.name }}
      tree-view.things(:initialData="node" @navigate="$emit('navigate', $event)")

  .bottom-panel
    //- h3 Search
    //- input.input(placeholder="Search text (TBA)")

    p(v-if="timeLastChangeHappened" style="margin: 0.25rem 0.25rem 0.25rem 0.5rem") {{ globalState.runFolderCount ? `Folders scanned: ${globalState.runFolderCount}` : '' }}

    .commands
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onScan" :title="$t('sync')"): i.fa.fa-sync
      button.button(:class="{'is-dark' : state.isDarkMode}" style="margin-right: 0" @click="onSplit" :title="$t('split')"): i.fa.fa-columns

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { sync: 'Sync folders', theme: 'Light/Dark', lang: 'EN/DE', split: 'Split view' },
    de: { sync: 'Sync', theme: 'Hell/Dunkel', lang: 'DE/EN', split: 'Aufteilen' },
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { debounce } from 'debounce'

import globalStore from '@/store'
import runFinder from '@/js/RunFinder'
import TreeView from './TreeView.vue'

const BASE_URL = import.meta.env.BASE_URL

interface Folder {
  root: string
  path: string
  name: string
  children: Folder[]
  level: number
}

@Component({
  i18n,
  components: { TreeView },
})
export default class MyComponent extends Vue {
  private runTree: { [root: string]: Folder } = {}
  private runLookupByPath: { [path: string]: Folder } = {}

  private numberOfScannedFolders = 0
  private state = globalStore.state

  private rootNodes: any[] = []

  private baseURL = BASE_URL

  private showWarnings = false
  private showDescription = false
  private descriptionIndexListWarning: number[] = []
  private descriptionIndexListError: number[] = []
  private isError = false

  private mounted() {
    // start the run finder process
    runFinder.findRuns()
    // react to found folders
    this.onRunFoldersChanged()
  }

  @Watch('$route.path') test() {
    this.clearAllButtons()
  }

  @Watch('$store.state.runFolderCount') updatedCount() {
    this.debounceRunFoldersChanged()
  }

  // @Watch('$store.state.statusErrors') openErrorPage() {
  //   if (this.$store.state.statusErrors.length) this.showWarnings = true
  // }

  // @Watch('$store.state.statusWarnings') openWarningPage() {
  //   if (this.$store.state.statusWarnings.length) this.showWarnings = true
  // }

  @Watch('state.isDarkMode') updateTheme() {
    console.log('Hi!', this.$store.state.statusWarnings)
  }

  @Watch('$store.state.statusErrors') gotNewErrors() {
    if (this.$store.state.statusErrors.length) {
      this.showWarnings = true
    }
  }

  private timeLastChangeHappened = 0
  private hideTimer() {
    setTimeout(() => {
      const wait = Date.now() - this.timeLastChangeHappened
      if (wait > 5000) {
        this.timeLastChangeHappened = 0
      } else {
        this.hideTimer()
      }
    }, 2000)
  }

  private async onRunFoldersChanged() {
    const newTree = {} as any
    this.rootNodes = []

    for (const root of Object.keys(this.$store.state.runFolders)) {
      const treeNode = await this.generateTreeFromFolders(root)
      newTree[root] = treeNode

      this.rootNodes.push(treeNode)
    }

    this.runTree = newTree

    if (!this.timeLastChangeHappened && this.globalState.runFolderCount) {
      this.timeLastChangeHappened = Date.now()
      this.hideTimer()
    }
  }
  private debounceRunFoldersChanged = debounce(this.onRunFoldersChanged, 100)

  private async generateTreeFromFolders(root: string) {
    this.runLookupByPath = {}
    const allRuns: { path: string }[] = this.globalState.runFolders[root]

    const project = this.$store.state.svnProjects.filter((p: any) => p.name === root)[0]

    const prefix = project.slug
    const rootNode = {
      root: prefix,
      isRoot: true,
      level: 0,
      path: '/',
      name: project.name,
      children: [] as Folder[],
    }
    this.runLookupByPath[root + '/'] = rootNode

    for (const run of allRuns) {
      // don't analyze root node itself
      if (!run.path) continue

      // console.log('RUN:', run.path)
      const lastSlash = run.path.lastIndexOf('/')
      const folderName = run.path.substring(lastSlash + 1)

      // create node
      const folder = {
        root: prefix,
        isRoot: false,
        path: run.path,
        name: folderName,
        children: [] as Folder[],
        level: 0,
      }
      // console.log(run.path)
      if (!this.runLookupByPath[root + run.path]) this.runLookupByPath[root + run.path] = folder

      // add to parent
      const parentPath = run.path.substring(0, lastSlash)
      const parent = this.runLookupByPath[root + parentPath] || rootNode
      folder.level = parent.level + 1

      parent.children.push(folder)
    }
    return rootNode
  }

  private clearAllButtons() {
    this.$store.commit('clearAllErrors')
    this.showWarnings = false
  }

  private onSplit() {
    this.$emit('split')
  }

  private onScan() {
    runFinder.populate()
  }

  private onDarkLight() {
    globalStore.commit('rotateColors')
  }

  private onLanguage() {
    const newLocale = globalStore.state.locale === 'en' ? 'de' : 'en'
    this.$store.commit('setLocale', newLocale)
    this.$root.$i18n.locale = newLocale
  }

  private onWarning() {
    this.showWarnings = !this.showWarnings
  }

  private globalState = globalStore.state
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 0.25rem;
  user-select: none;
}

.top-panel {
  display: flex;
  flex-direction: column;
  margin: 0.25rem 0.5rem 1rem 0.5rem;
}

h4 {
  background-color: #00000040;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.5rem;
}

.middle-panel {
  flex: 1;
  display: flex;
  width: 100%;
  flex-direction: column;
  margin-bottom: 0.5rem;
  padding: 0 0.5rem 0rem 0.5rem;
  overflow-y: auto;
  text-align: left;
  user-select: none;

  h1 {
    letter-spacing: -1px;
  }
  h3 {
    font-size: 1.2rem;
    border-bottom: 1px solid #cccccc80;
    margin-top: 0rem;
    margin-bottom: 0.25rem;
  }

  p,
  a {
    line-height: 1.1rem;
    margin-top: 0.5rem;
    font-size: 1rem;
    max-width: 100%;
    overflow-wrap: break-word;
  }
}

.bottom-panel {
  margin-top: auto;
  padding: 0 0.5rem 0.25rem 0.5rem;
}

a {
  font-size: 1.1rem;
}

.top {
  margin-top: 1rem;
}

.commands {
  display: flex;
  flex-direction: row;
  margin-bottom: 4px;
}

.commands .button {
  flex: 1;
  color: #a19ebb;
  margin-right: 0.25rem;
  padding: 0 0;
}

.commands .button:hover {
  color: var(--link);
}

.logo {
  display: flex;
  flex-direction: row;
  background-color: #29d09a; // #5c2f79;
  color: white;
  padding: 0.4rem 0.75rem 0.2rem 0.5rem;
  margin-right: auto;
  margin-bottom: auto;
  margin-top: 0rem;

  img {
    height: 1.6rem;
  }

  h3 {
    margin-top: -0.1rem;
    margin-left: 0.4rem;
    font-size: 1.3rem;
  }

  a {
    font-size: 1.3rem;
    color: white;
  }

  a:hover {
    color: #ff8;
  }
}

.things {
  font-size: 0.85rem;
  margin-left: -8px;
  margin-bottom: 1rem;
}

.message-area {
  text-indent: -20px;
  margin-left: 20px;
}

.single-message {
  list-style-position: outside;
  cursor: pointer;
}

.clear-button {
  width: 100%;
  margin-bottom: 0.5rem;
  margin-left: 0rem;
}

::-webkit-scrollbar-corner {
  background: rgba(0, 0, 0, 0);
}

@media only screen and (max-width: 640px) {
}
</style>
