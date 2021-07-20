<template lang="pug">
.tabbed-folder-view

  .tabholder(v-show="!isZoomed")
    .breadcrumbs
      p {{ root }} • {{ xsubfolder && xsubfolder.startsWith('/') ? '' : '/' }}{{ xsubfolder }}

    .tabs.is-centered
      ul
        li(v-for="tab in Object.keys(dashboards)" :key="tab"
          :class="{'is-active': tab===activeTab, 'is-not-active': tab!==activeTab}"
          :style="{opacity: tab===activeTab ? 1.0 : 0.6}"
        )
          b: a(@click="switchTab(tab)") {{ dashboards[tab].header.tab }}


  dash-board(v-if="activeTab && activeTab !== 'FILE__BROWSER'"
    :root="root"
    :xsubfolder="xsubfolder"
    :config="dashboards[activeTab]"
    @zoom="handleZoom"
  )

  folder-browser(v-if="activeTab && activeTab === 'FILE__BROWSER'"
    :root="root"
    :xsubfolder="xsubfolder"
    @navigate="onNavigate"
  )

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import micromatch from 'micromatch'
import YAML from 'yaml'

import { FileSystemConfig } from '@/Globals'
import DashBoard from '@/views/DashBoard.vue'
import FolderBrowser from '@/views/FolderBrowser.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

@Component({ components: { DashBoard, FolderBrowser }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: false }) private xsubfolder!: string

  private activeTab = ''
  private fileSystemConfig!: FileSystemConfig
  private fileApi!: HTTPFileSystem

  private dashboards: any = []

  private isZoomed = false

  private mounted() {
    this.updateRoute()
  }

  @Watch('root')
  @Watch('xsubfolder')
  private updateRoute() {
    this.fileSystemConfig = this.getFileSystem(this.root)
    if (!this.fileSystemConfig) return

    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)

    // this.generateBreadcrumbs()

    // this happens async
    this.dashboards = []
    this.findDashboards()
  }

  private onNavigate(options: any) {
    this.$emit('navigate', options)
  }

  private async findDashboards() {
    if (!this.fileApi) return []

    try {
      const { files } = await this.fileApi.getDirectory(this.xsubfolder)
      const dashboards = micromatch(files, 'dashboard*.y?(a)ml')

      for (const filename of dashboards) {
        // add the tab now
        Vue.set(this.dashboards, filename, { header: { tab: '...' } })
        // load the details (title) async
        this.initDashboard(filename)
      }

      // Add FileBrowser as "Details" tab
      Vue.set(this.dashboards, 'FILE__BROWSER', { header: { tab: 'Details' } })

      // Start on first tab
      this.activeTab = Object.keys(this.dashboards)[0]
    } catch (e) {
      // Bad things happened! Tell user
      console.error({ eeee: e })
    }
  }

  // for each dashboard, fetch the yaml, set the tab title, and config the ... switcher?
  private async initDashboard(filename: string) {
    const config = await this.fileApi.getFileText(`${this.xsubfolder}/${filename}`)
    const yaml = YAML.parse(config)
    const shortFilename = filename.substring(0, filename.lastIndexOf('.'))
    if (!yaml.header) yaml.header = { title: filename, tab: shortFilename }
    if (!yaml.header.tab) yaml.header.tab = yaml.header.title || shortFilename

    this.dashboards[filename] = yaml
  }

  private async switchTab(tab: string) {
    if (tab === this.activeTab) return

    // We are going to force teardown the dashboard to ensure we
    // start with a clean slate
    this.activeTab = ''
    await this.$nextTick()
    this.activeTab = tab
  }

  private handleZoom(isZoomed: any) {
    this.isZoomed = !!isZoomed
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )

    if (svnProject.length === 0) {
      console.log('no such project')
      throw Error
    }

    return svnProject[0]
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.tabbed-folder-view {
  margin: 0 0;
  padding: 0 0;
  background-color: var(--bgDashboard);
  flex-direction: column;
  overflow-y: auto;
}

.tabs {
  margin: 0 3rem;
}

.tabholder {
  margin: 0 auto;
  background-color: var(--bgDashboard);
  z-index: 10;
  top: 0px;
  position: sticky;
}

li.is-not-active b a {
  color: var(--text);
}

.breadcrumbs {
  padding: 0.25rem 0 0 0;
  color: var(--linkFancy);
  font-size: 1.5rem;
  font-weight: bold;
  text-align: center;
  margin-top: 0.5rem;
  margin-left: 1rem;

  p {
    margin: 0 2rem;
  }
}

@media only screen and (max-width: 50em) {
}
</style>
