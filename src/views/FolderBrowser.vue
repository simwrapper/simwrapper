<template lang="pug">
#project-component

  .project-bar(v-if="myState.svnProject")
    .details
      h2 {{ globalState.breadcrumbs[globalState.breadcrumbs.length -1].label }}
      p {{ myState.svnProject.name }}
    .logo
      img(width=150 src="/tu-logo.png")

  .details(v-if="myState.svnProject")

    //- show network errors
    .badnews(v-if="myState.errorStatus" v-html="myState.errorStatus")

    //- these are sections defined by viz-summary.yml etc
    .curated-sections

      //- this is the content of readme.md, if it exists
      .readme-header
        .curate-content.markdown(v-if="myState.readme" v-html="myState.readme")

      //- file system folders
      h3.curate-heading(v-if="myState.folders.length")  {{ $t('Folders') }}

      .curate-content(v-if="myState.folders.length")
        .folder(:class="{fade: myState.isLoading}"
              v-for="folder in myState.folders" :key="folder.name"
              @click="openOutputFolder(folder)")
          p {{ folder }}

      //- thumbnails of each viz and image in this folder
      h3.curate-heading(v-if="myState.vizes.length") {{ $t('Analysis')}}

      .curate-content(v-if="myState.vizes.length")
        .viz-table
          .viz-item(v-for="viz,index in myState.vizes"
                    :key="viz.config"
                    @click="clickedVisualization(index)")
            .viz-frame
              p {{ viz.title }}
              component.thumbnail(:is="viz.component" :yamlConfig="viz.config"
                    :fileApi="myState.svnRoot"
                    :subfolder="myState.subfolder"
                    :thumbnail="true"
                    :style="{'pointer-events': viz.component==='image-view' ? 'auto' : 'none'}"
                    @title="updateTitle(index, $event)")

      // individual links to files in this folder
      h3.curate-heading(v-if="myState.files.length") {{$t('Files')}}

      .curate-content(v-if="myState.files.length")
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
  margin: 1rem 0rem;
  padding: 0.5rem 1rem;
  background-color: #ffc;
  color: $matsimBlue;
}

.viz-table {
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: repeat(3, minmax(100px, 1fr));
  list-style: none;
  margin-bottom: 0px;
  padding-left: 0px;
}

.viz-item {
  text-align: center;
  margin: 0 0;
  padding: 0 0;
  display: table-cell;
  cursor: pointer;
  vertical-align: top;
  background-color: #555;
  border: 2px solid var(--bg);
  margin-bottom: auto;
}

.viz-item:hover {
  box-shadow: 0px 0px 5px 5px rgba(0, 0, 0, 0.08), 0 3px 5px 0 rgba(0, 0, 0, 0.02);
  transition: box-shadow 0.1s ease-in-out, background-color 0.1s ease-in-out;
  background-color: var(--link);
  transform: translateY(1px);
}

.viz-frame {
  overflow: hidden;
  display: flex;
  flex-direction: column;
  p {
    font-size: 0.8rem;
    padding: 0.25rem 0.5rem;
    color: white;

    /* Required for text-overflow to do anything */
    text-overflow: ellipsis;
    white-space: nowrap;
    overflow: hidden;
  }
}

.logo {
  margin-left: auto;
}

.thumbnail {
  max-height: 225px;
  background-color: white; // var(--bgBold);
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background-color: var(--bgBold);
  margin: 0.25rem 0rem;
  padding: 0.75rem 1rem;
}

.folder:hover {
  background-color: var(--bgHover);
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 3px 10px 0 rgba(0, 0, 0, 0.05);
  transition: box-shadow 0.1s ease-in-out;
}

.project-bar {
  display: flex;
  margin-bottom: 1rem;
  padding: 1rem 3rem 1.5rem 0rem;
  background-color: var(--bgBold);
  z-index: 10000;
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.1), 0 6px 20px 0 rgba(0, 0, 0, 0.05);
}

.project-bar p {
  margin-top: -0.25rem;
}

.details {
  padding: 0rem 3rem 3rem 3rem;
}

.fade {
  opacity: 0.6;
}

.file {
  word-break: break-all;
}

.markdown {
  padding: 1rem 0rem;
}

.curated-sections {
  display: grid;
  grid-template-columns: 10rem 1fr;
  grid-template-areas: 'heading  content';
}

.curate-heading {
  border-bottom: 1px solid var(--bgBold);
  padding: 0rem 0rem;
  margin: 0rem 0rem;
  grid-area: 'heading';
}

.readme-header {
  font-size: 1.1rem;
  grid-column: 1 / 3;
  padding-bottom: 1rem;
}

h3.curate-heading {
  font-size: 1.3rem;
  font-weight: normal;
  color: var(--textFancy);
  padding-top: 0.5rem;
  margin-top: 0rem;
}

.curate-content {
  grid-area: 'content';
  padding: 1rem 0rem;
  margin: 0rem 0rem;
  border-bottom: 1px solid var(--bgBold);
}

@media only screen and (max-width: 640px) {
  .project-bar {
    padding: 1rem 1rem 1.5rem 0rem;
  }

  .details {
    padding: 0rem 1rem 0rem 1rem;
  }

  .viz-table {
    display: grid;
    grid-gap: 2rem;
    grid-template-columns: 1fr;
  }

  .viz-frame {
    p {
      font-size: 0.6rem;
    }
  }

  .curated-sections {
    display: flex;
    flex-direction: column;
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
