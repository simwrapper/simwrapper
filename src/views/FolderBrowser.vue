<template lang="pug">
.folder-browser
  .stripe.white(v-if="myState.svnProject")
    .vessel
      .project-bar
        .details
          h2 {{ globalState.breadcrumbs[globalState.breadcrumbs.length -1].label }}
          p {{ myState.svnProject.name }}
        .logo
          img(width=150 src="/tu-logo.png")

  //- show network errors
  .stripe.white.details(v-if="myState.errorStatus")
   .vessel
    .badnews(v-html="myState.errorStatus")

  //- main content
  .stripe.cream.details(v-else)
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
              | &nbsp;{{ folder }}

      //- thumbnails of each viz and image in this folder
      h3.curate-heading(v-if="myState.vizes.length") {{ $t('Analysis')}}

      .curate-content(v-if="myState.vizes.length")
        .viz-table
          .viz-grid-item(v-for="viz,index in myState.vizes"
                    :key="viz.config"
                    @click="clickedVisualization(index)")

            .viz-frame
              component.viz-frame-component(
                    :is="viz.component"
                    :yamlConfig="viz.config"
                    :fileApi="myState.svnRoot"
                    :subfolder="myState.subfolder"
                    :thumbnail="true"
                    :style="{'pointer-events': viz.component==='image-view' ? 'auto' : 'none'}"
                    @title="updateTitle(index, $event)")
              p {{ viz.title }}

      // individual links to files in this folder
      h3.curate-heading(v-if="myState.files.length") {{$t('Files')}}

      .curate-content(v-if="myState.files.length")
        .file-table
          .file(:class="{fade: myState.isLoading}"
                v-for="file in myState.files" :key="file")
            a(:href="`${myState.svnProject.svn}/${myState.subfolder}/${file}`") {{ file }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      Analysis: 'Analysis',
      Files: 'Files',
      Folders: 'Folders',
    },
    de: {
      Analysis: 'Ergebnisse',
      Files: 'Dateien',
      Folders: 'Ordner',
    },
  },
}

import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import markdown from 'markdown-it'
import mediumZoom from 'medium-zoom'
import micromatch from 'micromatch'
import yaml from 'yaml'
import globalStore from '@/store.ts'
import plugins from '@/plugins/pluginRegistry'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import { BreadCrumb, VisualizationPlugin, SVNProject } from '../Globals'

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
  svnProject: SVNProject | null
  svnRoot?: HTTPFileSystem
  subfolder: string
  summary: boolean
  vizes: VizEntry[]
}

@Component({
  components: plugins,
  props: {},
  i18n,
})
export default class VueComponent extends Vue {
  private globalState = globalStore.state

  private mdRenderer = new markdown()

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

  private getFileSystem(name: string) {
    const svnProject: any[] = globalStore.state.svnProjects.filter((a: any) => a.url === name)

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
        label: 'aftersim',
        url: '/',
      },
      {
        label: this.myState.svnProject.name,
        url: '/' + this.myState.svnProject.url,
      },
    ]

    const subfolders = this.myState.subfolder.split('/')
    let buildFolder = '/'
    for (const folder of subfolders) {
      if (!folder) continue

      buildFolder += folder + '/'
      crumbs.push({
        label: folder,
        url: '/' + this.myState.svnProject.url + buildFolder,
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

    const path = `/v/${viz.component}/${this.myState.svnProject.url}/${this.myState.subfolder}/${viz.config}`
    this.$router.push({ path })
  }

  private updateTitle(viz: number, title: string) {
    this.myState.vizes[viz].title = title
  }

  @Watch('globalState.colorScheme') swapColors() {
    // medium-zoom freaks out if color theme is swapped.
    // so let's reload images just in case.
    this.fetchFolderContents()
  }

  @Watch('$route') async updateRoute() {
    if (!this.$route.name) return

    const svnProject = this.getFileSystem(this.$route.name)

    this.myState.svnProject = svnProject
    this.myState.subfolder = this.$route.params.pathMatch ? this.$route.params.pathMatch : ''

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
    const readme = 'readme.md'
    if (this.myState.files.indexOf(readme) === -1) {
      this.myState.readme = ''
    } else {
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
    // this.myState.folders = []

    try {
      const folderContents = await this.myState.svnRoot.getDirectory(this.myState.subfolder)

      // hide dot folders
      const folders = folderContents.dirs.filter(f => !f.startsWith('.')).sort()
      const files = folderContents.files.filter(f => !f.startsWith('.')).sort()

      this.myState.errorStatus = ''
      this.myState.folders = folders
      this.myState.files = files
    } catch (e) {
      // Bad things happened! Tell user
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
        this.myState.errorStatus += `<p><i>${this.myState.svnProject.svn}${this.myState.subfolder}</i></p>`
      }

      // maybe it failed because password?
      if (this.myState.svnProject && this.myState.svnProject.need_password && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.svnProject.url)
      }
    } finally {
      this.myState.isLoading = false
    }
  }

  private openOutputFolder(folder: string) {
    if (this.myState.isLoading) return
    if (!this.myState.svnProject) return

    const path = '/' + this.myState.svnProject.url + '/' + this.myState.subfolder + '/' + folder
    this.$router.push({ path })
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.folder-browser {
  background-color: var(--bgBold);
}

.vessel {
  margin: 0 auto;
  padding: 0rem 3rem 2rem 3rem;
  max-width: $sizeVessel;
}

.white {
  background-color: var(--bgBold);
}

.cream {
  background-color: var(--bgCream);
}

h3,
h4 {
  margin-top: 2rem;
  margin-bottom: 0.5rem;
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
  display: grid;
  grid-gap: 2rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
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
  z-index: 1;
  flex: 1;
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;

  p {
    margin: auto 0 auto 0;
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
  background-color: white;
}

.logo {
  margin-left: auto;
}

.folder-table {
  display: grid;
  row-gap: 0rem;
  column-gap: 1rem;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  list-style: none;
  margin-bottom: 0px;
  padding-left: 0px;
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background-color: var(--bgBold);
  margin: 0.25rem 0rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
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
  grid-template-columns: repeat(2, minmax(0, 1fr));
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

@media only screen and (max-width: 50em) {
  .viz-table {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .folder-table {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .file-table {
    display: grid;
    grid-gap: 0rem;
    grid-template-columns: 1fr;
  }
}

@media only screen and (max-width: 40em) {
  .vessel {
    padding: 0 1rem 0 1rem;
  }

  .folder-table {
    display: grid;
    grid-gap: 0rem;
    grid-template-columns: 1fr;
  }

  .viz-table {
    display: grid;
    grid-gap: 2rem;
    grid-template-columns: 1fr;
  }

  .viz-frame {
    p {
      font-size: 1rem;
    }
  }

  .curate-heading {
    border-bottom: none;
    padding: 1rem 0rem;
  }

  h3.curate-heading {
    padding-top: 1rem;
    font-weight: bold;
  }

  .curate-content {
    border-bottom: none;
    padding-top: 0rem;
  }

  .file {
    font-size: 0.8rem;
  }

  .logo {
    display: none;
  }
}
</style>
