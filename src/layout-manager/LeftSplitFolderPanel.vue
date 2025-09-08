<template lang="pug">
.panel

  .top-panel
    h4
      i.fas.fa-columns
      span &nbsp; Split View

    .trail(v-if="root")
      .x-home
        p(@click="clickedBreadcrumb({url: '//'})")
          i.fa.fa-home

      .x-breadcrumbs(v-if="root")
        p(v-for="crumb,i in globalState.breadcrumbs.slice(1)" :key="crumb.url"
          @click="clickedBreadcrumb(crumb)"
          @dragstart="dragBreadCrumb($event, crumb.url)"
          @dragend="dragEnd"
          draggable
        ) &nbsp;&bullet;&nbsp;{{ crumb.label }}

  .middle-panel

      .hint-clicks(style="margin-bottom: 1rem; opacity: 1")
          p
            b Drag a folder&nbsp;
            | from here to the main window area to open side&#8209;by&#8209;side.



      //- Starting point if not in a project root: list all existing roots
      .curated-sections(v-if="!root")

        .is-chrome(v-if="isChrome")
          h3 Local Folders

          p(v-if="!localFileHandles.length") Chrome & Edge can browse folders directly:
          .project-root.local(v-for="row in localFileHandles" :key="row.key"
            @click="clickedBrowseChromeLocalFolder(row)"
            @dragstart="dragStart($event, row.slug)"
            @dragend="dragEnd"
            draggable
          )

            h5.remove-local(style="flex: 1;") {{ row.handle.name}}
            p Local folder

          p.config-sources: a(@click="showChromeDirectory") Add local folder...

        h3(style="margin-top: 1rem") Data Sources

        .project-root(v-for="project in allRoots" :key="project.slug"
          @click="clickedOnFolder({root: project.slug})"
          @dragstart="dragStart($event, project.slug)"
          @dragend="dragEnd"
          draggable
        )
          h5 {{ project.name }}
          p {{ project.description }}


      //- Starting point if in a project folder: -------------------------
      .curated-sections(v-else)

        h3.curate-heading(
          @dragstart="dragStart($event, subfolder)"
          @dragend="dragEnd"
          draggable
        ) {{ globalState.breadcrumbs[globalState.breadcrumbs.length - 1].label }}

        .curate-content(v-if="myState.folders.length")

          .folder-table

            .folder(v-for="folder,i in myState.folders" :key="folder"
              :class="{fade: myState.isLoading, upfolder: i == 0}"
              @dragstart="dragStart($event, `${myState.subfolder}/${folder}`)"
              @dragend="dragEnd"
              @click="clickedOnFolder({folder, i})"
              draggable
            )
              i.fa(:class="i == 0 ? 'fa-arrow-up' : 'fa-folder-open'")
              p {{ cleanName(folder) }}

          p(v-if="myState.folders.length==1" style="font-size: 0.9rem; opacity: 0.7; margin: 0.5rem 0; text-align: right") No subfolders.

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
import markdown from 'markdown-it'
import micromatch from 'micromatch'
import yaml from 'yaml'

import globalStore from '@/store'
import { BreadCrumb, FileSystemConfig, YamlConfigs } from '@/Globals'
import { pluginComponents } from '@/plugins/pluginRegistry'
import fileSystems, { addLocalFilesystem } from '@/fileSystemConfig'
import HTTPFileSystem from '@/js/HTTPFileSystem'

import TopsheetsFinder from '@/components/TopsheetsFinder/TopsheetsFinder.vue'
import FileSystemProjects from '@/components/FileSystemProjects.vue'

const components = Object.assign({ FileSystemProjects, TopsheetsFinder }, pluginComponents)

export default defineComponent({
  name: 'BrowserPanel',
  i18n,
  components,
  data: () => {
    return {
      globalState: globalStore.state,
      subfolder: '/',
      root: '',
      summaryYamlFilename: 'viz-summary.yml',
      highlightedViz: -2, // -2:none, -1: dashboard, 0-x: tile
      needDoubleClickHint: false,
      allConfigFiles: { dashboards: {}, topsheets: {}, vizes: {}, configs: {} } as YamlConfigs,
      allRoots: [] as FileSystemConfig[],
      mdRenderer: new markdown({ html: true, linkify: true, typographer: true }),
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
      // we have really weird double-clicks; we want the single click to pass thru
      // after a long delay. so this is how we do it
      clicks: 0,
      clickTimer: {} as any,
    }
  },
  mounted() {
    this.updateShortcuts()
    this.getRootAndRoute(this.$route.params.pathMatch)
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
      this.updateRoute()
    },
    'globalState.authAttempts'() {
      this.authenticationChanged()
    },
    'myState.files'() {
      this.filesChanged()
    },
  },
  computed: {
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
  },
  methods: {
    updateRoute() {
      if (!this.root) return

      const svnProject = this.getFileSystem(this.root)

      this.myState.svnProject = svnProject
      this.myState.subfolder = this.subfolder || ''
      this.myState.readme = ''
      this.highlightedViz = -2

      if (!this.myState.svnProject) return

      this.myState.svnRoot = new HTTPFileSystem(this.myState.svnProject, globalStore)

      this.generateBreadcrumbs()

      // this happens async
      this.fetchFolderContents()
    },

    authenticationChanged() {
      console.log('AUTH CHANGED - Reload')
      this.updateRoute()
    },

    async filesChanged() {
      // clear visualizations
      this.myState.vizes = []
      if (this.myState.files.length === 0) return

      this.myState.summary = this.myState.files.indexOf(this.summaryYamlFilename) !== -1

      if (this.myState.summary) {
        await this.buildCuratedSummaryView()
      } else {
        this.buildShowEverythingView()
      }
    },

    updateShortcuts() {
      const roots = this.globalState.svnProjects.filter(
        source => !source.hidden && !source.slug.startsWith('fs')
      )

      this.allRoots = roots
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

    generateBreadcrumbs() {
      if (!this.myState.svnProject) return []

      const crumbs = [
        {
          label: 'SimWrapper',
          url: '/',
        },
        {
          label: this.myState.svnProject.name,
          url: '/' + this.myState.svnProject.slug,
        },
      ]

      const subfolders = this.myState.subfolder.split('/')
      let buildFolder = '/'
      for (const folder of subfolders) {
        if (!folder) continue

        buildFolder += folder + '/'
        crumbs.push({
          label: folder,
          url: '/' + this.myState.svnProject.slug + buildFolder,
        })
      }

      // save them!
      globalStore.commit('setBreadCrumbs', crumbs)
      return crumbs
    },

    clickedBreadcrumb(crumb: { url: string }) {
      this.getRootAndRoute(crumb.url.slice(1)) // drop leading slash
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

    configureSources() {
      this.$emit('activate', { name: 'Settings', class: 'SettingsPanel' })
    },

    getTabColor(kebabName: string) {
      const color = tabColors[kebabName] || '#8778BB'
      return { backgroundColor: color }
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

    // Curate the view, if viz-summary.yml exists
    async buildCuratedSummaryView() {
      if (!this.myState.svnRoot) return

      const summaryYaml = yaml.parse(
        await this.myState.svnRoot.getFileText(
          this.myState.subfolder + '/' + this.summaryYamlFilename
        )
      )

      // loop on each curated viz type
      for (const vizName of summaryYaml.plugins) {
        // load plugin user asked for
        const viz = this.globalState.visualizationTypes.get(vizName)
        if (!viz) continue

        // curate file list if provided for this plugin
        if (summaryYaml[viz.kebabName]) {
          for (const pattern of summaryYaml[viz.kebabName]) {
            // add thumbnail for each matching file
            const matches = await this.findMatchingFiles(pattern)
            for (const file of matches) {
              this.myState.vizes.push({ component: viz.kebabName, config: file, title: file })
            }
          }
        } else {
          // filter based on file matching
          const matches = micromatch(this.myState.files, viz.filePatterns)
          for (const file of matches) {
            // add thumbnail for each matching file
            this.myState.vizes.push({ component: viz.kebabName, config: file, title: '..' })
          }
        }
      }
    },

    async findMatchingFiles(glob: string): Promise<string[]> {
      // first see if file itself is in this folder
      if (this.myState.files.indexOf(glob) > -1) return [glob]

      // return globs in this folder
      const matches = micromatch(this.myState.files, glob)
      if (matches.length) return matches

      // search subfolder for glob, for now just one subfolder down
      if (!this.myState.svnRoot) return []
      try {
        const split = glob.split('/')
        const subsubfolder = this.myState.subfolder + '/' + split[0]
        console.log(subsubfolder)
        const contents = await this.myState.svnRoot.getDirectory(subsubfolder)
        const matches = micromatch(contents.files, split[1])
        return matches.map(f => split[0] + '/' + f)
      } catch (e) {
        // oh well, we tried
      }

      return []
    },

    async fetchFolderContents() {
      if (!this.myState.svnRoot) return []

      this.myState.isLoading = true
      this.myState.errorStatus = ''
      this.myState.files = []

      try {
        this.allConfigFiles = await this.findAllConfigsAndDashboards()
        const folderContents = await this.myState.svnRoot.getDirectory(this.myState.subfolder)

        // hide dot folders
        const folders = folderContents.dirs.filter(f => !f.startsWith('.')).sort()
        const files = folderContents.files.filter(f => !f.startsWith('.')).sort()

        // Also show any project-level viz thumbnails from other folders
        // (but, ensure that files in this folder supercede any project viz files
        // with the same name)
        const mergedFilesAndVizes = Object.assign({}, this.allConfigFiles.vizes)
        for (const file of files) {
          mergedFilesAndVizes[file] = file
        }

        const allVizes = Object.values(mergedFilesAndVizes)

        this.myState.errorStatus = ''
        this.myState.folders = ['UP'].concat(folders)

        this.myState.files = allVizes
      } catch (err) {
        // First see if we can get the one-up folder
        const parent = this.myState.subfolder.lastIndexOf('/')

        if (parent > -1) {
          // subfolder is @Watched, this triggers a reset:
          this.subfolder = this.myState.subfolder.slice(0, parent)
          return
        } else {
          // top level fail?
          this.subfolder = ''
          return
        }
      } finally {
        this.myState.isLoading = false
      }
    },

    clickedOnFolder(props: { folder: string; i: number; root: string }) {
      this.needDoubleClickHint = false

      const { folder, root, i } = props

      if (root) {
        this.root = root
        this.subfolder = ''
        this.updateRoute()
        return
      }

      if (this.myState.isLoading) return
      if (!this.myState.svnProject) return

      // up button is a non-navigate case: might revisit this
      if (i == 0 && folder === 'UP') {
        if (this.subfolder === '/' || this.subfolder === '') {
          this.root = ''
        } else {
          const lastSlash = this.subfolder.lastIndexOf('/')
          this.subfolder = lastSlash > -1 ? this.subfolder.slice(0, lastSlash) : '/'
        }
        return
      }

      let subfolder = `${this.subfolder}/${folder}`
      if (subfolder.startsWith('/')) subfolder = subfolder.slice(1)
      this.subfolder = subfolder
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

    dragBreadCrumb(event: DragEvent, url: string) {
      let folder = url.startsWith('/') ? url.slice(1) : url
      if (folder.endsWith('/')) folder = folder.slice(0, -1)
      let subfolder = folder.indexOf('/') > -1 ? folder.slice(folder.indexOf('/')) : ''

      this.dragStart(event, subfolder)
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

    // - END Chrome File System Access API support
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  user-select: none;
  font-size: 0.9rem;
  color: #ddd;
  position: absolute;
  background: linear-gradient(150deg, #364980, #0c2f23);
}

.top-panel {
  display: flex;
  flex-direction: column;

  h4 {
    background-color: #060609;
    color: $colorYellow;
    text-transform: uppercase;
    text-align: center;
  }
}

h4 {
  background-color: #00000080;
  text-transform: uppercase;
  padding: 4px 0.5rem 5px 0.5rem;
  margin-bottom: 0.5rem;
  font-size: 1rem;
  font-weight: bold;
  text-transform: uppercase;
  color: #ddd;
}

.middle-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  // width: 100%;
  margin-bottom: 0rem;
  padding: 0 1rem;
  overflow-x: hidden;
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
  display: grid;
  gap: 2px;
  grid-template-columns: repeat(auto-fit, minmax(115px, 1fr));
  list-style: none;
  margin-top: 0.5rem;
  padding-left: 0px;
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: row;
  background-color: #14141a;
  color: #c6c1b9;
  line-height: 1.05rem;
  padding: 3px 4px;
  border-radius: 0;
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
  padding: 0.25rem 0.25rem;

  p {
    text-align: center;
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
  padding: 0 0.5rem;
  p:hover {
    color: var(--linkHover);
    cursor: pointer;
  }
  margin-bottom: 1rem;
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
</style>
