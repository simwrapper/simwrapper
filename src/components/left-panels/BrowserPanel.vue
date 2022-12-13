<template lang="pug">
.panel

  .top-panel
    h4 Files

    .trail(v-if="root")
      .x-home
        p(@click="clickedBreadcrumb({url: '//'})")
          i.fa.fa-home

      .x-breadcrumbs(v-if="root")
        p(v-for="crumb,i in globalState.breadcrumbs.slice(1)" :key="crumb.url"
          @click="clickedBreadcrumb(crumb)"
        ) &nbsp;/&nbsp;{{ crumb.label }}

  .middle-panel
      //- Starting point if not in a project root: list all existing roots
      .curated-sections(v-if="!root")

        .hint-clicks(style="margin-bottom: 1rem; opacity: 1")
          p You can browse to another folder from here. Drag panels into the main window area to open them side-by-side.

        .is-chrome(v-if="isChrome")
          h3 Local Folders

          p(v-if="!localFileHandles.length") Chrome & Edge can browse folders directly:
          .project-root.local(v-for="row in localFileHandles" :key="row.key"
            @click="clickedBrowseChromeLocalFolder(row)")

            h5.remove-local(style="flex: 1;") {{ row.handle.name}}
              i.fa.fa-times(@click.stop="clickedDelete(row)")
            p Local folder

          p.config-sources: a(@click="showChromeDirectory") Add local folder...

        h3(style="margin-top: 1rem") Data Sources

        .project-root(v-for="project in allRoots" :key="project.slug"
          @click="clickedOnFolder({root: project.slug})"
        )
          h5 {{ project.name }}
          p {{ project.description }}

        p.config-sources: a(@click="configureSources") Edit data sources...

      //- Starting point if in a project folder: -------------------------
      .curated-sections(v-else)

        h3.curate-heading {{ globalState.breadcrumbs[globalState.breadcrumbs.length - 1].label }}

        .curate-content(v-if="myState.folders.length")
          .folder-table
            .folder(v-for="folder,i in myState.folders" :key="folder"
                :class="{fade: myState.isLoading, upfolder: i == 0}"
                @click="clickedOnFolder({folder, i})")
              i.fa(:class="i == 0 ? 'fa-arrow-up' : 'fa-folder-open'")
              p {{ cleanName(folder) }}

          p(v-if="myState.folders.length==1" style="font-size: 0.9rem; opacity: 0.7; margin: 0.5rem 0; text-align: right") No subfolders.

        //- MAPS: thumbnails of each viz map here
        .section-maps(v-if="vizMaps.size")

          h3.curate-heading {{ $t('Maps')}}
          .curate-content
            .viz-table
              .viz-grid-item(
                v-for="[index, viz] of vizMaps.entries()" :key="index"
                @click="clickedVisualization(index)"
              )
                .viz-frame(
                  :class="{highlighted: index === highlightedViz }"
                  draggable
                  @dragstart="dragStart($event, viz)"
                  @dragend="dragEnd"
                )
                  p.v-title: b {{ viz.title }}
                  p.v-filename {{ viz.config }}
                  p.v-plugin(:style="getTabColor(viz.component)") {{ viz.component || 'dashboard' }}

                  component.viz-frame-component(
                        v-show="false"
                        :is="viz.component"
                        :root="myState.svnProject.slug"
                        :subfolder="myState.subfolder"
                        :yamlConfig="viz.config"
                        :thumbnail="true"
                        :fileApi="myState.svnRoot"
                        :style="{'pointer-events': 'none'}"
                        @title="updateTitle(index, $event)")

            .hint-clicks(:style="{opacity : needDoubleClickHint ? 1 : 0}")
              p
                b Drag
                | &nbsp;or&nbsp;
                b double-click
                | &nbsp;a tile
                br
                | to open it in the main panel

        //- IMAGES here
        .section-images(v-if="Object.keys(vizImages).length")
          h3.curate-heading {{ $t('Images')}}
          .curate-content
            .viz-image-table
              .viz-image-grid-item(v-for="[index, viz] of Object.entries(vizImages)" :key="index"
                        @click="clickedVisualization(index)")

                .viz-image-frame
                  component.viz-image-frame-component(
                        :is="viz.component"
                        :root="myState.svnProject.slug"
                        :subfolder="myState.subfolder"
                        :yamlConfig="viz.config"
                        :thumbnail="true"
                        :fileApi="myState.svnRoot"
                        :style="{'pointer-events': 'auto'}"
                        @title="updateTitle(index, $event)")
                  p {{ viz.title }}


  //- .bottom-panel(v-if="!root")

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
import yaml from 'yaml'

import globalStore from '@/store'
import { BreadCrumb, FileSystemConfig, YamlConfigs } from '@/Globals'
import plugins from '@/plugins/pluginRegistry'
import fileSystems, { addLocalFilesystem } from '@/fileSystemConfig'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import TopsheetsFinder from '@/components/TopsheetsFinder/TopsheetsFinder.vue'
import FileSystemProjects from '@/components/FileSystemProjects.vue'
import AddDataSource from './AddDataSource.vue'

const components = Object.assign({ AddDataSource, FileSystemProjects, TopsheetsFinder }, plugins)

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
    this.setupHints()
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
      this.fetchFolderContents()
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
    hasDashboards(): boolean {
      return !!Object.keys(this.allConfigFiles.dashboards).length
      // const d = /^dashboard.*ml/
      // for (const viz of this.myState.files) {
      //   if (d.test(viz)) return true
      // }
      // return false
    },

    vizImages() {
      const images: { [index: number]: any } = {}
      for (let i = 0; i < this.myState.vizes.length; i++) {
        if (this.myState.vizes[i].component === 'image-view') {
          images[i] = this.myState.vizes[i]
        }
      }
      return images
    },

    vizMaps() {
      const skipList = ['image-view', 'dashboard']
      const maps = new Map()

      // Dashboards first
      if (this.hasDashboards) {
        maps.set(-1, {
          component: '',
          title: 'Dashboard Panel',
        })
      }

      // Then vizes
      for (let i = 0; i < this.myState.vizes.length; i++) {
        if (!skipList.includes(this.myState.vizes[i].component)) {
          maps.set(i, this.myState.vizes[i])
        }
      }

      return maps
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
      this.myState.svnRoot = new HTTPFileSystem(this.myState.svnProject)

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

      this.showReadme()

      this.myState.summary = this.myState.files.indexOf(this.summaryYamlFilename) !== -1

      if (this.myState.summary) {
        await this.buildCuratedSummaryView()
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

    setupHints() {
      // if user has seen the hints a few times, drop them
      let hints: any = localStorage.getItem('needsClickHint')
      if (hints) {
        hints = JSON.parse(hints) as number
      } else {
        hints = 0
      }

      if (hints > 5000) {
        this.needDoubleClickHint = false
      } else {
        hints++
        localStorage.setItem('needsClickHint', JSON.stringify(hints))
      }
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

    activateVisualization(vizNumber: number) {
      // if this is not a valid viz, just open the file/dashboard browser
      const viz = this.myState.vizes[vizNumber] || {
        component: 'TabbedDashboardView',
        title: 'Dashboard',
      }

      // special case: images don't click thru
      if (viz.component === 'image-view') return

      if (!this.myState.svnProject) return

      this.highlightedViz = -2

      const cleanSubfolder = this.myState.subfolder.replaceAll('//', '/')
      const props = {
        root: this.myState.svnProject.slug,
        xsubfolder: cleanSubfolder,
        subfolder: cleanSubfolder,
        yamlConfig: viz.config,
        thumbnail: false,
      }

      this.$emit('navigate', { component: viz.component, props })
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

        // Bad things happened! Tell user
        // const e = err as any
        // console.log('BAD PAGE')
        // console.log({ eeee: e })

        // this.myState.folders = []
        // this.myState.files = []

        // this.myState.errorStatus = '<h3>'
        // if (e.status) this.myState.errorStatus += `${e.status} `
        // if (e.statusText) this.myState.errorStatus += `${e.statusText}`
        // if (this.myState.errorStatus === '<h3>') this.myState.errorStatus += 'Error'
        // this.myState.errorStatus += `</h3>`
        // if (e.url) this.myState.errorStatus += `<p>${e.url}</p>`
        // if (e.message) this.myState.errorStatus += `<p>${e.message}</p>`
        // if (this.myState.errorStatus === '<h3>Error</h3>') this.myState.errorStatus = '' + e

        // if (this.myState.svnProject) {
        //   this.myState.errorStatus += `<p><i>${this.myState.svnProject.baseURL}${this.myState.subfolder}</i></p>`
        // }

        // // maybe it failed because password?
        // if (this.myState.svnProject && this.myState.svnProject.needPassword && e.status === 401) {
        //   globalStore.commit('requestLogin', this.myState.svnProject.slug)
        // }
      } finally {
        this.myState.isLoading = false
      }
    },

    clickedVisualization(index: number) {
      // (props: { folder: string; i: number; root: string }) {
      if (this.myState.isLoading) return

      const DBL_CLICK_DELAY = 450

      this.highlightedViz = index

      this.clicks++
      if (this.clicks === 1) {
        // start timer to see if we get a second click
        this.clickTimer = setTimeout(() => {
          // nothing to do, just un-double click
          // this.handleSingleClickFolder(props)
          this.needDoubleClickHint = true
          this.clicks = 0
          // this.highlightedViz = -1
        }, DBL_CLICK_DELAY)
      } else {
        // got a second click in time!
        clearTimeout(this.clickTimer)
        this.needDoubleClickHint = false
        this.activateVisualization(index)
        // do my double-click thing here
        this.clicks = 0
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

      this.subfolder = `${this.subfolder}/${folder}`
    },

    handleSingleClickFolder(xprops: { folder: string; i: number; root: string }) {
      const { folder, root, i } = xprops

      if (root) {
        this.root = root
        this.subfolder = ''
        this.updateRoute()
        return
      }

      if (this.myState.isLoading) return
      if (!this.myState.svnProject) return

      if (i == 0 && folder === 'UP') return

      const target =
        folder === '..'
          ? this.myState.subfolder.substring(0, this.myState.subfolder.lastIndexOf('/'))
          : this.myState.subfolder + '/' + folder

      const props = {
        root: this.myState.svnProject.slug,
        xsubfolder: target,
      }

      // if we are at top of hierarchy, jump to splashpage
      if (!target && !this.myState.subfolder) {
        this.$emit('navigate', { component: 'SplashPage', props: {} })
      } else {
        this.$emit('navigate', { component: 'TabbedDashboardView', props })
      }
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
        console.error('' + e)
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

    async clickedDelete(row: { key: string; handle: any }) {
      const handles = this.$store.state.localFileHandles
      // just filter out the key I guess?
      const filtered = handles.filter((f: any) => f.key !== row.key)

      // and save it everywhere
      await set('fs', filtered)
      this.$store.commit('setLocalFileSystem', filtered)
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
  padding-top: 0.25rem;
  user-select: none;
  font-size: 0.9rem;
  color: var(--text);
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
  margin-bottom: 0rem;
  padding: 0 1rem;
  overflow-y: auto;
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
  background-color: var(--bgMapPanel);
  color: var(--text);
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
  background-color: var(--bgHover);
  // box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.08), 0 3px 10px 0 rgba(0, 0, 0, 0.08);
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

.viz-image-grid-item {
  z-index: 1;
  text-align: center;
  margin: 0 0;
  padding: 0 0;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  vertical-align: top;
  background-color: var(--bgBold);
  border: var(--borderThin);
  border-radius: 16px;
}

.viz-image-frame {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: $thumbnailHeight;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  p {
    margin: 0 0 0 0;
    background-color: var(--bgBold);
    font-weight: bold;
    line-height: 1.2rem;
    padding: 1rem 0.5rem;
    color: var(--text);
    word-wrap: break-word;
    /* Required for text-overflow to do anything */
    // text-overflow: ellipsis;
    // white-space: nowrap;
    // overflow: hidden;
  }
}

.viz-image-frame:hover {
  box-shadow: var(--shadowMode);
  transition: box-shadow 0.1s ease-in-out;
}

.viz-image-frame-component {
  background-color: var(--bgPanel);
}

.upfolder {
  background-color: var(--bgBold);
}

.fa-arrow-up {
  margin-right: 2px;
}

.project-root {
  display: flex;
  flex-direction: column;
  margin-top: 0.75rem;
  padding: 0.5rem 0.5rem;
  background-color: var(--bgMapPanel);
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
  background-color: var(--bgHover);
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

  p {
    padding-bottom: 0.5rem;
    text-align: center;
  }

  b {
    color: var(--textFancy);
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
  // color: var(--link);
  p:hover {
    color: var(--linkHover);
    cursor: pointer;
  }
}

.x-breadcrumbs {
  flex: 1;
  display: flex;
  flex-flow: row wrap;
  line-height: 1.2rem;
  max-width: 100%;
  margin-top: 2px;

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
