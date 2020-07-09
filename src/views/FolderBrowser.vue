<template lang="pug">
#project-component
  .project-bar(v-if="myState.svnProject")
    nav.breadcrumb(aria-label="breadcrumbs")
      ul
        li(v-for="crumb in breadcrumbs" :key="crumb.label + crumb.url"
           @click="clickedLink(crumb.url)")
            p {{ crumb.label }}

    h2 {{ globalState.breadcrumbs[globalState.breadcrumbs.length -1].label }}
    p {{ myState.svnProject.name }}
    p {{ myState.svnProject.description }}

  .details(v-if="myState.svnProject")

    .badnews(v-if="myState.errorStatus" v-html="myState.errorStatus")

    .readme(v-if="myState.readme" v-html="myState.readme")

    .folders(v-if="myState.folders.length && !(myState.summary)")
      h3 Ordner
      .folder(v-for="folder in myState.folders" :key="folder.name"
              @click="openOutputFolder(folder)")
        p {{ folder }}

    .vizes(v-if="myState.vizes.length")
      //- h3 Vizes (Should be {{myState.vizes.length}})
      .viz-table
        .viz-item(v-for="viz in myState.vizes.length"
                  :key="myState.vizes[viz-1].config"
                  @click="clickedVisualization(viz-1)"
                  )
          .viz-frame
            p {{ myState.vizes[viz-1].title }}
            component(
                  :is="myState.vizes[viz-1].component"
                  :yamlConfig="myState.vizes[viz-1].config"
                  :fileApi="myState.svnRoot"
                  :subfolder="myState.subfolder"
                  :thumbnail="true"
                  :style="{'pointer-events': myState.vizes[viz-1].component==='image-view' ? 'auto' : 'none'}"
                  @title="updateTitle(viz-1, $event)")

    .folders(v-if="myState.folders.length && myState.summary")
      h3 Ordner
      .folder(v-for="folder in myState.folders" :key="folder.name"
              @click="openOutputFolder(folder)")
        p {{ folder }}

    .files(v-if="myState.files.length")
      h3 Datein
      .file(v-for="file in myState.files" :key="file")
        a(:href="`${myState.svnProject.svn}/${myState.subfolder}/${file}`") {{ file }}

</template>

<script lang="ts">
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
  readme: string
  svnProject?: SVNProject
  svnRoot?: HTTPFileSystem
  subfolder: string
  summary: boolean
  vizes: VizEntry[]
}

@Component({
  components: plugins,
  props: {},
})
export default class VueComponent extends Vue {
  private globalState = globalStore.state

  private mdRenderer = new markdown()

  private svnp?: SVNProject
  private myState: IMyState = {
    errorStatus: '',
    folders: [],
    files: [],
    readme: '',
    svnProject: this.svnp,
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

  private get breadcrumbs() {
    if (!this.myState.svnProject) return []

    const crumbs = [
      {
        label: 'Home',
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

    // last link is not a link
    // crumbs[crumbs.length - 1].url = '#'

    // save them!
    globalStore.commit('setBreadCrumbs', crumbs)

    return crumbs
  }

  private mounted() {
    this.updateRoute()
  }

  private clickedLink(path: string) {
    this.$router.push({ path })
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

  @Watch('$route') async updateRoute() {
    if (!this.$route.name) return

    const svnProject = this.getFileSystem(this.$route.name)

    this.myState.svnProject = svnProject
    this.myState.folders = []
    this.myState.files = []
    this.myState.subfolder = this.$route.params.pathMatch ? this.$route.params.pathMatch : ''

    if (!this.myState.svnProject) return
    this.myState.svnRoot = new HTTPFileSystem(this.myState.svnProject)

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

      this.myState.errorStatus = '<h3>'
      if (e.status) this.myState.errorStatus += `${e.status} `
      if (e.statusText) this.myState.errorStatus += `${e.statusText}`
      if (this.myState.errorStatus === '<h3>') this.myState.errorStatus += 'Error'
      this.myState.errorStatus += `</h3>`
      if (e.url) this.myState.errorStatus += `<p>${e.url}</p>`
      if (e.message) this.myState.errorStatus += `<p>${e.message}</p>`
      if (this.myState.errorStatus === '<h3>Error</h3>') this.myState.errorStatus = '' + e

      // maybe it failed because password?
      if (this.myState.svnProject && this.myState.svnProject.need_password && e.status === 401) {
        globalStore.commit('requestLogin', this.myState.svnProject.url)
      }
    }
  }

  private openOutputFolder(folder: string) {
    if (!this.myState.svnProject) return

    const path = '/' + this.myState.svnProject.url + '/' + this.myState.subfolder + '/' + folder
    this.$router.push({ path })
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

// #project-component {
//   background-color: #8f8fa7;
// }

h3,
h4 {
  margin-top: 2rem;
  margin-bottom: 0.5rem;
}

h2 {
  font-size: 1.8rem;
  width: max-content;
}

.badnews {
  margin: 1rem 0rem;
  padding: 0.5rem 1rem;
  background-color: #ffc;
  color: $matsimBlue;
}

.viz-table {
  display: grid;
  grid-gap: 1rem;
  grid-template-columns: repeat(auto-fill, 30%);
  list-style: none;
  margin-top: 2rem;
  margin-bottom: 0px;
  padding-left: 0px;
}

.viz-item {
  margin: 0 0;
  padding: 0 0;
  display: table-cell;
  cursor: pointer;
  vertical-align: top;
  background-color: #f6f6f6;
  border-bottom: 1px solid #aaa;
  border-left: 1px solid #aaa;
  border-right: 1px solid #aaa;
  border-radius: 3px;
  margin-bottom: auto;

  :hover {
    background-color: white;
    border-radius: 3px 3px;
  }
  :hover p {
    background-color: #555;
    border-radius: 3px 3px 0 0;
  }
}

.viz-frame {
  display: flex;
  flex-direction: column;

  p {
    font-size: 0.85rem;
    padding: 0.25rem 0.5rem;
    color: white;
    background-color: #555;
    border-radius: 3px 3px 0 0;
  }
}

.folder {
  cursor: pointer;
  display: flex;
  flex-direction: column;
  background-color: white;
  margin: 0.25rem 0rem;
  padding: 0.5rem 1rem;
}

.folder:hover {
  background-color: #ffd;
  box-shadow: 0 2px 4px 0 rgba(0, 0, 0, 0.05), 0 3px 10px 0 rgba(0, 0, 0, 0.05);
}

.project-bar {
  padding: 1rem 3rem 1.5rem 3rem;
  background-color: white;
}

.project-bar p {
  margin-top: -0.25rem;
}

.details {
  padding: 0rem 3rem 3rem 3rem;
}

.breadcrumb {
  font-size: 0.9rem;
  margin-left: -0.5rem;
}

.breadcrumb p {
  color: $themeColorPale;
  cursor: pointer;
  margin: 0 0.5rem;
}

.breadcrumb p:hover {
  color: #cca;
}

.readme {
  padding: 1rem 0rem;
}

@media only screen and (max-width: 640px) {
}
</style>
