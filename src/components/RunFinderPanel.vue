<i18n>
en:
  sync: 'Sync folders'
  theme: 'Light/Dark'
  lang: 'EN/DE'
  split: 'Split view'
de:
  sync: 'Sync'
  theme: 'Hell/Dunkel'
  lang: 'DE/EN'
  split: 'Aufteilen'
</i18n>

<template lang="pug">
.run-finder-panel
  router-link.logo(:to="'/'")
    img(src="@/assets/simwrapper-logo/SW_logo_icon_white.png")
    h3 {{globalState.app }}

  .top-panel
    .stuff-in-main-panel
      .more-stuff

        .root-files(v-for="node,i in rootNodes" :key="i")
          h3: b {{ node.name }}

          tree-view.things(:initialData="node" @navigate="$emit('navigate', $event)")

  .bottom-panel
    //- h3 Search
    //- input.input(placeholder="Search text (TBA)")

    .commands
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onScan" :title="$t('sync')"): i.fa.fa-sync
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onDarkLight" :title="$t('theme')"): i.fa.fa-adjust
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onLanguage" :title="$t('lang')"): i.fa.fa-globe
      button.button(:class="{'is-dark' : state.isDarkMode}" style="margin-right: 0" @click="onSplit" :title="$t('split')"): i.fa.fa-columns

    p(style="margin: 0.25rem 0.25rem 0.25rem 0.5rem") {{ globalState.runFolderCount ? `Folders scanned: ${globalState.runFolderCount}` : '' }}

</template>

<i18n>
en:
  more-info: 'For more information:'
  tagLine: 'the simulation output viewer from TU Berlin'
de:
  more-info: 'Für weitere Informationen:'
  tagLine: 'Der Modellergebnis-Browser der TU Berlin.'
</i18n>

<script lang="ts">
const readme = require('@/assets/info-top.md')
const bottom = require('@/assets/info-bottom.md')

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { debounce } from 'debounce'

import Colophon from '@/components/Colophon.vue'
import VizCard from '@/components/VizCard.vue'
import TreeView from '@/components/TreeView.vue'

import globalStore from '@/store'
import runFinder from '@/js/RunFinder'

interface Folder {
  root: string
  path: string
  name: string
  children: Folder[]
}

@Component({
  components: { Colophon, VizCard, TreeView },
})
class MyComponent extends Vue {
  private runTree: { [root: string]: Folder } = {}
  private runLookupByPath: { [path: string]: Folder } = {}

  private numberOfScannedFolders = 0
  private state = globalStore.state
  // private rootNodes: { [path: string]: Folder[] } = {}

  private rootNodes: any[] = []

  private mounted() {
    // start the run finder process
    runFinder.findRuns()
    // react to found folders
    this.onRunFoldersChanged()
  }

  @Watch('$store.state.runFolderCount') updatedCount() {
    this.debounceRunFoldersChanged()
  }

  private async onRunFoldersChanged() {
    const newTree = {} as any
    this.rootNodes = []

    for (const root of Object.keys(this.$store.state.runFolders)) {
      const treeNode = await this.generateTreeFromFolders(root)
      console.log({ treeNode })
      newTree[root] = treeNode
      this.rootNodes.push(treeNode)
    }

    this.runTree = newTree
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
      path: '/',
      name: project.name,
      children: [] as Folder[],
    }
    this.runLookupByPath[root + '/'] = rootNode

    // this.runTree[root] = rootNode

    for (const run of allRuns) {
      // don't analyze root node itself
      if (!run.path) continue

      // console.log('RUN:', run.path)
      const lastSlash = run.path.lastIndexOf('/')
      const folderName = run.path.substring(lastSlash + 1)

      // skip .dot folders
      if (folderName.startsWith('.')) {
        // console.log('skipping', folderName)
        continue
      }

      // create node
      const folder = {
        root: prefix,
        isRoot: false,
        path: run.path,
        name: folderName,
        children: [] as Folder[],
      }
      // console.log(run.path)
      if (!this.runLookupByPath[root + run.path]) this.runLookupByPath[root + run.path] = folder

      // add to parent
      const parentPath = run.path.substring(0, lastSlash)
      // console.log({ parentPath })
      const parent = this.runLookupByPath[root + parentPath] || rootNode
      // console.log(run.path, 'has parent', parent)

      parent.children.push(folder)
    }
    return rootNode
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

  private globalState = globalStore.state
  private readme = readme
  private readmeBottom = bottom
}
export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.run-finder-panel {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.top-panel {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  margin-left: 0.25rem;
  margin-bottom: 0.5rem;
}

.stuff-in-main-panel {
  padding: 0rem 0rem;
  margin: 0 auto 0 0.5rem;
}

.more-stuff {
  // margin: 0 auto;
  display: flex;
  flex-direction: column;
  inline-size: 13rem;
  text-align: left;
  h1 {
    letter-spacing: -1px;
  }
  h3 {
    margin-top: 2rem;
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
  padding: 0 1rem 0.25rem 0.5rem;
}

a {
  font-size: 1.1rem;
  // color: #00499c;
}

.top {
  margin-top: 1rem;
}

.main {
  max-width: 64rem;
}

.main .top a {
  font-size: 0.9rem;
}

.commands {
  display: flex;
  flex-direction: row;
  margin-right: -0.5rem;
}

.commands .button {
  flex: 1;
  color: #a19ebb;
  margin-right: 0.25rem;
}

.commands .button:hover {
  color: var(--link);
}

.logo {
  display: flex;
  flex-direction: row;
  background-color: #60588f;
  color: white;
  padding: 0.4rem 1rem 0.2rem 1rem;
  margin-right: auto;
  margin-bottom: auto;
  margin-top: 0rem;

  img {
    height: 1.6rem;
  }

  h3 {
    margin-top: -0.1rem;
    margin-left: 0.5rem;
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
  margin-left: -1rem;
}

@media only screen and (max-width: 640px) {
  .content {
    padding: 2rem 1rem 8rem 1rem;
    flex-direction: column-reverse;
  }

  .headline {
    padding: 0rem 0rem 1rem 0rem;
    font-size: 1.5rem;
    line-height: 1.8rem;
  }
}
</style>
