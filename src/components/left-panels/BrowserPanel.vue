<template lang="pug">
.panel

  .top-panel
    .trail
      .x-home
        p(@click="clickedBreadcrumb({url: '//'})")
          i.fa.fa-home

      .x-breadcrumbs(v-if="root")
        p(v-for="crumb,i in globalState.breadcrumbs.slice(1)" :key="crumb.url"
          @click="clickedBreadcrumb(crumb)"
        ) &nbsp;/&nbsp;{{ crumb.label }}

    .logo.flex-row(v-if="!root"
      style="margin: 0.5rem auto 0.5rem auto;"
      @click="clickedLogo"
    )
      img(v-if="globalState.isDarkMode" src="@/assets/simwrapper-logo/SW_logo_icon_yellow.png" width="24")
      img(v-else src="@/assets/simwrapper-logo/SW_logo_icon_purple.png" width="24")
      h2(style="margin-left: 0.5rem") SimWrapper


  .middle-panel
      //- Starting point if not in a project root: list all existing roots
      .curated-sections(v-if="!root")

        .hint-clicks(style="margin-bottom: 1rem; opacity: 1")
          p Welcome to SimWrapper, the data exploration platform from TU Berlin.
          p Explore a data source below, or add your own.

        .is-chrome(v-if="isChrome")
          h3 Local Folders:

          p(v-if="!localFileHandles.length") Chrome/Edge can browse folders directly:
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
        .section-maps(v-if="Object.keys(vizMaps).length")
          h3.curate-heading {{ $t('Maps')}}
          .curate-content
            .viz-table
              .viz-grid-item(
                v-for="[index, viz] of Object.entries(vizMaps)" :key="index"
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
                  p.v-plugin(:style="getTabColor(viz.component)") {{ viz.component }}

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
    //- .flex-row.about-us
    //-   p: a(href="https://vsp.berlin/en/" target="_blank") VSP&nbsp;Home
    //-   p: a(href="https://vsp.berlin/impressum/" target="_blank") Impressum
    //-   p: a(@click="showPrivacy") Privacy

</template>

<script lang="ts">
// Typescript doesn't know the Chrome File System API
declare const window: any
const BASE_URL = import.meta.env.BASE_URL

const i18n = {
  messages: {
    en: {
      Maps: 'Maps & Tiles',
      Images: 'Images',
      Analysis: 'Analysis',
      Files: 'Files',
      Folders: 'Folders',
      Topsheet: 'Table',
      privacy:
        'SimWrapper is a client-side app, which means there is no upstream server collecting or storing data.\n\nSimWrapper does not collect, handle or process any data about you while you use the site. SimWrapper does not contain any tracking devices or analytics software. No user cookies are stored or transmitted.',
    },
    de: {
      Maps: 'Karten & Fliesen',
      Images: 'Bilder',
      Analysis: 'Ergebnisse',
      Files: 'Dateien',
      Folders: 'Ordner',
      Topsheet: 'Tabelle',
    },
  },
}

const tabColors = {
  'aggregate-od': '#E98B52',
  'calc-table': '#2EA95B',
  'carrier-viewer': '#c97A2C',
  'link-view': '#6956d4',
  'map-view': '#c94264',
  'sankey-diag': '#D8A672',
  'transit-view': '#3B6FE4',
  'vehicle-anim': '#330033',
  'x-y-t': '#583270',
  'xy-hex': '#900564',
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

import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
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

const allComponents = Object.assign({ AddDataSource, FileSystemProjects, TopsheetsFinder }, plugins)
@Component({
  i18n,
  components: allComponents,
})
export default class VueComponent extends Vue {
  // @Prop({ required: false }) private xsubfolder!: string
  // @Prop({ required: true }) private root!: string
  // @Prop({ required: true }) private allConfigFiles!: YamlConfigs

  private globalState = globalStore.state

  private subfolder = '/'
  private root = ''

  private needDoubleClickHint = false

  private allConfigFiles: YamlConfigs = { dashboards: {}, topsheets: {}, vizes: {}, configs: {} }

  private allRoots: FileSystemConfig[] = []

  @Watch('globalState.svnProjects') updateShortcuts() {
    const roots = this.globalState.svnProjects.filter(
      source => !source.hidden && !source.slug.startsWith('fs')
    )

    this.allRoots = roots
  }

  private mdRenderer = new markdown({
    html: true,
    linkify: true,
    typographer: true,
  })

  private myState: IMyState = {
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
  }

  private get vizImages() {
    const images: { [index: number]: any } = {}
    for (let i = 0; i < this.myState.vizes.length; i++) {
      if (this.myState.vizes[i].component === 'image-view') {
        images[i] = this.myState.vizes[i]
      }
    }
    return images
  }

  private get vizMaps() {
    const maps: { [index: number]: any } = {}
    for (let i = 0; i < this.myState.vizes.length; i++) {
      if (this.myState.vizes[i].component !== 'image-view') {
        maps[i] = this.myState.vizes[i]
      }
    }
    return maps
  }

  private cleanName(text: string) {
    return decodeURIComponent(text)
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )

    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }

    return svnProject[0]
  }

  private generateBreadcrumbs() {
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
  }

  private mounted() {
    this.setupHints()
    this.updateShortcuts()

    this.getRootAndRoute(this.$route.params.pathMatch)
  }

  private setupHints() {
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
  }

  private clickedBreadcrumb(crumb: { url: string }) {
    this.getRootAndRoute(crumb.url.slice(1)) // drop leading slash
  }

  private getRootAndRoute(pathMatch: string | undefined) {
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
    let root = pathMatch
    let subfolder = ''
    const slash = pathMatch.indexOf('/')
    if (slash > -1) {
      root = pathMatch.substring(0, slash)
      subfolder = pathMatch.substring(slash + 1)
    }
    this.root = root
    this.subfolder = subfolder
  }

  private highlightedViz = -1

  private activateVisualization(vizNumber: number) {
    const viz = this.myState.vizes[vizNumber]

    // special case: images don't click thru
    if (viz.component === 'image-view') return

    if (!this.myState.svnProject) return

    this.highlightedViz = -1

    const cleanSubfolder = this.myState.subfolder.replaceAll('//', '/')
    const props = {
      root: this.myState.svnProject.slug,
      xsubfolder: cleanSubfolder,
      subfolder: cleanSubfolder,
      yamlConfig: viz.config,
      thumbnail: false,
    }

    this.$emit('navigate', { component: viz.component, props })
  }

  private updateTitle(viz: number, title: string) {
    this.myState.vizes[viz].title = title
  }

  private configureSources() {
    this.$emit('activate', { name: 'Settings', class: 'SettingsPanel' })
  }

  private getTabColor(kebabName: string) {
    const color = tabColors[kebabName] || '#8778BB'
    return { backgroundColor: color }
  }

  @Watch('globalState.colorScheme') swapColors() {
    // medium-zoom freaks out if color theme is swapped.
    // so let's reload images just in case.
    this.fetchFolderContents()
  }

  // @Watch('$route') handleRouteChanged() {
  //   console.log(77, this.$route)
  //   this.getRootAndRoute(this.$route.params.pathMatch)
  //   this.updateRoute()
  // }

  @Watch('allConfigFiles')
  @Watch('subfolder')
  private updateRoute() {
    if (!this.root) return

    const svnProject = this.getFileSystem(this.root)

    this.myState.svnProject = svnProject
    this.myState.subfolder = this.subfolder || ''
    this.myState.readme = ''
    this.highlightedViz = -1

    if (!this.myState.svnProject) return
    this.myState.svnRoot = new HTTPFileSystem(this.myState.svnProject)

    this.generateBreadcrumbs()

    // this happens async
    this.fetchFolderContents()
  }

  @Watch('globalState.authAttempts') authenticationChanged() {
    console.log('AUTH CHANGED - Reload')
    this.updateRoute()
  }

  @Watch('myState.files') async filesChanged() {
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
  }

  private async showReadme() {
    this.myState.readme = ''
    const readme = 'readme.md'
    if (this.myState.files.map(f => f.toLocaleLowerCase()).indexOf(readme) > -1) {
      if (!this.myState.svnRoot) return
      const text = await this.myState.svnRoot.getFileText(this.myState.subfolder + '/' + readme)
      this.myState.readme = this.mdRenderer.render(text)
    }
  }

  private summaryYamlFilename = 'viz-summary.yml'

  private buildShowEverythingView() {
    // loop on each viz type
    for (const viz of this.globalState.visualizationTypes.values()) {
      // filter based on file matching
      const matches = micromatch(this.myState.files, viz.filePatterns)
      for (const file of matches) {
        // add thumbnail for each matching file
        this.myState.vizes.push({ component: viz.kebabName, config: file, title: '..' })
      }
    }
  }

  // Curate the view, if viz-summary.yml exists
  private async buildCuratedSummaryView() {
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
  }

  private async findMatchingFiles(glob: string): Promise<string[]> {
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
  }

  private async fetchFolderContents() {
    if (!this.myState.svnRoot) return []

    this.myState.isLoading = true
    this.myState.errorStatus = ''
    this.myState.files = []

    try {
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
  }

  // we have really weird double-clicks; we want the single click to pass thru
  // after a long delay. so this is how we do it
  private clicks = 0
  private clickTimer: any

  private clickedVisualization(index: number) {
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
  }

  private clickedOnFolder(props: { folder: string; i: number; root: string }) {
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
  }

  private handleSingleClickFolder(xprops: { folder: string; i: number; root: string }) {
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
  }

  private dragEnd() {
    this.$emit('isDragging', false)
  }

  private dragStart(event: DragEvent, item: any) {
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
  }

  private clickedLogo() {
    this.$router.push('/')
  }

  // -- BEGIN Chrome File System Access API support
  private get isChrome() {
    return !!window.showDirectoryPicker
  }

  private get localFileHandles() {
    // sort a copy of the array so we don't get an infinite loop
    return this.$store.state.localFileHandles
      .concat()
      .sort((a: any, b: any) =>
        parseInt(a.key.substring(2)) < parseInt(b.key.substring(2)) ? -1 : 1
      )
  }

  private async clickedBrowseChromeLocalFolder(row: { key: string; handle: any }) {
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
  }

  private async showChromeDirectory() {
    try {
      const FileSystemDirectoryHandle = window.showDirectoryPicker()
      const dir = await FileSystemDirectoryHandle
      const slug = addLocalFilesystem(dir, null) // no key yet
      this.$router.push(`${BASE_URL}${slug}/`)
    } catch (e) {
      // shrug
    }
  }

  private async clickedDelete(row: { key: string; handle: any }) {
    const handles = this.$store.state.localFileHandles
    // just filter out the key I guess?
    const filtered = handles.filter((f: any) => f.key !== row.key)

    // and save it everywhere
    await set('fs', filtered)
    this.$store.commit('setLocalFileSystem', filtered)
  }
  // - END Chrome File System Access API support
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
  font-size: 0.9rem;
  color: var(--text);
}

.top-panel {
  display: flex;
  flex-direction: column;
  margin: 0.25rem 0.5rem 1rem 0.5rem;
}

h4 {
  background-color: #00000040;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
  font-weight: bold;
  // text-transform: uppercase;
}

.middle-panel,
.bottom-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  // width: 100%;
  margin-bottom: 0rem;
  padding: 0 0.5rem 0rem 0.5rem;
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
  vertical-align: top;
  background-color: var(--bgMapPanel);
  // border: var(--borderThin);
  border-radius: 2px;
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
  margin: 0.75rem 0 0 0;
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

.about-us {
  margin: 0 auto;
  overflow-x: none;
  p {
    margin: 0.5rem 1rem 0.5rem 0;
  }
  a {
    font-size: 0.9rem;
    color: var(--text);
  }
  a:hover {
    color: var(--linkHover);
  }
}

.viz-frame {
  display: flex;
  flex-direction: column;
  position: relative;
  z-index: 1;
  flex: 1;
  overflow: hidden;
  padding: 4px 0 0 4px;
  border-radius: 4px;
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
  border-radius: 5px;
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
  text-transform: uppercase;
  margin-left: auto;
  color: white;
  background-color: var(--bgCream3);
  padding: 2px 3px;
  border-radius: 0 0 4px 0;
}

.trail {
  display: flex;
  width: 100%;

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

.logo:hover {
  color: var(--linkHover);
  cursor: pointer;
}
</style>
