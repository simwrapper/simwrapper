<template lang="pug">
.tabbed-folder-view

  .tabholder(v-show="!isZoomed")
    .tabholdercontainer
      .breadcrumbs
        h3 {{ pageHeader }}
        h4 {{ root }}: {{ xsubfolder && xsubfolder.startsWith('/') ? '' : '/' }}{{ xsubfolder }}

      .tabs.is-centered
        b.up-link: a(@click="goUpOneFolder()") ^ UP
        ul
          li(v-for="tab in Object.keys(dashboards)" :key="tab"
            :class="{'is-active': tab===activeTab, 'is-not-active': tab!==activeTab}"
            :style="{opacity: tab===activeTab ? 1.0 : 0.5}"
          )
            b: a(v-if="dashboards[tab].header" @click="switchTab(tab)") {{ dashboards[tab].header.tab }}


  dash-board(v-if="dashboardTabWithDelay && dashboardTabWithDelay !== 'FILE__BROWSER' && dashboards[dashboardTabWithDelay] && dashboards[dashboardTabWithDelay].header.tab !== '...'"
    :root="root"
    :xsubfolder="xsubfolder"
    :config="dashboards[dashboardTabWithDelay]"
    :datamanager="dashboardDataManager"
    :zoomed="isZoomed"
    :allConfigFiles="allConfigFiles"
    @zoom="handleZoom"
  )

  folder-browser(v-if="dashboardTabWithDelay && dashboardTabWithDelay === 'FILE__BROWSER'"
    :root="root"
    :xsubfolder="xsubfolder"
    :allConfigFiles="allConfigFiles"
    @navigate="onNavigate"
  )

  p.load-error: b {{ loadErrorMessage }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import YAML from 'yaml'

import { FileSystemConfig, Status, YamlConfigs } from '@/Globals'
import DashBoard from '@/views/DashBoard.vue'
import FolderBrowser from '@/views/FolderBrowser.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'

@Component({ components: { DashBoard, FolderBrowser }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: false }) private xsubfolder!: string

  private activeTab = ''
  private fileSystemConfig!: FileSystemConfig
  private fileApi!: HTTPFileSystem

  private dashboards: any = []
  private dashboardDataManager?: DashboardDataManager

  private allConfigFiles: YamlConfigs = { dashboards: {}, topsheets: {}, vizes: {} }

  private isZoomed = false
  private loadErrorMessage = ''
  private pageHeader = ''

  private mounted() {
    this.updateRoute()
  }

  private beforeDestroy() {
    if (this.dashboardDataManager) this.dashboardDataManager.clearCache()
  }

  private getPageHeader() {
    if (this.xsubfolder) return this.xsubfolder.substring(1 + this.xsubfolder.lastIndexOf('/'))

    return this.fileSystemConfig.name || this.root
  }

  @Watch('root')
  @Watch('xsubfolder')
  private updateRoute() {
    const fsConfig = this.getFileSystem(this.root)
    if (!fsConfig) return

    this.fileSystemConfig = fsConfig
    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)

    if (this.dashboardDataManager) this.dashboardDataManager.clearCache()
    this.dashboardDataManager = new DashboardDataManager(this.root, this.xsubfolder)

    this.pageHeader = this.getPageHeader()
    // this.generateBreadcrumbs()

    // this happens async
    this.dashboards = []
    this.findDashboards()
  }

  private onNavigate(options: any) {
    this.$emit('navigate', options)
  }

  private async findDashboards() {
    this.loadErrorMessage = ''
    if (!this.fileApi) return []

    try {
      this.allConfigFiles = await this.fileApi.findAllYamlConfigs(this.xsubfolder)

      for (const fullPath of Object.values(this.allConfigFiles.dashboards)) {
        // add the tab now
        Vue.set(this.dashboards, fullPath, { header: { tab: '...' } })
        // load the details (title) async
        this.initDashboard(fullPath)
      }

      // Add FileBrowser as "Files" tab
      Vue.set(this.dashboards, 'FILE__BROWSER', { header: { tab: 'Files' } })

      // // Start on first tab
      this.activeTab = Object.keys(this.dashboards)[0]
      this.dashboardTabWithDelay = this.activeTab
    } catch (e) {
      // Bad things happened! Tell user
      console.warn({ eeee: e })
      this.loadErrorMessage = this.fileSystemConfig.baseURL + ': Could not load'
    }
  }

  // for each dashboard, fetch the yaml, set the tab title, and config the ... switcher?
  private async initDashboard(fullPath: string) {
    try {
      const config = await this.fileApi.getFileText(fullPath)
      const yaml = YAML.parse(config)
      const shortFilename = fullPath.substring(0, fullPath.lastIndexOf('.'))
      if (!yaml.header) yaml.header = { title: fullPath, tab: shortFilename }
      if (!yaml.header.tab) yaml.header.tab = yaml.header.title || shortFilename

      this.dashboards[fullPath] = yaml
      console.log('DASHBOARD:', fullPath)
    } catch (e) {
      this.$store.commit('setStatus', { type: Status.ERROR, msg: '' + e })
    }
  }

  private dashboardTabWithDelay = ''

  private async switchTab(tab: string) {
    if (tab === this.activeTab) return

    // Force teardown the dashboard to ensure we start with a clean slate
    this.activeTab = ''
    this.dashboardTabWithDelay = ''
    await this.$nextTick()

    this.activeTab = tab

    // to give browser time to teardown
    setTimeout(() => {
      this.dashboardTabWithDelay = tab
    }, 150)
  }

  private handleZoom(isZoomed: any) {
    this.isZoomed = !!isZoomed
    this.$emit('zoom', this.isZoomed)
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )

    if (svnProject.length === 0) {
      console.warn('no such project')
      return null
    }

    return svnProject[0]
  }

  private goUpOneFolder() {
    // if (this.myState.isLoading) return
    if (!this.fileSystemConfig) return

    const target = this.xsubfolder.substring(0, this.xsubfolder.lastIndexOf('/'))

    const props = {
      root: this.fileSystemConfig.slug,
      xsubfolder: target,
    }

    // if we are at top of hierarchy, jump to splashpage
    if (!target && !this.xsubfolder) {
      this.onNavigate({ component: 'SplashPage', props: {} })
    } else {
      this.onNavigate({ component: 'TabbedDashboardView', props })
    }
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
  margin: 0 0rem;
}

.tabs ul {
  border-bottom-color: var(--bg);
  border-bottom-width: 1px;
}

.tabholder {
  max-width: $dashboardWidth + 3;
  margin: 0 auto;
  z-index: 50;
  top: 0px;
  position: sticky;
  background-color: var(--bgDashboard);
}

.tabholdercontainer {
  background-image: var(--bgDashboard);
  // background-image: var(--bgTabBanner);
  margin: 0 3rem;
}

// li.is-active b a {
//   // color: #ebff67;
//   text-transform: uppercase;
// }

li.is-not-active b a {
  color: var(--text);
  // text-transform: uppercase;
  // border-bottom-color: var(--bg);
}

.breadcrumbs {
  background-image: var(--bgTabBanner);
  padding: 0.25rem 0 1rem 1rem;
  color: var(--linkFancy);
  font-size: 1.5rem;
  text-align: center;

  h3 {
    color: white;
    font-weight: bold;
  }

  h4 {
    line-height: 1rem;
    margin: 0;
    color: #e4e4e4;
    font-size: 1.1rem;
  }

  p {
    max-width: $dashboardWidth;
    margin: 0 2rem;
  }
}

.tabs ul {
  margin-right: 4rem;
}

.up-link {
  margin-left: -0.75rem;
}

.up-link a {
  color: var(--link);
  border-bottom: none;
}
.up-link a:hover {
  color: var(--linkHover);
}

.load-error {
  margin-top: 2rem;
  text-align: center;
}

@media only screen and (max-width: 50em) {
  .tabholdercontainer {
    margin: 0 1rem;
  }
}
</style>
