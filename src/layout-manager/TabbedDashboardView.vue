<template lang="pug">
.tabbed-folder-view

  p.load-error(v-show="loadErrorMessage" @click="authorizeAfterError"): b {{ loadErrorMessage }}

  .tabholder(v-if="isShowingBreadcrumbs && !isMultipanel && !isZoomed" :style="dashWidthCalculator")
    .tab-holder-container.flex-col.white-text
      .project-path.flex-row(v-show="!header")
          bread-crumbs.breadcrumbs(
              :root="root"
              :subfolder="xsubfolder"
              @navigate="onNavigate"
              @crumbs="updateCrumbs"
          )
          p.favorite-icon(v-if="!header"
              @click="clickedFavorite"
              title="Favorite"
              :class="{'is-favorite': isFavorite}"
            ): i.fa.fa-star

      .project-header(v-if="header" v-html="header")

  .dashboard-finder(:class="{isMultipanel, isZoomed}")
    ul.dashboard-right-sections(v-show="!isZoomed && Object.keys(dashboards).length > 1")
      li.tab-list(v-for="tab,index in Object.keys(dashboards)" :key="tab"
        :class="{'is-active': tab===activeTab, 'is-not-active': tab!==activeTab}"
        :style="{opacity: tab===activeTab ? 1.0 : 0.75}"
        @click="switchLeftTab(tab,index)"
      )
        a(v-if="dashboards[tab].header" @click="switchLeftTab(tab,index)") {{ dashboards[tab].header.tab }}

    .dashboard-content(
      v-if="dashboardTabWithDelay && dashboardTabWithDelay !== 'FILE__BROWSER' && dashboards[dashboardTabWithDelay] && dashboards[dashboardTabWithDelay].header.tab !== '...'"
      :class="{'is-breadcrumbs-hidden': !isShowingBreadcrumbs && !isZoomed}"
    )
      dash-board(
        :root="root"
        :xsubfolder="xsubfolder"
        :config="dashboards[dashboardTabWithDelay]"
        :datamanager="dashboardDataManager"
        :zoomed="isZoomed"
        :allConfigFiles="allConfigFiles"
        @zoom="handleZoom"
        @layoutComplete="handleLayoutComplete"
      )

    folder-browser.dashboard-folder-browser(v-if="dashboardTabWithDelay && dashboardTabWithDelay === 'FILE__BROWSER'"
      :root="root"
      :xsubfolder="xsubfolder"
      :allConfigFiles="allConfigFiles"
      @navigate="onNavigate"
      @up="goUpOneFolder()"
    )

  footer.footer-holder(v-show="showFooter && !isZoomed" :class="{wiide}" :style="dashWidthCalculator")
    .tab-holder-container(:class="{wiide}")
      .project-footer(v-if="footer" v-html="footer" :class="{wiide}")

</template>

<script lang="ts">
import Vue, { defineComponent } from 'vue'

import markdown from 'markdown-it'
import micromatch from 'micromatch'
import YAML from 'yaml'

import globalStore from '@/store'
import { FavoriteLocation, FileSystemConfig, NavigationItem, Status, YamlConfigs } from '@/Globals'
import BreadCrumbs from '@/components/BreadCrumbs.vue'
import DashBoard from './DashBoard.vue'
import DashboardDataManager from '@/js/DashboardDataManager'
import FolderBrowser from './FolderBrowser.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'

const NO_DASHBOARDS = ['.nodashboards', 'nodashboards', 'nodashboards.txt']

const mdRenderer = new markdown({
  html: true,
  linkify: true,
  typographer: true,
})

export default defineComponent({
  name: 'TabbedDashboardView',
  components: { BreadCrumbs, DashBoard, FolderBrowser },
  props: {
    root: { type: String, required: true },
    xsubfolder: { type: String, required: true },
    isMultipanel: { type: Boolean, required: false },
  },
  data: () => {
    return {
      activeTab: '',
      allConfigFiles: { dashboards: {}, topsheets: {}, vizes: {}, configs: {} } as YamlConfigs,
      crumbs: [] as any,
      customCSS: '',
      dashboards: [] as any[],
      dashboardDataManager: null as DashboardDataManager | null,
      dashboardTabWithDelay: '',
      finalFolder: '',
      folderReadme: '',
      footer: '',
      globalState: globalStore.state,
      header: '',
      isShowingBreadcrumbs: false,
      isZoomed: false,
      loadErrorMessage: '',
      pageHeader: '',
      showFooter: false,
      styleElement: null as any,
      // project site navigation
      leftNavItems: null as null | {
        top: NavigationItem[]
        middle: NavigationItem[]
        bottom: NavigationItem[]
      },
      topNavItems: null as null | {
        fileSystem: FileSystemConfig
        subfolder: string
        left: NavigationItem[]
        right: NavigationItem[]
        logo?: NavigationItem
        style?: any
      },
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },
    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },
    wiide(): boolean {
      return this.$store.state.isFullWidth
    },

    dashWidthCalculator(): any {
      if (this.$store.state.dashboardWidth && this.$store.state.isFullWidth) {
        return { maxWidth: this.$store.state.dashboardWidth }
      }
      return {}
    },

    isFavorite(): any {
      let key = this.root
      if (this.xsubfolder) key += `/${this.xsubfolder}`
      if (key.endsWith('/')) key = key.substring(0, key.length - 1)

      const indexOfPathInFavorites = this.globalState.favoriteLocations.findIndex(
        f => key == f.fullPath
      )
      return indexOfPathInFavorites > -1
    },
  },
  watch: {
    root() {
      this.updateRoute()
    },
    xsubfolder() {
      this.updateRoute()
    },
    'globalState.colorScheme'() {
      const allConfigs = Object.values(this.allConfigFiles.configs)
      if (!allConfigs.length) return

      // Set theme for bottommost config only
      const config = allConfigs[allConfigs.length - 1]
      const configKey = `theme-${config}`
      localStorage.setItem(configKey, this.globalState.colorScheme)
    },
  },
  methods: {
    clearStyles() {
      if (this.styleElement) {
        document.getElementsByTagName('head')[0].removeChild(this.styleElement)
        this.styleElement = null
      }
    },

    getPageHeader() {
      if (this.xsubfolder) return this.xsubfolder.substring(1 + this.xsubfolder.lastIndexOf('/'))

      return this.fileSystem.name || this.root
    },

    onNavigate(options: any) {
      // make sure folders have a trailing slash or relative paths in markdown files die
      if (options?.props?.xsubfolder) {
        if (!options.props.xsubfolder.endsWith('/')) options.props.xsubfolder += '/'
      }

      this.$emit('navigate', options)
      this.setTitle()
    },

    clickedFavorite() {
      let hint = `${this.root}/${this.xsubfolder}`
      // remove current folder from subfolder
      hint = hint.substring(0, hint.lastIndexOf('/'))

      let fullPath = `${this.root}/${this.xsubfolder}`
      if (fullPath.endsWith('/')) fullPath = fullPath.substring(0, fullPath.length - 1)

      const favorite: FavoriteLocation = {
        root: this.root,
        subfolder: this.xsubfolder,
        label: this.finalFolder,
        fullPath,
        hint,
      }

      this.$store.commit(this.isFavorite ? 'removeFavorite' : 'addFavorite', favorite)
    },

    async getFolderReadme() {
      try {
        this.folderReadme = ''
        const { files } = await this.fileApi.getDirectory(this.xsubfolder)
        const readmes = files.filter(f => f.toLocaleLowerCase() === 'readme.md')
        if (!readmes.length) return

        const readmeText = await this.fileApi.getFileText(`${this.xsubfolder}/${readmes[0]}`)
        const html = mdRenderer.render(readmeText)
        this.folderReadme = html
      } catch (e) {
        // no readme is OK
        this.folderReadme = ''
      }
    },

    async findConfigsAndDashboards() {
      this.loadErrorMessage = ''
      if (!this.fileApi) return []

      await this.fileApi.getChromePermission(this.fileSystem.handle)

      this.getFolderReadme()

      try {
        this.allConfigFiles = await this.fileApi.findAllYamlConfigs(this.xsubfolder)

        const { files } = await this.fileApi.getDirectory(this.xsubfolder)

        // if folder has .nodashboards, then skip all dashboards!
        let showDashboards = true
        NO_DASHBOARDS.forEach(filename => {
          if (files.indexOf(filename) > -1) {
            showDashboards = false
          }
        })

        // headers, footers, etc
        await this.setupProjectConfig()
        await this.$nextTick()

        if (showDashboards) {
          for (const fullPath of Object.values(this.allConfigFiles.dashboards)) {
            // add the tab now
            Vue.set(this.dashboards, fullPath, { header: { tab: '...' } })
            // load the details (title)
            const showThisDashboard = await this.initDashboard(fullPath)
            // and now remove it if it isn't triggered. Yes this order is correct
            if (!showThisDashboard) delete this.dashboards[fullPath as any]
          }
        }

        // Add FileBrowser as "Files" tab
        if (this.globalState.isShowingFilesTab) {
          Vue.set(this.dashboards, 'FILE__BROWSER', { header: { tab: 'Files' } })
        }

        // // Start on correct tab
        const dashboardKeys = Object.keys(this.dashboards)
        if (this.$route.query.tab) {
          try {
            const userSupplied = parseInt('' + this.$route.query.tab) - 1
            const userTab = dashboardKeys[userSupplied]
            this.activeTab = userTab || dashboardKeys[0]
          } catch (e) {
            // user spam; just use first tab
            this.activeTab = dashboardKeys[0]
          }
        } else {
          this.activeTab = dashboardKeys[0]
        }
        this.dashboardTabWithDelay = this.activeTab
      } catch (e) {
        // Bad things happened! Tell user
        console.warn({ eeee: e })
        if (this.fileSystem.handle) {
          this.loadErrorMessage = `Click to grant access to folder "${this.fileSystem.handle.name}"`
        } else {
          this.loadErrorMessage =
            this.fileSystem.baseURL + '/' + this.xsubfolder + ': Could not load'
        }
      }
    },

    async setupProjectConfig() {
      const allConfigs = Object.values(this.allConfigFiles.configs)

      // no configs: no project mode.
      if (!allConfigs.length) {
        this.isShowingBreadcrumbs = true
        return
      }

      // configs: set up "project mode" ----------------------------------
      let projectFolder = ''
      for (const filename of allConfigs) {
        try {
          let yamlFolder = ''
          const config = await this.fileApi.getFileText(filename)
          const yaml = YAML.parse(config)

          // figure out relative path for config file
          if (!filename.startsWith('http')) {
            const i = filename.indexOf('simwrapper-config.y')
            yamlFolder = filename.substring(0, i)
            // project folder is the folder CONTAINING the simwrapper-config.yaml file
            const chunks = yamlFolder.split('/')
            projectFolder = chunks.slice(0, chunks.length - 2).join('/')
          }

          // always reveal quickview bar unless told not to
          if (yaml.hideLeftBar === true) {
            this.$store.commit('setShowLeftBar', false)
          }

          // theme
          if (yaml.theme) this.setProjectTheme(yaml.theme, filename)

          // set margins wide if requested to do so
          this.$store.commit('setFullWidth', !!yaml.fullWidth)
          this.$store.commit('setDashboardWidth', '')
          if (yaml.width !== undefined) {
            this.$store.commit('setDashboardWidth', '' + yaml.width)
            this.$store.commit('setFullWidth', true)
          }

          if (yaml.hideFilesSection || yaml.hideFiles) {
            this.$store.commit('setShowFilesTab', false)
          }

          // Breadcrumb-Bar. Delicious!
          this.isShowingBreadcrumbs = !yaml.hideBreadcrumbs
          // if (yaml.hideBreadcrumbs) this.isShowingBreadcrumbs = false

          // TOP Nav Bar -----------------------------------
          if (yaml.topNavBar) {
            this.topNavItems = {
              left: [],
              right: [],
              fileSystem: this.fileSystem,
              subfolder: this.xsubfolder,
              style: yaml.topNavBar.style,
            }

            if (yaml.topNavBar.logo) this.topNavItems.logo = yaml.topNavBar.logo

            if (yaml.topNavBar.left) {
              this.topNavItems.left = this.topNavItems.left.concat(yaml.topNavBar.left)
            }
            if (yaml.topNavBar.right) {
              this.topNavItems.right = this.topNavItems.right.concat(yaml.topNavBar.right)
            }
          }
          this.$store.commit('setTopNavItems', this.topNavItems)

          // Left-Nav Panel --------------------------------
          if (yaml.leftNavBar) {
            // if (!this.leftNavItems) this.leftNavItems = { top: [], middle: [], bottom: [] }
            this.leftNavItems = { top: [], middle: [], bottom: [] }

            if (yaml.leftNavBar.top) {
              this.leftNavItems.top = this.leftNavItems.top.concat(yaml.leftNavBar.top)
            }
            if (yaml.leftNavBar.middle) {
              this.leftNavItems.middle = this.leftNavItems.middle.concat(yaml.leftNavBar.middle)
            }
            if (yaml.leftNavBar.bottom) {
              this.leftNavItems.bottom = this.leftNavItems.bottom.concat(yaml.leftNavBar.bottom)
            }

            // User defined a leftNavBar: so make it visible
            this.$store.commit('setShowLeftBar', true)
            this.$store.commit('setLeftNavItems', this.leftNavItems)

            this.$emit('activate', {
              name: 'Project',
              class: 'LeftProjectPanel',
              onlyIfVisible: false,
              navRoot: this.root,
              navSubfolder: this.xsubfolder,
            })
          }

          // CSS
          const cssFile = `${yamlFolder}${yaml.css}`
          try {
            if (yaml.css) {
              this.customCSS = await this.fileApi.getFileText(cssFile)
              this.styleElement = document.createElement('style')
              this.styleElement.appendChild(document.createTextNode(this.customCSS))
              document.getElementsByTagName('head')[0].appendChild(this.styleElement)
            }
          } catch (e) {
            // no css, oh well
            console.error(`Error reading ${cssFile}: ` + e)
          }

          this.header = await this.buildPanel('header', yaml, yamlFolder)
          this.footer = await this.buildPanel('footer', yaml, yamlFolder)
        } catch (e) {
          // note parsing error and move on
          const msg = `Error reading ${filename}: ` + e
          this.$emit('error', msg)
        }
      }

      // lastly: if project folder, notify layout manager
      if (projectFolder) this.$emit('projectFolder', projectFolder)
    },

    setProjectTheme(theme: string, configFilepath: string) {
      // Encourage the project theme, but don't force user to use it

      // 1) If browser cache has a user theme for this project-config, use it
      // 2) Otherwise, use theme in project config -- and save it in cache!
      // 3) Listen for theme changes, save in browser cache for this project

      // 1) If browser cache has a user theme for this project-config, use it
      const cacheKey = `theme-${configFilepath}`
      const userTheme = localStorage.getItem(cacheKey)
      console.log(cacheKey, userTheme)
      if (userTheme) {
        this.$store.commit('setTheme', userTheme)
        return
      }

      // 2) No user-chosen theme: honor simwrapper-config setting
      this.$store.commit('setTheme', theme)
      localStorage.setItem(cacheKey, theme)

      // 3) Watch for theme changes in watch{}
    },

    async buildPanel(which: string, yaml: any, folder: string) {
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
      // const clean = DOMPurify.sanitize(html, { USE_PROFILES: { html: true } })

      // use it
      return html
    },

    // for each dashboard, fetch the yaml, set the tab title, and config the ... switcher?
    async initDashboard(fullPath: any) {
      try {
        const config = await this.fileApi.getFileText(fullPath)
        const yaml = YAML.parse(config)

        // see if trigger condition is met
        if (yaml.header?.triggerPattern) {
          const { files, dirs } = await this.fileApi.getDirectory(this.xsubfolder)
          const allContents = [...files, ...dirs]

          const matches = micromatch.match(allContents, yaml.header.triggerPattern).length
          if (matches === 0) {
            // no files matched trigger; skip this dashboard
            return false
          }
        }

        const shortFilename = fullPath.substring(0, fullPath.lastIndexOf('.'))
        if (!yaml.header) yaml.header = { title: fullPath, tab: shortFilename }
        if (!yaml.header.tab) yaml.header.tab = yaml.header.title || shortFilename

        this.dashboards[fullPath] = yaml
        // console.log('DASHBOARD:', fullPath)
        return true
      } catch (e) {
        this.$emit('error', `Error parsing: ${fullPath}`)
        return false
      }
    },
    updateRoute() {
      this.clearStyles()

      if (this.dashboardDataManager) this.dashboardDataManager.clearCache()
      this.dashboardDataManager = new DashboardDataManager(this.root, this.xsubfolder)

      this.header = ''
      this.footer = ''
      this.dashboards = []
      this.pageHeader = this.getPageHeader()

      // this happens async
      this.findConfigsAndDashboards()
    },

    updateCrumbs(props: { crumbs: any[]; finalFolder: string }) {
      this.finalFolder = props.finalFolder || ''
      if (this.finalFolder !== this.$store.state.windowTitle) {
        this.$store.commit('setWindowTitle', this.finalFolder)
      }
      this.crumbs = props.crumbs
    },

    async switchLeftTab(tab: string, index: number) {
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
    },

    handleZoom(isZoomed: any) {
      this.isZoomed = !!isZoomed
      this.$emit('zoom', this.isZoomed)
    },

    handleLayoutComplete() {
      this.showFooter = true
    },

    getFileSystem(name: string) {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )

      if (svnProject.length === 0) {
        console.warn('no such project')
        this.loadErrorMessage = `Can't locate "${name}": please check running services and browser version.`
        return null
      }

      return svnProject[0]
    },

    goUpOneFolder() {
      let target = this.xsubfolder
      if (this.xsubfolder.endsWith('/')) target = this.xsubfolder.slice(0, -1)
      target = target.substring(0, target.lastIndexOf('/'))

      const props = {
        root: this.fileSystem.slug,
        xsubfolder: target,
      }

      // if we are at top of hierarchy, jump to splashpage
      if (!target && !this.xsubfolder) {
        this.onNavigate({ component: 'SplashPage', props: {} })
      } else {
        this.onNavigate({ component: 'TabbedDashboardView', props })
      }
    },

    async authorizeAfterError() {
      try {
        const handle = this.fileSystem.handle
        if (handle) {
          const status = await handle.requestPermission({ mode: 'read' })
          if (status === 'granted') this.updateRoute()
        }
      } catch (e) {
        // meh
      }
    },

    setTitle() {
      // Now we have breadcrumbs so just use the current folder name instead of whole path
      const title = `${this.fileSystem.name}/${this.xsubfolder}`
      let lastFolder = title.substring(1 + title.lastIndexOf('/'))
      if (!lastFolder) lastFolder = this.fileSystem.name

      this.$emit('title', lastFolder)
    },
  },
  mounted() {
    this.updateRoute()
    this.setTitle()
  },
  beforeDestroy() {
    if (this.dashboardDataManager) this.dashboardDataManager.clearCache()
    this.clearStyles()
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.tabbed-folder-view {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  background-color: var(--bgDashboard);
  flex-direction: column;
}

.centered-vessel.wiide {
  max-width: unset;
}

.tabs {
  margin: 0 0rem;
}

.tabs ul {
  line-height: 0.8rem;
  border-bottom-width: 5px;
  border-bottom-color: var(--bgDashboard);
}

.tabholder {
  z-index: 50;
  padding: 0.5rem 0rem 0.5rem 0rem;
}

.tab-holder-container {
  margin: 0 $cardSpacing;
}

.tab-holder-container.wiide {
  margin: 0 0rem;
}

li.is-not-active b a {
  color: var(--textBlack);
}

.dashboard-finder {
  display: flex;
  flex: 1;
  flex-direction: row;
  padding: 0 0.5rem; // $cardSpacing;
  position: relative;
  overflow-y: auto;
}

.dashboard-finder.isMultipanel {
  margin: 0 0.5rem;
}

.dashboard-finder.isZoomed {
  margin: 0 0.25rem;
  padding: 0 0;
}

.dashboard-right-sections {
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1.5rem 2rem 0.5rem;
}

.dashboard-content {
  flex: 1;
  position: relative;
}

.dashboard-content.is-breadcrumbs-hidden {
  margin-top: 1rem;
}

.dashboard-folder-browser {
  // margin: 2rem 2rem 1rem 1rem;
  // padding-top: 1rem;
  flex: 1;
}

.tab-list {
  font-family: $fancyFont;
  font-size: 0.9rem;
  line-height: 1.1rem;
  padding: 3px 0.5rem 5px 0.5rem;
  border-left: 5px solid #00000000;
  user-select: none;
  margin-bottom: 1px;

  a {
    color: var(--text);
  }
}

.tab-list:hover {
  background-color: var(--bgBold);
  cursor: pointer;
}

.tab-list.is-active {
  background-color: var(--bgBold);
  border-left: 5px solid var(--highlightActiveSection);
  border-radius: 3px 0 0 3px;
  font-weight: bold;
  a {
    color: var(--textBold);
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
  padding: 1rem 0.5rem;
  border-radius: 5px;
  text-align: center;
  font-size: 1.2rem;
  color: var(--link);
  background-color: var(--bgPanel);
  border: 1px solid pink;
  max-width: 40rem;
}

.project-header {
  margin-bottom: 1rem;
  color: var(--text);
  padding: 1rem 0.5rem;

  :deep(h1) {
    font-size: 3rem;
    font-weight: bold;
  }

  :deep(h2) {
    font-size: 1.5rem;
    margin-top: 1rem;
  }

  :deep(h3) {
    font-size: 1.25rem;
    margin-top: 0.5rem;
  }

  :deep(h4) {
    margin-top: 0.5rem;
    font-size: 1.1rem;
  }

  :deep(ul) {
    list-style: inside;
  }
}

.project-header.wiide {
  padding: 1rem 2rem;
}

.footer-holder {
  font-size: 0.75rem;
  z-index: 50;
  line-height: 0.9rem;
  margin-top: 0.5rem;
}

.project-footer {
  width: 100%;
  margin: 0rem 0rem 0.25rem 0rem;
  color: var(--text);
  padding: 0rem 1rem;

  :deep(h1) {
    font-size: 2rem;
    font-weight: bold;
  }

  :deep(h2) {
    font-size: 1.5rem;
    margin-top: 1rem;
  }

  :deep(h3) {
    font-size: 1.25rem;
    margin-top: 0.5rem;
  }

  :deep(h4) {
    margin-top: 0.5rem;
    font-size: 1.1rem;
  }

  :deep(ul) {
    list-style: inside;
  }
}

.folder-readme {
  margin-top: 0.5rem;
}

.folder-readme.readme-centered {
  text-align: center;
}

.project-path {
  flex: 1;
}

.nav-title {
  display: flex;
  padding: 0.75rem 1rem;
  background-image: linear-gradient(45deg, #0c8ed3, #8f00ff);
  color: white;
  font-size: 1.4rem;
  font-family: $fancyFont;
  font-weight: bold;
}

.title-text {
  flex: 1;
}

.favorite-icon {
  margin: auto -0.5rem auto 1rem;
  opacity: 0.6;
  font-size: 1.1rem;
  color: #757bff;
  // text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
}

.is-favorite {
  opacity: 1;
  color: #4f58ff;
  text-shadow: -1px -1px 0 #fff, 1px -1px 0 #fff, -1px 1px 0 #fff, 1px 1px 0 #fff;
}

.favorite-icon:hover {
  cursor: pointer;
}

.breadcrumbs {
  flex: 1;
  padding: 0;
  font-size: 0.9rem;
  color: var(--text);
}

img {
  margin-right: 1rem;
}

.logos img {
  margin-right: 1rem;
}

.white-text {
  color: white;
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    color: white;
  }
}
</style>
