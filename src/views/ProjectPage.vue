<template lang="pug">
#vue-component
  .project-bar(v-if="myState.svnProject")
    h2 {{ myState.svnProject.name }}
    p {{ myState.svnProject.description }}

  .details(v-if="myState.svnProject")
    nav.breadcrumb(aria-label="breadcrumbs")
      ul
        li(v-for="crumb in breadcrumbs" :key="crumb.label + crumb.url"
           @click="clickedLink(crumb.url)")
            p {{ crumb.label }}

    h3 Folders
    .folder(v-for="folder in myState.folders" :key="folder.name"
            @click="openOutputFolder(folder)")
      p {{ folder }}

    .vizes(v-for="viz in myState.vizes.length")
      component(:is="myState.vizes[viz-1][0]"
                :yamlConfig="myState.vizes[viz-1][1]"
                :fileApi="myState.svnRoot"
                :subfolder="myState.subfolder"
      )

    h3 Files
    .file(v-for="file in myState.files" :key="file.name")
      p {{ file }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import micromatch from 'micromatch'

import globalStore from '@/store.ts'
import HTTPFileSystem from '@/util/HTTPFileSystem'
import SankeyDiagram from '@/plugins/sankey/SankeyDiagram.vue'
import { BreadCrumb } from '../Globals'

interface SVNP {
  name: string
  url: string
  description: string
  svn: string
  needs_password: boolean
}

interface IMyState {
  folders: string[]
  files: string[]
  svnProject?: SVNP
  svnRoot?: HTTPFileSystem
  subfolder: string
  vizes: [string, string][] // [component-id, configfile]
}

@Component({ components: { SankeyDiagram }, props: {} })
export default class VueComponent extends Vue {
  private globalState = globalStore.state

  private svnp?: SVNP
  private myState: IMyState = {
    folders: [],
    files: [],
    svnProject: this.svnp,
    svnRoot: undefined,
    subfolder: '',
    vizes: [],
  }

  private sankeyDiagrams: any[] = [{ yaml: 'sankey.yaml' }]

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
    crumbs[crumbs.length - 1].url = '#'

    return crumbs
  }

  private mounted() {
    this.updateRoute()
  }

  private clickedLink(path: string) {
    console.log(path)
    this.$router.push({ path })
  }

  @Watch('$route') async updateRoute() {
    if (!this.$route.name) return

    const svnProject = this.getFileSystem(this.$route.name)

    this.myState.svnProject = svnProject
    this.myState.folders = []
    this.myState.files = []
    this.myState.subfolder = this.$route.params.pathMatch ? this.$route.params.pathMatch : ''

    if (!this.myState.svnProject) return
    this.myState.svnRoot = new HTTPFileSystem(this.myState.svnProject.svn, '', '')

    // this happens async
    this.fetchFolderContents()
  }

  @Watch('myState.files') async filesChanged() {
    // clear visualizations
    this.myState.vizes = []
    if (this.myState.files.length === 0) return

    // loop on each viz type
    for (const viz of this.globalState.visualizationTypes.values()) {
      // filter based on file matching
      const matches = micromatch(this.myState.files, viz.filePatterns)
      // console.log(matches)

      for (const file of matches) {
        // add thumbnail for each matching file
        this.myState.vizes.push([viz.kebabName, file])
      }
    }
    console.log('TOTAL VIZ:', this.myState.vizes.length)
  }

  private async fetchFolderContents() {
    if (!this.myState.svnRoot) return []

    const folderContents = await this.myState.svnRoot.getDirectory(this.myState.subfolder)

    if (folderContents.dirs.length === 0 && folderContents.files.length === 0) {
      // User gave a bad URL; maybe tell them.
      console.log('BAD PAGE')
      // this.setBadPage()
      return []
    }

    const folders = folderContents.dirs.sort()
    const files = folderContents.files.sort()

    this.myState.folders = folders
    this.myState.files = files
  }

  private openOutputFolder(folder: string) {
    console.log(folder)
    if (!this.myState.svnProject) return

    const path = '/' + this.myState.svnProject.url + '/' + this.myState.subfolder + '/' + folder
    console.log(path)
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
  padding: 1rem 3rem 3rem 3rem;
}

.breadcrumb {
  font-size: 0.85rem;
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

@media only screen and (max-width: 640px) {
}
</style>
