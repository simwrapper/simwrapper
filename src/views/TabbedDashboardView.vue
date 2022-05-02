<template lang="pug">
.tabbed-folder-view

  .tabholder(v-show="!isZoomed" :class="{wiide}" :style="dashWidthCalculator")
    .tabholdercontainer(:class="{wiide}")
      .project-header(v-if="header" v-html="header" :class="{wiide}")
      .breadcrumbs(v-else)
        h3 {{ pageHeader }}
        h4 {{ root }}: {{ xsubfolder && xsubfolder.startsWith('/') ? '' : '/' }}{{ xsubfolder }}

      .tabs.is-centered
        b.up-link(:style="{marginLeft: wiide ? '1rem':'-0.75rem'}")
          a(@click="goUpOneFolder()") ^ UP

        ul(:style="{marginRight: wiide ? '4rem':'4rem'}")
          li(v-for="tab,index in Object.keys(dashboards)" :key="tab"
            :class="{'is-active': tab===activeTab, 'is-not-active': tab!==activeTab}"
            :style="{opacity: tab===activeTab ? 1.0 : 0.5}"
          )
            b: a(v-if="dashboards[tab].header" @click="switchTab(tab,index)") {{ dashboards[tab].header.tab }}

  dash-board(v-if="dashboardTabWithDelay && dashboardTabWithDelay !== 'FILE__BROWSER' && dashboards[dashboardTabWithDelay] && dashboards[dashboardTabWithDelay].header.tab !== '...'"
    :root="root"
    :xsubfolder="xsubfolder"
    :config="dashboards[dashboardTabWithDelay]"
    :datamanager="dashboardDataManager"
    :zoomed="isZoomed"
    :allConfigFiles="allConfigFiles"
    @zoom="handleZoom"
    @layoutComplete="handleLayoutComplete"
  )

  folder-browser(v-if="dashboardTabWithDelay && dashboardTabWithDelay === 'FILE__BROWSER'"
    :root="root"
    :xsubfolder="xsubfolder"
    :allConfigFiles="allConfigFiles"
    @navigate="onNavigate"
  )

  p.load-error(v-show="loadErrorMessage" @click="authorizeAfterError"): b {{ loadErrorMessage }}

  .tabholder(v-show="showFooter && !isZoomed" :class="{wiide}" :style="dashWidthCalculator")
    .tabholdercontainer(:class="{wiide}")
      .project-footer(v-if="footer" v-html="footer" :class="{wiide}")

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import markdown from 'markdown-it'
import micromatch from 'micromatch'
import DOMPurify from 'dompurify'
import YAML from 'yaml'

import { FileSystemConfig, Status, YamlConfigs } from '@/Globals'
import DashBoard from '@/views/DashBoard.vue'
import FolderBrowser from '@/views/FolderBrowser.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'

const NO_DASHBOARDS = '.nodashboards'

const mdRenderer = new markdown({
  html: true,
  linkify: true,
  typographer: true,
})

@Component({ components: { DashBoard, FolderBrowser }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private root!: string
  @Prop({ required: false }) private xsubfolder!: string

  private activeTab = ''
  private fileSystemConfig!: FileSystemConfig
  private fileApi!: HTTPFileSystem

  private dashboards: any = []
  private dashboardDataManager?: DashboardDataManager

  private allConfigFiles: YamlConfigs = { dashboards: {}, topsheets: {}, vizes: {}, configs: {} }

  private isZoomed = false
  private loadErrorMessage = ''
  private pageHeader = ''

  private header = ''
  private footer = ''
  private customCSS = ''

  private mounted() {
    this.updateRoute()
  }

  private get wiide() {
    return this.$store.state.isFullWidth
  }

  private get dashWidthCalculator() {
    if (this.$store.state.dashboardWidth && this.$store.state.isFullWidth) {
      return { maxWidth: this.$store.state.dashboardWidth }
    }
    return {}
  }

  private beforeDestroy() {
    if (this.dashboardDataManager) this.dashboardDataManager.clearCache()
    this.clearStyles()
  }

  private clearStyles() {
    if (this.styleElement) {
      document.getElementsByTagName('head')[0].removeChild(this.styleElement)
      this.styleElement = null
    }
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

    this.clearStyles()

    this.fileSystemConfig = fsConfig
    this.fileApi = new HTTPFileSystem(this.fileSystemConfig)

    if (this.dashboardDataManager) this.dashboardDataManager.clearCache()
    this.dashboardDataManager = new DashboardDataManager(this.root, this.xsubfolder)

    this.header = ''
    this.footer = ''
    this.pageHeader = this.getPageHeader()
    // this.generateBreadcrumbs()

    // this happens async
    this.dashboards = []
    this.findConfigsAndDashboards()
  }

  private onNavigate(options: any) {
    this.$emit('navigate', options)
  }

  private async findConfigsAndDashboards() {
    this.loadErrorMessage = ''
    if (!this.fileApi) return []

    try {
      this.allConfigFiles = await this.fileApi.findAllYamlConfigs(this.xsubfolder)

      const { files } = await this.fileApi.getDirectory(this.xsubfolder)

      // if folder has .nodashboards, then skip all dashboards!
      if (files.indexOf(NO_DASHBOARDS) == -1) {
        for (const fullPath of Object.values(this.allConfigFiles.dashboards)) {
          // add the tab now
          Vue.set(this.dashboards, fullPath, { header: { tab: '...' } })
          // load the details (title)
          const showThisDashboard = await this.initDashboard(fullPath)
          // and now remove it if it isn't triggered. Yes this order is correct
          if (!showThisDashboard) delete this.dashboards[fullPath]
        }
      }

      // Add FileBrowser as "Files" tab
      Vue.set(this.dashboards, 'FILE__BROWSER', { header: { tab: 'Files' } })

      // // Start on correct tab
      if (this.$route.query.tab) {
        try {
          const userSupplied = parseInt('' + this.$route.query.tab) - 1
          const userTab = Object.keys(this.dashboards)[userSupplied]
          this.activeTab = userTab || Object.keys(this.dashboards)[0]
        } catch (e) {
          // user spam; just use first tab
          this.activeTab = Object.keys(this.dashboards)[0]
        }
      } else {
        this.activeTab = Object.keys(this.dashboards)[0]
      }
      this.dashboardTabWithDelay = this.activeTab

      // headers, footers, etc
      await this.setupProjectConfig()
    } catch (e) {
      // Bad things happened! Tell user
      console.warn({ eeee: e })
      if (this.fileSystemConfig.handle) {
        this.loadErrorMessage = `Click to grant access to folder "${this.fileSystemConfig.handle.name}"`
      } else {
        this.loadErrorMessage = this.fileSystemConfig.baseURL + ': Could not load'
      }
    }
  }

  private styleElement: any = null

  private async setupProjectConfig() {
    // no configs mean no setup is necessary
    if (!Object.keys(this.allConfigFiles.configs).length) {
      // no config, so show navbar and be done
      this.$store.commit('setShowLeftBar', true)
      return
    }

    for (const filename of Object.values(this.allConfigFiles.configs)) {
      try {
        const config = await this.fileApi.getFileText(filename)
        const yaml = YAML.parse(config)

        // figure out relative path for config file
        const yamlFolder = filename.startsWith('http')
          ? ''
          : filename.substring(0, filename.indexOf('simwrapper-config.y'))

        // always reveal quickview bar unless told not to
        this.$store.commit('setShowLeftBar', !!!yaml.hideLeftBar)

        // set margins wide if requested to do so
        this.$store.commit('setFullWidth', !!yaml.fullWidth)
        this.$store.commit('setDashboardWidth', '')
        if (yaml.width !== undefined) {
          this.$store.commit('setDashboardWidth', '' + yaml.width)
          this.$store.commit('setFullWidth', true)
        }

        try {
          if (yaml.css) {
            this.customCSS = await this.fileApi.getFileText(`${yamlFolder}${yaml.css}`)
            this.styleElement = document.createElement('style')
            this.styleElement.appendChild(document.createTextNode(this.customCSS))
            document.getElementsByTagName('head')[0].appendChild(this.styleElement)
          }
        } catch (e) {
          // no css, oh well
        }

        this.header = await this.buildPanel('header', yaml, yamlFolder)
        this.footer = await this.buildPanel('footer', yaml, yamlFolder)
      } catch (e) {
        console.error('' + e)
      }
    }
  }

  private async buildPanel(which: string, yaml: any, folder: string) {
    // first get the correct/best header for this locale
    let header = ''
    if (this.$store.state.locale === 'de') {
      header = yaml[which + '_de'] || yaml[which] || yaml[which + '_en'] || ''
    } else {
      header = yaml[which + '_en'] || yaml[which] || yaml[which + '_de'] || ''
    }

    if (!header) return ''

    // if it is a filename, load it from disk
    if (header.indexOf('\n') == -1 && header.endsWith('.md')) {
      const text = await this.fileApi.getFileText(`${folder}${header}`)
      header = text
    }

    // convert to HTML
    const html = mdRenderer.render(header)

    // sanitize it
    const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })

    // use it
    return clean
  }

  // for each dashboard, fetch the yaml, set the tab title, and config the ... switcher?
  private async initDashboard(fullPath: string) {
    try {
      const config = await this.fileApi.getFileText(fullPath)
      const yaml = YAML.parse(config)

      // see if trigger condition is met
      if (yaml.header?.triggerPattern) {
        const { files, dirs } = await this.fileApi.getDirectory(this.xsubfolder)
        const allContents = [...files, ...dirs]
        if (micromatch.match(allContents, yaml.triggerPattern).length === 0) {
          // no files matched trigger; skip this dashboard
          return false
        }
      }

      const shortFilename = fullPath.substring(0, fullPath.lastIndexOf('.'))
      if (!yaml.header) yaml.header = { title: fullPath, tab: shortFilename }
      if (!yaml.header.tab) yaml.header.tab = yaml.header.title || shortFilename

      this.dashboards[fullPath] = yaml
      console.log('DASHBOARD:', fullPath)
      return true
    } catch (e) {
      this.$store.commit('setStatus', { type: Status.ERROR, msg: '' + e })
      return false
    }
  }

  private dashboardTabWithDelay = ''

  private async switchTab(tab: string, index: number) {
    if (tab === this.activeTab) return

    // Force teardown the dashboard to ensure we start with a clean slate
    this.activeTab = ''
    this.dashboardTabWithDelay = ''
    this.showFooter = false

    await this.$nextTick()

    this.activeTab = tab

    // to give browser time to teardown
    setTimeout(() => {
      this.dashboardTabWithDelay = tab
      if (index) {
        this.$router.replace({ query: { tab: `${index + 1}` } })
      } else {
        this.$router.replace({ query: {} })
      }
    }, 125)
  }

  private handleZoom(isZoomed: any) {
    this.isZoomed = !!isZoomed
    this.$emit('zoom', this.isZoomed)
  }

  private showFooter = false

  private handleLayoutComplete() {
    this.showFooter = true
  }

  private getFileSystem(name: string) {
    const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
      (a: FileSystemConfig) => a.slug === name
    )

    if (svnProject.length === 0) {
      console.warn('no such project')
      this.loadErrorMessage = `Can't locate "${name}": please check running services and browser version.`
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

  private async authorizeAfterError() {
    try {
      const handle = this.fileSystemConfig.handle
      if (handle) {
        const status = await handle.requestPermission({ mode: 'read' })
        if (status === 'granted') this.updateRoute()
      }
    } catch (e) {
      // meh
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

.tabholder.wiide {
  max-width: unset;
}

.tabholdercontainer {
  background-image: var(--bgDashboard);
  // background-image: var(--bgTabBanner);
  margin: 0 3rem;
}

.tabholdercontainer.wiide {
  margin: 0 0rem;
}

li.is-not-active b a {
  color: var(--text);
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

.up-link a {
  color: var(--link);
  border-bottom: none;
}

.up-link a:hover {
  color: var(--linkHover);
}

.load-error {
  margin: 3rem auto;
  padding: 1rem 0;
  border-radius: 5px;
  text-align: center;
  font-size: 1.2rem;
  color: var(--link);
  background-color: var(--bgPanel2);
  max-width: 40rem;
}

.load-error:hover {
  cursor: pointer;
  color: var(--linkHover);
  background-color: var(--bgPanel3);
}

.project-header {
  margin-bottom: 1rem;
  color: var(--text);
  padding: 1rem 0.5rem;

  ::v-deep h1 {
    font-size: 3rem;
    font-weight: bold;
  }

  ::v-deep h2 {
    font-size: 1.5rem;
    margin-top: 1rem;
  }

  ::v-deep h3 {
    font-size: 1.25rem;
    margin-top: 0.5rem;
  }

  ::v-deep h4 {
    margin-top: 0.5rem;
    font-size: 1.1rem;
  }

  ::v-deep ul {
    list-style: inside;
  }
}

.project-header.wiide {
  padding: 1rem 2rem;
}

.project-footer {
  margin: 3rem 0rem 1rem 0rem;
  padding: 1rem 1rem;
  color: var(--text);
  border-top: 2px solid #88888815;
  ::v-deep h1 {
    font-size: 2rem;
    font-weight: bold;
  }

  ::v-deep h2 {
    font-size: 1.5rem;
    margin-top: 1rem;
  }

  ::v-deep h3 {
    font-size: 1.25rem;
    margin-top: 0.5rem;
  }

  ::v-deep h4 {
    margin-top: 0.5rem;
    font-size: 1.1rem;
  }

  ::v-deep ul {
    list-style: inside;
  }
}

.project-footer.wiide {
  margin: 3rem 0rem 1rem 0rem;
  padding: 1rem 2rem;
  border-top: none;
  background-color: #88888815;
  color: var(--text);
}

@media only screen and (max-width: 50em) {
  .tabholdercontainer {
    margin: 0 1rem;
  }
}
</style>
