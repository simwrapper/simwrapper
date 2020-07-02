<template lang="pug">
#vue-component
  h2 {{ $route.name }}

  .details(v-if="myState.svnProject")
    p() {{ myState.svnProject.description }}

    h3 Folders:
    .folder(v-for="folder in myState.folders" :key="folder.name"
            @click="openOutputFolder(folder)")
      p {{ folder }}

    h3 Files:
    .file(v-for="file in myState.files" :key="file.name")
      p {{ file }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import globalStore from '@/store.ts'
import SVNFileSystem from '@/util/SVNFileSystem'

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
  svnRoot?: SVNFileSystem
  subfolder: string
}

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  private globalState = globalStore.state

  private svnp?: SVNP

  private myState: IMyState = {
    folders: [],
    files: [],
    svnProject: this.svnp,
    svnRoot: undefined,
    subfolder: '',
  }

  private mounted() {
    this.updateRoute()
  }

  private openOutputFolder(folder: string) {
    console.log(folder)
    if (!this.myState.svnProject) return

    const path = '/' + this.myState.svnProject.url + '/' + this.myState.subfolder + '/' + folder
    this.$router.push({ path })
  }

  @Watch('$route') async updateRoute() {
    console.log('Project page!', this.$route.name)

    const svnProject: any[] = this.globalState.svnProjects.filter(
      (a: any) => a.url === this.$route.name
    )

    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }

    this.myState.svnProject = svnProject[0]
    this.myState.folders = []
    this.myState.files = []
    this.myState.subfolder = this.$route.params.pathMatch ? this.$route.params.pathMatch : ''

    if (!this.myState.svnProject) return
    this.myState.svnRoot = new SVNFileSystem(this.myState.svnProject.svn)

    // this happens async
    this.fetchFolderContents()
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
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#vue-component {
  padding: 3rem 3rem;
}

h3,
h4 {
  margin-top: 2rem;
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

@media only screen and (max-width: 640px) {
}
</style>
