<template lang="pug">
.panel

  .top-panel
    h4
      i.fas.fa-database
      span &nbsp; Data Sources

  .middle-panel

    .is-chrome(v-if="isChrome")
      h3 Browse Local Files
      .items
        .project-root.local(v-for="row in localFileHandles" :key="row.key"
          @click="clickedBrowseChromeLocalFolder(row)")

          p.root(style="flex: 1;") {{ row.handle.name}}
            i.fa.fa-times(@click.stop="clickedLocalDelete(row)")

        .project-root.open-folder(@click="showChromeDirectory")
          p.root Open folder...
          p.description This browser can access local folders

    h3 Data Sources
    .items(v-if="!showAddDataSource")
      .project-root(v-for="project in allRoots.filter(p => !p.example)" :key="project.slug"
        @click="clickedOnFolder({root: project.slug})"
      )
        p.root {{ project.name }}
          i.fa.fa-times(@click.stop="clickedDataSourceDelete(project)")
        p.description {{ project.description }}

      p.config-sources
        a(@click="showAddDataSource=true")
          i.fa.fa-plus
          | &nbsp;Add data source...

    .items(v-if="showAddDataSource")
      add-data-source(@close="showAddDataSource=false" )

    h3 Example Dashboards
    .items
      .project-root(v-for="project in allRoots.filter(p => p.example)" :key="project.slug"
        @click="clickedOnFolder({root: project.slug})"
      )
        p.root {{ project.name }}
          i.fa.fa-times(@click.stop="clickedDataSourceDelete(project)")
        p.description {{ project.description }}

    h3 Starred Locations
    .items
      .project-root(v-for="favorite in globalState.favoriteLocations" :key="favorite.fullPath"
        @click="clickedOnFavorite(favorite)")
        p.root {{ favorite.label }}
          i.fa.fa-times(@click.stop="clickedDeleteFavorite(favorite)")
        p.description {{ favorite.hint || `${favorite.root}${favorite.subfolder}` }}

</template>

<script lang="ts">
// Typescript doesn't know the Chrome File System API
declare const window: any
const BASE_URL = import.meta.env.BASE_URL
const NO_DASHBOARDS = ['.nodashboards', 'nodashboards', 'nodashboards.txt']

const i18n = {
  messages: {
    en: {
      Maps: 'Maps & Dashboards',
      Images: 'Images',
      Analysis: 'Analysis',
      Files: 'Files',
      Folders: 'Folders',
      Topsheet: 'Table',
      privacy:
        'SimWrapper is a client-side app, which means there is no upstream server collecting or storing data.\n\nSimWrapper does not collect, handle or process any data about you while you use the site. SimWrapper does not contain any tracking devices or analytics software. No user cookies are stored or transmitted.',
    },
    de: {
      Maps: 'Karten',
      Images: 'Bilder',
      Analysis: 'Ergebnisse',
      Files: 'Dateien',
      Folders: 'Ordner',
      Topsheet: 'Tabelle',
    },
  },
}

const tabColors = {
  // blank means dashboard:
  '': '#118860',
  // others are kebab-case:
  'aggregate-od': '#E98B52',
  'vehicle-anim': '#330033',
  'x-y-t': '#583270',
  carriers: '#c97A2C',
  events: '#4400ff',
  hexagons: '#900564',
  map: '#c94264',
  network: '#894654',
  sankey: '#D8A672',
  summary: '#2EA95B',
  transit: '#3B6FE4',
} as any

interface VizEntry {
  component: string
  config: string
  title: string
}

interface IMyState {
  errorStatus: string
  folders: string[]
  files: string[]
  isLoading: boolean
  readme: string
  svnProject: FileSystemConfig | null
  svnRoot?: HTTPFileSystem
  subfolder: string
  summary: boolean
  vizes: VizEntry[]
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { get, set, clear } from 'idb-keyval'
import markdown from 'markdown-it'
import mediumZoom from 'medium-zoom'
import micromatch from 'micromatch'

import globalStore from '@/store'
import { BreadCrumb, FavoriteLocation, FileSystemConfig, YamlConfigs } from '@/Globals'
import { pluginComponents } from '@/plugins/pluginRegistry'
import fileSystems, { addLocalFilesystem } from '@/fileSystemConfig'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import AddDataSource from './AddDataSource.vue'
import ErrorPanel from '@/components/left-panels/ErrorPanel.vue'
import FileSystemProjects from '@/components/FileSystemProjects.vue'
import TopsheetsFinder from '@/components/TopsheetsFinder/TopsheetsFinder.vue'

import LOGO_SIMWRAPPER from '@/assets/simwrapper-logo/SW_logo_white.png'

export default defineComponent({
  name: 'SystemPanel',
  i18n,
  components: { AddDataSource },
  data: () => {
    return {
      globalState: globalStore.state,
      root: '',
      subfolder: '/',
      activeSection: 'Files',
      allConfigFiles: { dashboards: {}, topsheets: {}, vizes: {}, configs: {} } as YamlConfigs,
      allRoots: [] as FileSystemConfig[],
      mdRenderer: new markdown({ html: true, linkify: true, typographer: true }),
      showAddDataSource: false,
      summaryYamlFilename: 'viz-summary.yml',
      logo: LOGO_SIMWRAPPER,
      myState: {
        errorStatus: '',
        folders: [],
        files: [],
        isLoading: false,
        readme: '',
        svnProject: null,
        svnRoot: undefined,
        subfolder: '',
        vizes: [],
        summary: false,
      } as IMyState,
    }
  },
  mounted() {
    this.updateShortcuts()
    this.getRootAndRoute(this.$route.params.pathMatch)
    this.updateFavorites()
  },

  watch: {
    'globalState.svnProjects'() {
      this.updateShortcuts()
    },
    'globalState.colorScheme'() {
      // medium-zoom freaks out if color theme is swapped.
      // so let's reload images just in case.
      // this.fetchFolderContents()
    },
    subfolder() {
      return
      // if (this.subfolder) this.updateRoute()
    },
    'globalState.authAttempts'() {
      this.authenticationChanged()
    },
    'myState.files'() {
      this.filesChanged()
    },
  },
  computed: {
    hasDashboards(): boolean {
      return !!Object.keys(this.allConfigFiles.dashboards).length
      // const d = /^dashboard.*ml/
      // for (const viz of this.myState.files) {
      //   if (d.test(viz)) return true
      // }
      // return false
    },

    isChrome() {
      return !!window.showDirectoryPicker
    },

    localFileHandles(): any[] {
      // sort a copy of the array so we don't get an infinite loop
      return this.$store.state.localFileHandles
        .concat()
        .sort((a: any, b: any) =>
          parseInt(a.key.substring(2)) < parseInt(b.key.substring(2)) ? -1 : 1
        )
    },

    hasErrors(): any {
      return this.globalState.statusErrors.length > 0
    },
  },
  methods: {
    updateRoute() {
      if (!this.root) return

      const svnProject = this.getFileSystem(this.root)

      this.myState.svnProject = svnProject
      this.myState.subfolder = this.subfolder || ''
      this.myState.readme = ''

      if (!this.myState.svnProject) return

      this.myState.svnRoot = new HTTPFileSystem(this.myState.svnProject, globalStore)
    },

    updateLanguage() {
      this.$store.commit('setLocale', this.$store.state.locale == 'en' ? 'de' : 'en')
      this.$root.$i18n.locale = this.$store.state.locale
    },

    authenticationChanged() {
      console.log('AUTH CHANGED - Reload')
      this.updateRoute()
    },

    async filesChanged() {
      // clear visualizations
      this.myState.vizes = []
      if (this.myState.files.length === 0) return

      this.showReadme()

      this.myState.summary = this.myState.files.indexOf(this.summaryYamlFilename) !== -1

      if (this.myState.summary) {
        // await this.buildCuratedSummaryView()
      } else {
        this.buildShowEverythingView()
      }

      // make sure page is rendered before we attach zoom semantics
      await this.$nextTick()
      mediumZoom('.medium-zoom', {
        background: '#444450',
      })
    },

    updateShortcuts() {
      const roots = this.globalState.svnProjects.filter(
        source => !source.hidden && !source.slug.startsWith('fs')
      )

      this.allRoots = roots
    },

    async updateFavorites() {
      try {
        const f = localStorage.getItem('favoriteLocations') || '[]'
        const favorites = JSON.parse(f)
        this.$store.commit('setFavorites', favorites)
      } catch (e) {
        // oh welll, no favorites
      }
    },

    clickedDeleteFavorite(favorite: FavoriteLocation) {
      this.$store.commit('removeFavorite', favorite)
    },

    clickedOnFavorite(favorite: FavoriteLocation) {
      const page = {
        component: 'TabbedDashboardView',
        props: {
          root: favorite.root,
          xsubfolder: favorite.subfolder,
        },
      }

      this.$emit('navigate', page)
      return
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

    getRootAndRoute(pathMatch: string | undefined) {
      if (!pathMatch) {
        // console.log('NOPE')
        return
      }

      // splash page:
      if (pathMatch === '/') {
        this.root = ''
        return
      }

      // split panel:
      if (pathMatch.startsWith('split/')) {
        console.log('SPLIT')
        // ?????
        const payload = pathMatch.substring(6)
        try {
          // const content = atob(payload)
          // const json = JSON.parse(content)
          // this.panels = json
        } catch (e) {
          // couldn't do; you failed!
          this.$router.replace('/')
        }
        return
      }

      // split out project root and subfolder
      // console.log(777, pathMatch, JSON.stringify(this.myState))
      let root = pathMatch
      let subfolder = ''
      const slash = pathMatch.indexOf('/')
      if (slash > -1) {
        root = pathMatch.substring(0, slash)
        subfolder = pathMatch.substring(slash + 1)
      }
      this.root = root
      this.subfolder = subfolder
    },

    updateTitle(viz: number, title: string) {
      this.myState.vizes[viz].title = title
    },

    getTabColor(kebabName: string) {
      const color = tabColors[kebabName] || '#8778BB'
      return { backgroundColor: color }
    },
    async showReadme() {
      this.myState.readme = ''
      const readme = 'readme.md'
      if (this.myState.files.map(f => f.toLocaleLowerCase()).indexOf(readme) > -1) {
        if (!this.myState.svnRoot) return
        const text = await this.myState.svnRoot.getFileText(this.myState.subfolder + '/' + readme)
        this.myState.readme = this.mdRenderer.render(text)
      }
    },

    buildShowEverythingView() {
      // loop on each viz type
      for (const viz of this.globalState.visualizationTypes.values()) {
        // filter based on file matching
        const matches = micromatch(this.myState.files, viz.filePatterns)
        for (const file of matches) {
          // add thumbnail for each matching file
          this.myState.vizes.push({ component: viz.kebabName, config: file, title: '..' })
        }
      }
    },

    clickedOnFolder(props: { root: string }) {
      // if (this.myState.isLoading) return

      const rootPage = {
        component: 'TabbedDashboardView',
        props: {
          root: props.root,
          xsubfolder: '',
        },
      }

      this.$emit('navigate', rootPage)
      return
    },

    dragEnd() {
      this.$emit('isDragging', false)
    },

    dragStart(event: DragEvent, item: any) {
      this.$emit('isDragging', true)

      const bundle = Object.assign({}, item, {
        root: this.root,
        subfolder: this.myState.subfolder,
        xsubfolder: this.myState.subfolder,
      }) as any

      bundle.yamlConfig = bundle.config
      delete bundle.config

      const text = JSON.stringify(bundle) as any
      event.dataTransfer?.setData('bundle', text)
    },

    clickedLogo() {
      this.$router.push('/')
    },

    async findAllConfigsAndDashboards() {
      if (!this.myState.svnRoot) return { dashboards: {}, configs: {}, vizes: {}, topsheets: {} }

      let loadErrorMessage = ''

      try {
        const { files } = await this.myState.svnRoot.getDirectory(this.subfolder)

        // if folder has .nodashboards, then skip all dashboards!
        let showDashboards = true
        NO_DASHBOARDS.forEach(filename => {
          if (files.indexOf(filename) > -1) {
            showDashboards = false
          }
        })

        const allConfigs = await this.myState.svnRoot.findAllYamlConfigs(this.subfolder)

        // force hide dashboards if user has a .nodashboards file
        if (!showDashboards) allConfigs.dashboards = {}
        return allConfigs
      } catch (e) {
        // console.error('' + e)
        return { dashboards: {}, configs: {}, vizes: {}, topsheets: {} }
        // throw Error('' + e)
      }
    },

    async clickedBrowseChromeLocalFolder(row: { key: string; handle: any }) {
      try {
        const status = await row.handle.requestPermission({ mode: 'read' })
        console.log(row.handle, status)

        if (status !== 'granted') return

        // if first time, add its key to the fileSystemConfig
        const exists = fileSystems.find(f => f.slug == row.key)
        if (!exists) addLocalFilesystem(row.handle, row.key)

        const props = { root: row.key } as any
        this.clickedOnFolder(props)
      } catch (e) {
        console.error('' + e)
      }
    },

    async showChromeDirectory() {
      try {
        const FileSystemDirectoryHandle = window.showDirectoryPicker()
        const dir = await FileSystemDirectoryHandle
        const slug = addLocalFilesystem(dir, null) // no key yet
        this.$router.push(`${BASE_URL}${slug}/`)
      } catch (e) {
        // shrug
      }
    },

    async clickedLocalDelete(row: { key: string; handle: any }) {
      const handles = this.$store.state.localFileHandles
      // just filter out the key I guess?
      const filtered = handles.filter((f: any) => f.key !== row.key)

      // and save it everywhere
      await set('fs', filtered)
      this.$store.commit('setLocalFileSystem', filtered)
    },

    async clickedDataSourceDelete(project: { slug: string }) {
      console.log({ project })
      // const handles = this.$store.state.localFileHandles
      // // just filter out the key I guess?
      this.$store.commit('removeURLShortcut', project.slug)
      // const filtered = handles.filter((f: any) => f.key !== row.key)

      // // and save it everywhere
      // await set('fs', filtered)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
.panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  user-select: none;
  font-size: 0.9rem;
  color: #eee;
  background: linear-gradient(150deg, #2e3f5a, #0c2f23);
  border-radius: 0px;
}

.top-panel {
  display: flex;
  flex-direction: column;
  // margin: 0 16px;
}

h4 {
  background-color: #00000080;
  text-transform: uppercase;
  padding: 4px 0.5rem 5px 0.5rem;
  font-size: 1rem;
  font-weight: bold;
  text-transform: uppercase;
}

.middle-panel,
.bottom-panel {
  display: flex;
  flex-direction: column;
  padding: 0 0rem 0.5rem 0;
  overflow-y: auto;
  text-align: left;
  user-select: none;
  margin-left: 0.75rem;

  p,
  a {
    max-width: 100%;
    overflow-wrap: break-word;
  }
}

.bottom-panel {
  margin-right: 0.5rem;
}

h2 {
  font-size: 1.8rem;
}

.fade {
  opacity: 0.4;
  pointer-events: none;
}

.fa-arrow-up {
  margin-right: 2px;
}

.project-root {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.25rem;
  padding: 1px 0 1px 4px;
  border-left: 2px solid #00000000; // #989898;
  color: #ddd;
  opacity: 0.85;

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

// .project-root.local {
//   // border-left: 2px solid $matsimBlue;
// }

.project-root:hover {
  cursor: pointer;
  // background-color: #383e46;
  opacity: 1;
  color: white;
  transition: background-color 0.1s ease-in-out;
  border-left: 2px solid var(--sliderThumb);
}

.project-root:hover .root {
  color: $yellowHighlight;
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

  p {
    padding-bottom: 0.5rem;
    text-align: center;
  }
}

.config-sources {
  margin-left: 0.5rem;
  margin-top: 0.75rem;
  font-size: 0.75rem;
  a {
    padding: 0.25rem 0.4rem;
    border: 1px solid #ccc;
    border-radius: 4px;
    color: var(--textLink);
  }

  a:hover {
    border: 1px solid #778;
  }
}

.config-sources a:hover {
  cursor: pointer;
  color: var(--linkHover);
}

.highlighted {
  background-color: var(--bgHover);
}

.add-folder {
  margin-top: 1rem;
}

.fa-times {
  opacity: 0;
  float: right;
  padding: 1px 1px;
}

.fa-times:hover {
  color: red;
}

.fa-times:active {
  color: darkred;
}

.project-root:hover .fa-times {
  opacity: 0.45;
  color: white;
}

.project-root:hover .fa-times:hover {
  opacity: 1;
  color: #f44;
}

.logo {
  margin: 1.5rem auto 0.5rem auto;
}

.logo:hover {
  color: var(--linkHover);
  cursor: pointer;
}

// hello

.items {
  margin-left: 0.75rem;
  margin-right: 0.25rem;

  a {
    color: #ccc;
  }
  a:hover {
    color: $yellowHighlight;
  }
}

.simwrapper-logo {
  max-width: 120px;
  opacity: 0.85;
  margin: 1rem auto 0.5rem 0;
}

.simwrapper-logo:hover {
  cursor: pointer;
  opacity: 1;
}

.root {
  font-weight: bold;
  color: #5fe2a7; // $appTag;
}

.description {
  font-size: 0.75rem;
  margin-top: -2px;
}

.open-folder {
  margin-top: 0.5rem;
}

.action-panel {
  grid-column: 2 / 3;
  grid-row: 4 / 5;
  background-color: #48485f;
  margin-top: 0.5rem;
  display: flex;
  flex-direction: row;

  p {
    padding: 2px 0;
    font-size: 0.8rem;
    text-align: center;
    vertical-align: center;
    flex: 1;
  }

  p:hover {
    background-color: #3c3c49;
    color: $yellowHighlight;
    cursor: pointer;
  }
}

.settings-icon {
  border-left: 1px solid #888;
}

h3 {
  font-family: $mainFont;
  font-size: 1rem;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  margin-left: 6px;
  text-transform: uppercase;
}

.actual-error-panel {
  background-color: #28385d;
}

.spacer {
  background-color: $themeColorPale;
  height: 0.5rem;
}

.top-panel {
  display: flex;
  flex-direction: column;
  // margin: 8px 1rem 8px 8px;

  h4 {
    background-color: #060609;
    color: $colorYellow;
    padding: 4px 0.5rem;
    text-align: center;
  }
}
</style>
