<template lang="pug">
.folder-browser

  //- show network errors
  .stripe.details(v-if="myState.errorStatus")
   .vessel
    .badnews(v-html="myState.errorStatus")

  //- main content
  .stripe.details(v-else)
   //- show zoomed image
   .image-zoom.flex-col(v-if="isZoomedImage" @click="isZoomedImage=null")
      image-view.image-zoom(
        :root="myState.svnProject.slug"
        :subfolder="myState.subfolder"
        :yamlConfig="isZoomedImage.config"
        :fileApi="myState.svnRoot"
        :style="{'pointer-events': 'auto'}"
      )
      p: b {{ isZoomedImage.title }}

   //- show everthing else
   .vessel(v-show="!isZoomedImage" :id="idFolderTable" :class="{narrow: isNarrow}")

    //- these are sections defined by viz-summary.yml etc
    .curated-sections()

      .folder-title-stuff.flex-row
        .flex1
          h2 {{ cleanFolderTitle  }}
        .favstar
          p.favorite-icon-this(title="Favorite"
            :class="{'is-thisfolderfavorite': isThisFolderFavorite}"
            @click="clickedFavorite"
          ): i.fa.fa-star

      //- FOLDERS: file system folders
      .folder-area(v-if="myState.folders.length")
        h4.az-title.folder-title  {{ $t('Folders') }}
        .az-grid.folder-table
          //- .az-cell.heading folder
          //- .az-cell.heading Description
          .az-cell.folder(v-for="folder,i in myState.folders" :key="folder"
                    :class="{fade: myState.isLoading, 'up-folder': i == 0}"
                    @click="openOutputFolder(folder)")
              .is-favorite(v-if="isFavorite(folder)")
              p
                i.fa(:class="i == 0 ? 'fa-arrow-up' : 'fa-folder'" :style="i == 0 ? 'color: green' : 'color: #ea0'")
                span(:style="isFavorite(folder) && 'font-weight: bold'") &nbsp;&nbsp;{{ cleanName(folder) }}

      //- README: content of readme.md, if it exists
      .readme-header.markdown(v-if="myState.readme")
        .curate-content.markdown(v-html="myState.readme")

      //- MAPS: thumbnails of each viz map here
      .section-maps(v-if="Object.keys(vizMaps).length")
        h4.az-title {{ $t('Maps')}}
        .az-grid.map-grid(:class="{narrow: isNarrow}")
          .az-cell.heading Title
          .az-cell.heading.file-cell Filename
          .az-cell.heading Type
          .az-row(v-for="[index, viz] of Object.entries(vizMaps)" :key="index" @click="clickedVisualization(index)")
            a.az-cell: b {{ viz.title }}
            .az-cell.pointer.file-cell(:class="{'sameFilename': viz.title == viz.config}") {{ viz.config }}
            .az-cell
              .v-plugin.pointer(:style="`background-color: ${getTabColor(viz.component)}`") {{ viz.component || 'dashboard' }}

      //- IMAGES here
      .section-images(v-if="Object.keys(vizImages).length")
        h4.az-title {{ $t('Images')}}
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

      //- FILES: individual links to files in this folder
      //- this is DISABLED for Chrome API for now, because we
      //- can't download those files via regular URL
      //- .files-section(v-if="myState?.svnProject?.baseURL")
      .files-section
        h4.az-title(v-if="myState.files.length") {{$t('Files')}}
        .curate-content(v-if="myState.files.length")
          .file-table
            .file(v-for="file in myState.files" :key="file"
              :class="{fade: myState.isLoading}"
            )
              a(v-if="myState?.svnProject?.baseURL"
                :href="`${myState.svnProject.baseURL}/${myState.subfolder}/${file}`"
              ) {{ cleanName(file) }}
              a(v-else
                @click="chromeOpenFile(file)"
              ) {{ cleanName(file) }}

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

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import katex from 'katex'
import markdown from 'markdown-it'
import markdownTex from 'markdown-it-texmath'
import micromatch from 'micromatch'
import YAML from 'yaml'

import globalStore from '@/store'
import { FavoriteLocation, FileSystemConfig, XML_COMPONENTS, YamlConfigs } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { pluginComponents } from '@/plugins/pluginRegistry'

import TopsheetsFinder from '@/components/TopsheetsFinder/TopsheetsFinder.vue'

const mdRenderer = new markdown({
  html: true,
  linkify: true,
  typographer: true,
}).use(markdownTex, {
  engine: katex,
  delimiters: 'dollars',
  katexOptions: { macros: { '\\RR': '\\mathbb{R}' } },
})

const tabColors = {
  // blank means dashboard:
  '': '#118860',
  // others are kebab-case:
  aggregate: '#c2b934',
  'area-map': '#3988E1',
  carriers: '#585FD1',
  logistics: '#FF517A',
  events: '#4400ff',
  hexagons: '#1Bc99C',
  links: '#1FB3D3',
  sankey: '#DF41A1',
  summary: '#AFF05B',
  transit: '#8B008B',
  'vehicle-anim': '#330033',
  xytime: '#dF704E',
} as any

export default defineComponent({
  name: 'FolderBrowser',
  i18n,
  components: Object.assign({ TopsheetsFinder }, pluginComponents),
  props: {
    root: { type: String, required: true },
    allConfigFiles: { type: Object as PropType<YamlConfigs>, required: true },
    xsubfolder: String,
  },
  data: () => {
    const idFolderTable = `id-${Math.random()}`
    return {
      globalState: globalStore.state,
      summaryYamlFilename: 'viz-summary.yml',
      mdRenderer,
      idFolderTable,
      isNarrow: false,
      isZoomedImage: null as any,
      resizeObserver: {} as ResizeObserver,
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
  computed: {
    cleanFolderTitle() {
      let name: any = this.xsubfolder || this.cwd || this.root
      name = name.replaceAll('//', '/')
      if (name.endsWith('/')) name = name.substring(0, name.length - 1)
      return name
    },

    isThisFolderFavorite(): any {
      let key = this.root
      if (this.xsubfolder) key += `/${this.xsubfolder}`
      if (key.endsWith('/')) key = key.substring(0, key.length - 1)

      const indexOfPathInFavorites = globalStore.state.favoriteLocations.findIndex(
        f => key == f.fullPath
      )
      return indexOfPathInFavorites > -1
    },
    cwd() {
      return this.$route.query.cwd || ''
    },

    favoriteLocations(): string[] {
      const faves = this.$store.state.favoriteLocations.filter((fave: FavoriteLocation) => {
        if (fave.root !== this.root) return false
        if (!fave.subfolder.startsWith('' + this.xsubfolder)) return false
        return true
      }) as FavoriteLocation[]

      return faves.map(f => f.fullPath || '')
    },

    vizImages(): any {
      const images: { [index: number]: any } = {}
      for (let i = 0; i < this.myState.vizes.length; i++) {
        if (this.myState.vizes[i].component === 'image-view') {
          images[i] = this.myState.vizes[i]
        }
      }
      return images
    },

    vizMaps(): any {
      const maps: { [index: number]: any } = {}
      for (let i = 0; i < this.myState.vizes.length; i++) {
        if (this.myState.vizes[i].component !== 'image-view') {
          maps[i] = this.myState.vizes[i]
        }
      }
      return maps
    },
  },
  methods: {
    clickedFavorite() {
      let hint = `${this.root}/${this.xsubfolder}`
      let finalFolder = this.xsubfolder || this.root
      // remove current folder from subfolder
      const lastSlash = hint.lastIndexOf('/')
      if (lastSlash > -1) {
        finalFolder = hint.substring(lastSlash + 1)
        hint = hint.substring(0, lastSlash)
      }

      let fullPath = `${this.root}/${this.xsubfolder}`
      if (fullPath.endsWith('/')) fullPath = fullPath.substring(0, fullPath.length - 1)

      const favorite: FavoriteLocation = {
        root: this.root,
        subfolder: this.xsubfolder || '',
        label: finalFolder,
        fullPath,
        hint,
      }

      this.$store.commit(this.isThisFolderFavorite ? 'removeFavorite' : 'addFavorite', favorite)
    },

    async guessTitles() {
      const re = /\.(yml|yaml)$/
      for (const viz of this.myState.vizes) {
        try {
          if (re.test(viz.config)) {
            const text =
              (await this.myState.svnRoot?.getFileText(
                this.myState.subfolder + '/' + viz.config
              )) || ''
            const yaml = YAML.parse(text)
            if (yaml.title) viz.title = yaml.title
          }
        } catch (e) {
          // oh well
        } finally {
          if (viz.title == '..') viz.title = viz.config
        }
      }
    },

    async chromeOpenFile(filename: string) {
      const decoded = decodeURIComponent(filename)
      const path = `${this.xsubfolder}/${decoded}`
      const blob = await this.myState.svnRoot?.getFileBlob(path)
      if (!blob) return

      var element = document.createElement('a')
      const downloadUrl = URL.createObjectURL(blob)
      element.setAttribute('href', downloadUrl)
      element.setAttribute('download', filename)
      element.style.display = 'none'
      document.body.appendChild(element)

      element.click()

      document.body.removeChild(element)
      // memoryyyyy
      URL.revokeObjectURL(downloadUrl)
    },

    showBuilder() {
      console.log('VIZWIT')
      // this.$router.push(`${this.$route.fullPath + '?edit'}`)
      this.$emit('edit')
    },

    isFavorite(folder: string) {
      let thing = `${this.root}`
      if (this.xsubfolder) thing += `/${this.xsubfolder}`
      thing += `/${folder}`
      return this.favoriteLocations.indexOf(thing) > -1
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

    clickedVisualization(vizNumber: number) {
      const viz = this.myState.vizes[vizNumber]

      // special case: images don't click thru
      if (viz.component === 'image-view') {
        this.isZoomedImage = viz
        // !this.isZoomedImage
        return
      }

      if (!this.myState.svnProject) return

      const props = {
        root: this.myState.svnProject.slug,
        xsubfolder: this.myState.subfolder,
        subfolder: this.myState.subfolder,
        yamlConfig: viz.config,
        thumbnail: false,
      }

      this.$emit('navigate', { component: viz.component, props })
    },

    updateTitle(viz: number, title: string) {
      this.myState.vizes[viz].title = title
    },

    async showReadme() {
      if (!this.myState.svnRoot) return
      this.myState.readme = ''
      const readme = 'readme.md'
      const readmeIndex = this.myState.files.map(f => f.toLocaleLowerCase()).indexOf(readme)
      if (readmeIndex > -1) {
        const readmeFilename = this.myState.files[readmeIndex]
        try {
          const text = await this.myState.svnRoot.getFileText(
            this.myState.subfolder + '/' + readmeFilename
          )
          this.myState.readme = this.mdRenderer.render(text)
        } catch (e) {
          // no readme
        }
      }
    },

    async buildShowEverythingView() {
      const fileSet = new Set(this.myState.files)

      // loop on each viz type
      for (const viz of this.globalState.visualizationTypes.values()) {
        // match based on file patterns registered for each viz
        const matches = micromatch(this.myState.files, viz.filePatterns, { nocase: true })
        for (const file of matches) {
          // add thumbnail for each matching file
          this.myState.vizes.push({ component: viz.kebabName, config: file, title: '..' })
          // remove file from set of unmapped files
          fileSet.delete(file)
        }
      }

      // check for any remaining XML files
      const xmlFiles = micromatch([...fileSet.keys()], ['*.xml', '*.xml.gz'], { nocase: true })
      for (const file of xmlFiles) {
        const answer = await this.myState.svnRoot?.probeXmlFileType(
          `${this.myState.subfolder}/${file}`
        )
        if (answer && XML_COMPONENTS[answer]) {
          this.myState.vizes.push({ component: XML_COMPONENTS[answer], config: file, title: file })
        }
      }
    },

    // Curate the view, if viz-summary.yml exists
    async buildCuratedSummaryView() {
      if (!this.myState.svnRoot) return

      const summaryYaml = YAML.parse(
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
        const folderContents = await this.myState.svnRoot.getDirectory(this.myState.subfolder)

        // hide dot folders
        const folders = folderContents.dirs.filter(f => !f.startsWith('.'))
        const files = folderContents.files.filter(f => !f.startsWith('.'))

        // Also show any project-level viz thumbnails from other folders
        // (but, ensure that files in this folder supercede any project viz files
        // with the same name)
        const mergedFilesAndVizes = Object.assign({}, this.allConfigFiles.vizes)
        for (const file of files) {
          mergedFilesAndVizes[file] = file
        }

        const allVizes = Object.values(mergedFilesAndVizes)

        this.myState.errorStatus = ''
        this.myState.folders = [' UP'].concat(folders)
        this.myState.files = allVizes

        await this.updateFolderLayout()
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
      this.guessTitles()
    },

    openOutputFolder(folder: string) {
      if (this.myState.isLoading) return
      if (!this.myState.svnProject) return

      if (folder === ' UP') {
        this.$emit('up')
        return
      }

      let target =
        folder === '..'
          ? this.myState.subfolder.substring(0, this.myState.subfolder.lastIndexOf('/'))
          : this.myState.subfolder + '/' + folder

      if (target.startsWith('/')) target = target.slice(1)
      if (!target.endsWith('/')) target += '/'

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

    getTabColor(kebabName: string) {
      return tabColors[kebabName] || '#c2b934'
    },

    updateRoute() {
      const svnProject = this.getFileSystem(this.root)

      this.myState.svnProject = svnProject
      this.myState.subfolder = this.xsubfolder || ''
      this.myState.readme = ''

      if (!this.myState.svnProject) return
      this.myState.svnRoot = new HTTPFileSystem(this.myState.svnProject)

      // this happens async
      this.fetchFolderContents()
    },

    async updateFolderLayout() {
      await this.$nextTick()
      const container = document.getElementById(this.idFolderTable) as any
      if (!container) return

      // revise number of subfolder listing columns
      const items = this.myState.folders.length
      const itemHeight = 36 // Approximate height of each item
      const containerWidth = container.offsetWidth
      const itemWidth = 200 // Minimum width of each item
      const maxColumns = 1 + Math.floor(containerWidth / itemWidth)

      let numRows = 8 + Math.ceil(items / maxColumns)
      if (containerWidth < 500) numRows = 10000
      container.style.setProperty('--num-rows', numRows)

      // handle narrow viz list layout
      const clientWidth = container.clientWidth
      this.isNarrow = clientWidth < 550
    },
  },
  watch: {
    'globalState.colorScheme'() {
      this.fetchFolderContents()
    },
    xsubfolder() {
      this.updateRoute()
    },
    allConfigFiles() {
      this.updateRoute()
    },
    'globalState.authAttempts'() {
      console.log('AUTH CHANGED - Reload')
      this.updateRoute()
    },
    async 'myState.files'() {
      // clear visualizations
      this.myState.vizes = []
      if (this.myState.files.length === 0) return

      this.showReadme()

      this.myState.summary = this.myState.files.indexOf(this.summaryYamlFilename) !== -1

      if (this.myState.summary) {
        await this.buildCuratedSummaryView()
      } else {
        await this.buildShowEverythingView()
      }
    },
  },

  beforeDestroy() {
    this.resizeObserver?.disconnect()
  },

  mounted() {
    this.updateRoute()

    const dashboard = document.getElementById(this.idFolderTable) as HTMLElement
    this.resizeObserver = new ResizeObserver(entries => {
      this.updateFolderLayout()
    })
    this.resizeObserver.observe(dashboard)
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.folder-browser {
  margin-top: 1rem;
  padding: 0 0 0 0.5rem;
}

.vessel {
  margin: 0 auto;
  padding: 0rem 2rem 2rem 2rem;
  max-width: 100rem;
}

h2 {
  font-size: 1.8rem;
}

h3,
h4 {
  margin-top: 2rem;
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
  margin: 4px 0 4px 0;
  padding: 0 0;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  vertical-align: top;
  background-color: var(--bgCream5);
}

.viz-frame {
  position: relative;
  display: flex;
  flex-direction: column;
  z-index: 1;
  flex: 1;
  overflow: hidden;
  padding: 8px 0 5px 5px;

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

.viz-element:hover {
  background-color: var(--bgPanel);
  transition: background-color 0.1s ease-in-out;
}

.viz-frame-component {
  background-color: var(--bgPanel);
}

.logo {
  margin-left: auto;
}

.folder-table {
  display: grid;
  grid-auto-flow: column;
  grid-template-columns: repeat(auto-fill, max-content);
  grid-template-rows: repeat(var(--num-rows, 20), min-content);
  list-style: none;
  margin-bottom: 0px;
  padding-left: 0px;
  line-height: 1.1rem;
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  word-wrap: break-word;
  position: relative;
  padding-left: 6px;
  padding-right: 4px;
}

.folder:hover {
  background-color: var(--bgPanel);
  // box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.08), 0 3px 10px 0 rgba(0, 0, 0, 0.08);
  transition: background-color 0.1s ease-in-out;
  color: var(--yellowHighlight);
}

.up-folder {
  // background-color: var(--bgBold);
  padding-left: 6px;
  font-weight: bold;
}

.file-table {
  display: grid;
  row-gap: 0rem;
  column-gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
}

.file {
  word-break: break-all;
  line-height: 1rem;
  margin-bottom: 0.5rem;
}

.file a {
  color: var(--textFancy);
}

.file a:hover {
  color: var(--textLink);
}

.markdown {
  padding: 1rem 0rem;
}

.curated-sections {
  padding-top: 0rem;
  display: flex;
  flex-direction: column;
}

.curate-heading {
  padding: 0rem 0rem;
  margin: 0rem 0rem;
}

.readme-header {
  font-size: 1.1rem;
  padding-bottom: 1rem;
}

h3.curate-heading {
  font-size: 1.8rem;
  font-weight: bold;
  color: var(--textBold);
  padding-top: 0.5rem;
  margin-top: 1rem;
  line-height: 1.5rem;
}

.curate-content {
  padding: 1rem 0rem;
  margin: 0rem 0rem;
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
  padding: 8px 2px 2px 2px;
  display: flex;
  flex-direction: column;
  cursor: pointer;
  vertical-align: top;
  border: 1px solid #0000;
}

.viz-image-grid-item:hover {
  border: var(--borderSymbology);
  cursor: zoom-in;
}

.viz-image-frame {
  position: relative;
  z-index: 1;
  flex: 1;
  min-height: $thumbnailHeight;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  p {
    margin: auto 0 0 0;
    // background-color: var(--bgBold);
    font-size: 1rem;
    font-weight: bold;
    line-height: 1.2rem;
    padding: 0.5rem 0.5rem;
    color: var(--text);
    word-wrap: break-word;
    /* Required for text-overflow to do anything */
    // text-overflow: ellipsis;
    // white-space: nowrap;
    // overflow: hidden;
  }
}

.viz-image-frame:hover {
  transition: box-shadow 0.1s ease-in-out;
}

// .viz-image-frame-component {
//   background-color: #00000000;
// }

.v-filename {
  margin: 0 0;
  cursor: pointer;
}

.viz-color-bar {
  display: flex;
  line-height: 16px;
}

.v-plugin {
  text-transform: uppercase;
  color: white;
  padding: 2px 6px 1px 6px;
  border-radius: 4px;
  p {
    margin-right: auto;
  }
}

.is-favorite {
  position: absolute;
  top: 0;
  right: 0;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 0 25px 25px 0;
  border-color: transparent #4444ff transparent transparent;
  transform: rotate(0deg);
}

.is-favorite::after {
  content: '★';
  position: absolute;
  top: -3px;
  right: -23px;
  font-size: 13px;
  color: white;
}

.pointer {
  cursor: pointer;
}

.az-title {
  margin-top: 2.5rem;
}

.favorite-icon-this {
  margin: auto -0.5rem auto 1rem;
  opacity: 0.6;
  font-size: 1.1rem;
  color: #757bff;
}

.favorite-icon-this:hover {
  cursor: pointer;
}

.is-thisfolderfavorite {
  opacity: 1;
  color: #4f58ff;
  text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
}

.file-cell {
  padding-left: 0.5rem;
  padding-right: 0.5rem;
}

// ------------- narrow stuffs -----

.vessel.narrow {
  margin: 0 auto;
  padding: 0rem 0.5rem 2rem 0.5rem;
  max-width: 100rem;
}

.az-grid {
  grid-template-columns: 1fr 1fr auto;
  // grid-template-columns: auto-fit, auto-fit, auto;
  // gap: 0 0.5rem;
}
.az-grid.narrow {
  grid-template-columns: auto;
}

.az-cell {
  word-wrap: break-word;
  word-break: break-all;
  max-width: 100%;
  padding-right: 0;
}

.narrow .heading {
  display: none;
}

.narrow .az-cell {
  border: none;
  padding: 0;
}
.narrow .az-row .sameFilename {
  display: none;
}
.narrow .v-plugin {
  border-bottom: var(--borderThin);
  margin: 0px 0 1rem auto;
  width: max-content;
  font-size: 0.8rem;
  padding: 0px 4px;
}

.folder-title {
  margin-top: 1.5rem;
}

.image-zoom {
  cursor: zoom-out;
  text-align: center;
  height: 80dvh;
  max-width: 100%;
}
</style>
