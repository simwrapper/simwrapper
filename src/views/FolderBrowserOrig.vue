<template lang="pug">
.folder-browser

  //- show network errors
  .stripe.details(v-if="myState.errorStatus")
   .vessel
    .badnews(v-html="myState.errorStatus")

  //- main content
  .stripe.details(v-else)
   .vessel

    //- these are sections defined by viz-summary.yml etc
    .curated-sections

      //- this is the content of readme.md, if it exists
      .readme-header
        .curate-content.markdown(
          v-if="myState.readme"
          v-html="myState.readme"
        )

      //- file system folders
      h3.curate-heading(v-if="myState.folders.length")  {{ $t('Folders') }}

      .curate-content(v-if="myState.folders.length")
        .folder-table
          .folder(:class="{fade: myState.isLoading}"
                  :key="folder.name"
                  v-for="folder in myState.folders"
                  @click="openOutputFolder(folder)")
            p
              i.fa.fa-folder-open
              | &nbsp;{{ cleanName(folder) }}

      //- thumbnails of each viz and image in this folder
      h3.curate-heading(v-if="myState.vizes.length") {{ $t('Analysis')}}

      .curate-content(v-if="myState.vizes.length")
        .viz-table
          .viz-grid-item(v-for="viz,index in myState.vizes"
                    :key="index"
                    @click="clickedVisualization(index)")

            .viz-frame
              component.viz-frame-component(
                    :is="viz.component"
                    :root="myState.svnProject.slug"
                    :subfolder="myState.subfolder"
                    :yamlConfig="viz.config"
                    :thumbnail="true"
                    :fileApi="myState.svnRoot"
                    :style="{'pointer-events': viz.component==='image-view' ? 'auto' : 'none'}"
                    @title="updateTitle(index, $event)")
              p {{ viz.title }}

      //- TODO calculation tables
      //-       this.allConfigFiles = await this.fileSystem.findAllYamlConfigs(this.subfolder)
      //- return Object.values(this.allConfigFiles.topsheets)


      // individual links to files in this folder
      h3.curate-heading(v-if="myState.files.length") {{$t('Files')}}

      .curate-content(v-if="myState.files.length")
        .file-table
          .file(:class="{fade: myState.isLoading}"
                v-for="file in myState.files" :key="file")
            a(:href="`${myState.svnProject.baseURL}/${myState.subfolder}/${file}`") {{ cleanName(file) }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      Analysis: 'Analysis',
      Files: 'Files',
      Folders: 'Folders',
      Topsheet: 'Topsheet',
    },
    de: {
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

const allComponents = Object.assign({ TopsheetsFinder }, plugins)
@Component({
  i18n,
  components: allComponents,
})
export default class VueComponent extends Vue {
  @Prop({ required: false }) private xsubfolder!: string
  @Prop({ required: true }) private root!: string
  @Prop({ required: true }) private allConfigFiles!: YamlConfigs

  private globalState = globalStore.state

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
    this.updateRoute()
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

  @Watch('xsubfolder')
  @Watch('allConfigFiles')
  private updateRoute() {
    const svnProject = this.getFileSystem(this.root)

    this.myState.svnProject = svnProject
    this.myState.subfolder = this.xsubfolder || ''
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
      this.myState.folders = folders
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

  private openOutputFolder(folder: string) {
    if (this.myState.isLoading) return
    if (!this.myState.svnProject) return

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

.vessel {
  margin: 0 auto;
  padding: 0rem 1rem 2rem 1rem;
  max-width: $sizeVessel;
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

h3,
h4 {
  margin-top: 2rem;
  margin-bottom: 0.5rem;
}

.badnews {
  border-left: 3rem solid #af232f;
  margin: 0rem 0rem;
  padding: 0.5rem 0rem;
  background-color: #ffc;
  color: $matsimBlue;
}

.viz-table {
  display: grid;
  grid-gap: 2rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  list-style: none;
}

.viz-grid-item {
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

.viz-frame {
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

.viz-frame:hover {
  box-shadow: var(--shadowMode);
  transition: box-shadow 0.1s ease-in-out;
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
  column-gap: 1rem;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  list-style: none;
  margin-bottom: 0px;
  padding-left: 0px;
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background-color: var(--bgCream3);
  margin: 0.25rem 0rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  word-wrap: break-word;
}

.folder:hover {
  background-color: var(--bgHover);
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.08), 0 3px 10px 0 rgba(0, 0, 0, 0.08);
  transition: box-shadow 0.1s ease-in-out;
}

.project-bar {
  display: flex;
  margin-bottom: 1rem;
  padding: 2rem 0 0 0;
  z-index: 10000;
}

.project-bar p {
  margin-top: -0.25rem;
}

.fade {
  opacity: 0.6;
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

.markdown {
  padding: 1rem 0rem;
}

.curated-sections {
  margin-top: 2rem;
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
  color: var(--textFancy);
  padding-top: 0.5rem;
  margin-top: 0rem;
}

.curate-content {
  padding: 1rem 0rem;
  margin: 0rem 0rem;
}
</style>
