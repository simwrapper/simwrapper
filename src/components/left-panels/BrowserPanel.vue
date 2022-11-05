<template lang="pug">
.panel

  .top-panel
    h4 SimWrapper
    .xbreadcrumbs
      p(@click="clickedBreadcrumb({url: '//'})")
        i.fa.fa-home
        | &nbsp;/&nbsp;
      .has-root(v-if="root")
        p(v-for="crumb,i in globalState.breadcrumbs.slice(1)" :key="crumb.url"
          @click="clickedBreadcrumb(crumb)"
        ) {{ crumb.label }}{{ i < globalState.breadcrumbs.length - 1 ? '&nbsp;/&nbsp;' : ''}}

  .middle-panel
      //- Starting point if not in a project root: list all existing roots
      .curated-sections(v-if="!root")
        h3 Data Sources

        .hint-clicks
          p Explore a data source below, or add a new one

        .project-root(v-for="project in allRoots"
          @click="clickedOnFolder({root: project.slug})"
        )
          h5 {{ project.name }}
          p {{ project.description }}


      .curated-sections(v-else)

        //- file system folders
        h3.curate-heading(v-if="myState.folders.length") {{ $t('Folders') }}

        //- h3
        //-   p(v-for="crumb,i in globalState.breadcrumbs.slice(1)" :key="crumb.url") {{ crumb.label }}{{ i < globalState.breadcrumbs.length - 1 ? '&nbsp;&raquo;&nbsp;' : ''}}

        .hint-clicks
          p
            b Click
            | &nbsp;a folder below to view it in the main panel.
          p
            b Double-click
            | &nbsp;a folder to drill down in this panel.

        .curate-content(v-if="myState.folders.length")
          .folder-table
            .folder(v-for="folder,i in myState.folders" :key="folder"
                :class="{fade: myState.isLoading, upfolder: i == 0}"
                @click="clickedOnFolder({folder, i})")
              i.fa(:class="i == 0 ? 'fa-arrow-up' : 'fa-folder-open'")
              p {{ cleanName(folder) }}

        //- MAPS: thumbnails of each viz map here
        .section-maps(v-if="Object.keys(vizMaps).length")
          h3.curate-heading {{ $t('Maps')}}
          .curate-content
            .viz-table
              .viz-grid-item(v-for="[index, viz] of Object.entries(vizMaps)" :key="index"
                        @click="clickedVisualization(index)")

                .viz-frame
                  p: b {{ viz.title }}
                  p(:style="{'margin-left': 'auto'}") {{ viz.config }}
                  p {{ viz.component }}
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

  .bottom-panel

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      Maps: 'Maps',
      Images: 'Images',
      Analysis: 'Analysis',
      Files: 'Files',
      Folders: 'Folders',
      Topsheet: 'Topsheet',
    },
    de: {
      Maps: 'Karten',
      Images: 'Bilder',
      Analysis: 'Ergebnisse',
      Files: 'Dateien',
      Folders: 'Ordner',
      Topsheet: 'Topsheet',
    },
  },
}

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
import markdown from 'markdown-it'
import mediumZoom from 'medium-zoom'
import micromatch from 'micromatch'
import yaml from 'yaml'

import globalStore from '@/store'
import plugins from '@/plugins/pluginRegistry'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { BreadCrumb, FileSystemConfig, YamlConfigs } from '@/Globals'
import TopsheetsFinder from '@/components/TopsheetsFinder/TopsheetsFinder.vue'
import FileSystemProjects from '@/components/FileSystemProjects.vue'

const allComponents = Object.assign({ FileSystemProjects, TopsheetsFinder }, plugins)
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
  private allRoots = globalStore.state.svnProjects.filter(
    source => !source.hidden && !source.slug.startsWith('fs')
  )

  private allConfigFiles: YamlConfigs = { dashboards: {}, topsheets: {}, vizes: {}, configs: {} }

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
        label: this.myState.svnProject.slug,
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
    this.getRootAndRoute(this.$route.params.pathMatch)
    this.updateRoute()
  }

  private clickedBreadcrumb(crumb: { url: string }) {
    // console.log(crumb)
    this.getRootAndRoute(crumb.url.slice(1)) // drop leading slash
  }

  private getRootAndRoute(pathMatch: string | undefined) {
    // console.log(pathMatch)

    if (!pathMatch) {
      console.log('NOPE')
      return
    }

    // splash page:
    if (pathMatch === '/') {
      console.log('ROOT')
      this.root = ''
      // this.panels = [
      //   {
      //     component: 'SplashPage',
      //     key: Math.random(),
      //     props: {} as any,
      //   },
      // ]
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

  private clickedVisualization(vizNumber: number) {
    const viz = this.myState.vizes[vizNumber]

    // special case: images don't click thru
    if (viz.component === 'image-view') return

    if (!this.myState.svnProject) return

    const props = {
      root: this.myState.svnProject.slug,
      xsubfolder: this.myState.subfolder,
      subfolder: this.myState.subfolder,
      yamlConfig: viz.config,
      thumbnail: false,
    }

    this.$emit('navigate', { component: viz.component, props })
  }

  private updateTitle(viz: number, title: string) {
    this.myState.vizes[viz].title = title
  }

  @Watch('globalState.colorScheme') swapColors() {
    // medium-zoom freaks out if color theme is swapped.
    // so let's reload images just in case.
    this.fetchFolderContents()
  }

  @Watch('subfolder')
  @Watch('allConfigFiles')
  private updateRoute() {
    if (!this.root) return

    const svnProject = this.getFileSystem(this.root)

    this.myState.svnProject = svnProject
    this.myState.subfolder = this.subfolder || ''
    this.myState.readme = ''

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
        this.myState.vizes.push({ component: viz.kebabName, config: file, title: '◆' })
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
          this.myState.vizes.push({ component: viz.kebabName, config: file, title: '◆' })
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
      // Bad things happened! Tell user
      const e = err as any
      console.log('BAD PAGE')
      console.log({ eeee: e })

      this.myState.folders = []
      this.myState.files = []

      this.myState.errorStatus = '<h3>'
      if (e.status) this.myState.errorStatus += `${e.status} `
      if (e.statusText) this.myState.errorStatus += `${e.statusText}`
      if (this.myState.errorStatus === '<h3>') this.myState.errorStatus += 'Error'
      this.myState.errorStatus += `</h3>`
      if (e.url) this.myState.errorStatus += `<p>${e.url}</p>`
      if (e.message) this.myState.errorStatus += `<p>${e.message}</p>`
      if (this.myState.errorStatus === '<h3>Error</h3>') this.myState.errorStatus = '' + e

      if (this.myState.svnProject) {
        this.myState.errorStatus += `<p><i>${this.myState.svnProject.baseURL}${this.myState.subfolder}</i></p>`
      }

      // maybe it failed because password?
      if (this.myState.svnProject && this.myState.svnProject.needPassword && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.svnProject.slug)
      }
    } finally {
      this.myState.isLoading = false
    }
  }

  // we have really weird double-clicks; we want the single click to pass thru
  // after a long delay. so this is how we do it
  private clicks = 0
  private clickTimer: any

  private clickedOnFolder(props: { folder: string; i: number; root: string }) {
    if (this.myState.isLoading) return

    const DBL_CLICK_DELAY = 450

    this.clicks++
    if (this.clicks === 1) {
      // start timer to see if we get a second click
      this.clickTimer = setTimeout(() => {
        // do my thing here
        this.handleSingleClickFolder(props)
        this.clicks = 0
      }, DBL_CLICK_DELAY)
    } else {
      // got a second click in time!
      clearTimeout(this.clickTimer)
      this.handleDoubleClickFolder(props)
      // do my double-click thing here
      this.clicks = 0
    }
  }

  private handleDoubleClickFolder(props: { folder: string; i: number; root: string }) {
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
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
  // text-transform: uppercase;
}

.middle-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  // width: 100%;
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
    font-size: 1rem;
    max-width: 100%;
    overflow-wrap: break-word;
  }
}

.bottom-panel {
  padding: 0 0.5rem 0.25rem 0.5rem;
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
  text-align: center;
  margin: 4px 0;
  padding: 0 0;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  vertical-align: top;
  background-color: var(--bgMapPanel);
  // border: var(--borderThin);
  border-radius: 5px;
}

.viz-frame {
  position: relative;
  z-index: 1;
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: row;

  p {
    margin: auto 0 0 0;
    // background-color: var(--bgBold);
    font-size: 1rem;
    line-height: 1rem;
    padding: 0.8rem 0.8rem;
    color: var(--text);
    word-wrap: break-word;
    /* Required for text-overflow to do anything */
    // text-overflow: ellipsis;
    // white-space: nowrap;
    // overflow: hidden;
  }
}

.viz-frame:hover {
  // box-shadow: var(--shadowMode);
  background-color: var(--bgHover);
  border-radius: 5px;
  transition: background-color 0.02s ease-in-out;
}

.viz-frame-component {
  background-color: var(--bgPanel);
}

.logo {
  margin-left: auto;
}

.folder-table {
  display: grid;
  row-gap: 0rem;
  column-gap: 0.25rem;
  grid-template-columns: repeat(auto-fit, minmax(125px, 1fr));
  list-style: none;
  margin-bottom: 0px;
  padding-left: 0px;
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: row;
  background-color: var(--bg);
  color: var(--text);
  margin: 1px 0;
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
  transition: background-color 0.1s ease-in-out;
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
    margin: auto 0 0 0;
    background-color: var(--bgBold);
    font-size: 1rem;
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

.xbreadcrumbs {
  // background-color: var(--bgCream2);
  display: flex;
  flex-direction: row;
  padding: 2px 2px;

  p:hover {
    color: cyan;
    cursor: pointer;
  }
}

.upfolder {
  background-color: var(--bgCream3);
}

.fa-arrow-up {
  margin-right: 2px;
}

.project-root {
  display: flex;
  flex-direction: column;
  margin-top: 1rem;
  padding: 0.5rem 0.5rem;
  background-color: var(--bg);
  border-left: 3px solid var(--sliderThumb);

  h5 {
    font-size: 1.3rem;
    line-height: 1.3rem;
    font-weight: bold;
    margin-bottom: 0.5rem;
  }

  p {
    line-height: 1.2rem;
  }
}

.project-root:hover {
  cursor: pointer;
  background-color: var(--bgHover);
  transition: background-color 0.1s ease-in-out;
}

.hint-clicks {
  margin: 0.5rem 0 0.75rem 0;
}

.has-root {
  display: flex;
  flex-direction: row;
}
</style>
