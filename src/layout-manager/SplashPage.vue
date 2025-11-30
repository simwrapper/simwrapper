<template lang="pug">
.splash-page
 .centered
  .top-logo-area
    .top-center
      .top-banner.flex-row
        .flex1
          img(width=256 src="@/assets/simwrapper-logo/SW_logo_yellow.png")
      .tagline {{ tagline }}

  .splash-scroll-area.white-text

    .markdown(v-if="readme" v-html="readme")

    //- QUICK START ==================
    h4.az-title(style="margin-top: 1rem;") Quick start tools
    .az-quick-start-items.flex-row
      .az-quick-item.flex-col(v-if="isChrome" @click="showChromeDirectory")
        .az-quick-icon: i.fa.fa-folder
        .az-quick-label View<br>local files
      .az-quick-item.flex-col(@click="go('/matrix')")
        .az-quick-icon: i.fa.fa-th
        .az-quick-label Matrix<br>viewer
      //- .az-quick-item.flex-col(@click="go('/map')")
      //-  . az-quick-icon: i.fa.fa-plus
      //-   .az-quick-label Map builder<br>(beta)
      .az-quick-item.flex1.spacer &nbsp;

      settings-panel.settings-popup(v-if="showSettings" @close="showSettings=false")
      .az-quick-item.flex-col(v-else @click="showSettings = !showSettings")
        .az-quick-icon: i.fa.fa-cog
        .az-quick-label Settings


    //- LOCAL FOLDERS ==================
    .is-chrome(v-if="isChrome")
      h4.az-title Local folders

      p(v-if="!localFileHandles.length").mb1 You can securely browse simulation outputs with this Chromium-based browser.<br>Your data is <b>never uploaded to any server</b> — everything stays right here in your browser.<br>To explore files on your local filesystem right now:
      .az-grid(v-else)
        .az-cell.heading Folder
        .az-cell.heading Description
        .az-row(v-for="row in localFileHandles" :key="row.key")
          .az-cell
            i.fa.fa-times.zap-folder(@click="zapLocalFolder(row)" title="Remove this folder from list")
            i.fa.fa-folder.az-icon(style="color: #ea0;")
            a(@click="clickedBrowseChromeLocalFolder(row)") {{ row.handle.name}}
          .az-cell Read-only browser access

      .az-local-folder-button
        b-button.config-sources(
          type="is-success"
          @click="showChromeDirectory"
        ): b View local files...


    //- DATA SOURCES ==================
    h4.az-title Data sources
    .az-grid
      //- .az-cell &nbsp;
      .az-cell.heading Resource
      .az-cell.heading Description
      .az-row(v-for="project in mainRoots" :key="project.slug")
        //- .az-cell(style="padding-right: 0.5rem; font-size: 12px;"): i.fa.fa-network-wired
        .az-cell.has-link
          i.fa.fa-sitemap.az-icon(style="color: #99cc00")
          a(@click="clickedOnFolder({root: project.slug})") {{ project.name}}
        .az-cell {{ project.description}}
    p
      | Add more cloud data sources from the&nbsp;
      a(@click="openDataStrip()"): b data sources
      | &nbsp;tab on the left-side panel.


    //- FAVORITES =========================
    h4.az-title Favorites ⭐️

    p(v-if="!state.favoriteLocations.length") Click the star ⭐️ in the top right of any view or dashboard to add it to this list.

    .az-grid(v-else)
      .az-cell.heading Item
      .az-cell.heading Location
      .az-row(v-for="favorite in state.favoriteLocations" :key="favorite.fullPath"
        @click="clickedOnFavorite(favorite)"
      )
        .az-cell
          i.fa.fa-folder(style="padding-right: 0.5rem; font-size: 14px; color: #ea0;")
          a(@click="clickedOnFavorite(favorite)") {{ favorite.label }}
        .az-cell {{ `${favorite.root}/${favorite.subfolder}` }}


    //- DOCUMENTATION ==================
    h4.az-title Documentation and Help

    .flex-row.az-quick-start-items
      a.az-quick-item.flex-col(href="https://simwrapper.github.io/docs" target="_blank")
        .az-quick-icon: i.fa.fa-book
        .az-quick-label Main<br>docs
      a.az-quick-item.flex-col(href="https://simwrapper.github.io/docs/guide-getting-started " target="_blank")
        .az-quick-icon: i.fa.fa-flag-checkered
        .az-quick-label Tutorial
      a.az-quick-item.flex-col(href="https://github.com/orgs/simwrapper/discussions" target="_blank")
        .az-quick-icon: i.fa.fa-comments
        .az-quick-label Ask<br>questions
      a.az-quick-item.flex-col(href="https://github.com/simwrapper/simwrapper/issues" target="_blank")
        .az-quick-icon: i.fa.fa-spider
        .az-quick-label Report<br>an issue


    //- EXAMPLE DASHBOARDS  ==================
    h4.az-title Example dashboards
    p.mb1 Explore these example dashboards to get a feeling for what SimWrapper can do:

    .az-grid
      .az-cell.heading Item
      .az-cell.heading Description
      .az-row(v-for="project,i in exampleRoots" :key="i")
        .az-cell: a(@click="clickedOnFolder({root: project.slug})") {{ project.name }}
        .az-cell {{ project.description  || '&nbsp;'}}


    //- ABOUT SIMWRAPPER  ==================
    h4.az-title About SimWrapper

    .newbie-area.white-text
      .content

        img.screenshot(:src="images.berlin")

        p
          | SimWrapper is a unique, web-based data visualization tool for researchers building disaggregate transportation simulations with software such as&nbsp;
          a(href="https://matsim.org") MATSim
          | &nbsp;and&nbsp;
          a(href="https://activitysim.github.io") ActivitySim.

        p Explore simulation results directly, or create interactive project dashboards with Simwrapper. It provides many statistical views and chart types, just like other visualization frameworks. But SimWrapper also knows a lot about transportation, and has good defaults for producing visualizations of network link volumes, agent movements through time, aggregate area maps, scenario comparison, and a lot more.

        p You don't need to be a coder to use SimWrapper -- you point it at your files and write some small text configuration files to tell SimWrapper what to do. SimWrapper does the rest!

        p The open-source code and plugin architecture of SimWrapper allows developers (you!) to fork the project and create your own visualizations, too. But you don't need to be a software developer to use SimWrapper if it already does what you need.

        p
          | SimWrapper is a
          b &nbsp;100% client-side&nbsp;
          | browser application. There is no back-end database, no tracking cookies, and no data is transferred from your browser to any server; everything on your computer stays on your local computer.


    //- SPONSORS -------------------------------------------------------------------

    .sponsors-area.dark-text
      .content

        b.section-head.zcaps Funding partners

        .links-and-logos
          .logos
            .one-logo(v-for="logo in allLogos" :key="logo.url")
              a(:href="logo.url"
                 :title="logo.name"
                 target="_blank"
              ): img.img-logo(:src="logo.image")

        p Funded by TU Berlin; the German Bundesministerium für Bildung und Forschung; the Deutsche Forschungsgemeinschaft; and the ActivitySim Consortium member agencies listed above. Thank you for your support!


    //- FOOTER -------------------------------------------------------------------

    .diagonal
     .footer-area.white-text
      .content

        .flex-col
          .badges
            a(href='https://vsp.berlin/' target="_blank"): img.vsp-logo(src="@/assets/vsp-logo/vsp-2023-logo.png")

          .legal.flex1
            h4.section-head SimWrapper
            p &copy; 2025 Technische Universität Berlin

            h4 Build information
            p Version: &nbsp;
              b {{  git.tag }}
            p Built from commit: &nbsp;
              b {{  git.commit }}
            p SimWrapper is open source and available on&nbsp;
              a(href="https://github.com/simwrapper/simwrapper") GitHub.
            .flex-row(style="gap: 1rem; margin-top: 1rem;")
              a(href="https://vsp.berlin/en/" target="_blank") VSP&nbsp;TU&nbsp;Berlin
              a(href="https://vsp.berlin/impressum/" target="_blank") Impressum
              a(href="https://www.vsp.tu-berlin.de/menue/service/privacy/parameter/en/" target="_blank") Privacy


    .very-bottom
      p .&nbsp;.

</template>

<script lang="ts">
// Typescript doesn't know the Chrome File System API
declare const window: any

const i18n = {
  messages: {
    en: {
      'more-info': 'Documentation:',
      tagLine: 'the simulation browser and data visualizer from TU&nbsp;Berlin.',
      privacy:
        'SimWrapper is a client-side app, which means there is no upstream server collecting or storing data.\n\nSimWrapper does not collect, handle or process any data about you while you use the site. SimWrapper does not contain any tracking devices or analytics software. No user cookies are stored or transmitted.',
    },
    de: {
      'more-info': 'Für weitere Informationen:',
      tagLine: 'Der Modellergebnis-Browser der TU Berlin.',
    },
  },
}

import { defineComponent } from 'vue'
import { get, set, clear } from 'idb-keyval'
import Markdown from 'markdown-it'

import globalStore from '@/store'
import { FavoriteLocation, FileSystemConfig } from '@/Globals'
import FileSystemProjects from '@/components/FileSystemProjects.vue'
import fileSystems, { addLocalFilesystem } from '@/fileSystemConfig'
import SettingsPanel from '@/layout-manager/SettingsPanel.vue'
import InfoBottom from '@/assets/info-bottom.md'
import SCREENSHOT_BERLIN from '@/assets/screenshots/berlin.jpg'
import SIMWRAPPER_FULL_LOGO from '@/assets/simwrapper-logo/SW_logo_white.png'

const BASE_URL = import.meta.env.BASE_URL

const SIMWRAPPER_COMMIT = import.meta.env.VITE_COMMIT
const SIMWRAPPER_TAG = import.meta.env.VITE_TAG
const GIT = {
  commit: SIMWRAPPER_COMMIT,
  tag: SIMWRAPPER_TAG,
}

const logos = [
  { url: 'https://tu.berlin', image: 'tu-logo.png', name: 'TU Berlin' },
  { url: 'https://vsp.berlin/en/', image: 'vsp-logo-300dpi.png', name: 'VSP TU-Berlin' },
  { url: 'https://matsim.org/', image: 'matsim-logo-blue.png', name: 'MATSim' },
  { url: 'https://bmbf.de', image: 'bmbf-logo.png', name: 'German Federal BMBF' },
  { url: 'https://www.dfg.de/', image: 'dfg.jpg', name: 'Deutsche Forschungsgemeinschaft' },
  { url: 'https://www.sfcta.org/', image: 'sfcta.png', name: 'SFCTA' },
  { url: 'https://www.sandag.org/', image: 'sandag.jpg', name: 'SANDAG' },
  { url: 'https://metrocouncil.org/', image: 'metcouncil.png', name: 'Met Council' },
  { url: 'https://mtc.ca.gov/', image: 'mtc.png', name: 'MTC' },
  { url: 'https://www.mwcog.org/', image: 'mwcog.png', name: 'MWCOG' },
  { url: 'https://www.psrc.org/', image: 'psrc.png', name: 'Puget Sound Regional Council' },
  { url: 'https://www.oregon.gov/ODOT', image: 'oregondot.png', name: 'Oregon DOT' },
  { url: 'https://www.transportation.ohio.gov/', image: 'ohiodot.png', name: 'Ohio DOT' },
  { url: 'https://www.semcog.org/', image: 'semcog.jpg', name: 'SEMCOG' },
  { url: 'https://atlantaregional.org/', image: 'arc.png', name: 'ARC' },
]

export default defineComponent({
  name: 'SplashPage',
  i18n,
  components: { FileSystemProjects, InfoBottom, SettingsPanel },
  data: () => {
    return {
      state: globalStore.state,
      allRoots: [] as FileSystemConfig[],
      images: {
        logo: SIMWRAPPER_FULL_LOGO,
        berlin: SCREENSHOT_BERLIN,
      },
      skimwrapper: `${BASE_URL}matrix`,
      git: GIT,
      showSettings: false,
    }
  },

  computed: {
    allLogos(): any[] {
      return logos.map(p => {
        return { url: p.url, image: `${BASE_URL}images/logos/${p.image}` }
      })
    },

    exampleRoots(): FileSystemConfig[] {
      return this.allRoots.filter(f => f.example)
    },

    mainRoots(): FileSystemConfig[] {
      let roots = this.allRoots.filter(f => !!!f.example)
      // if we have a flask system, remove the standard VSP public root
      if (this.state.flaskConfig.storage) return roots.filter(f => f.slug !== 'public')

      return roots
    },

    isChrome() {
      return !!window.showDirectoryPicker
    },

    localFileHandles(): any[] {
      // sort a copy of the array so we don't get an infinite loop
      return this.$store.state.localFileHandles.concat().sort((a: any, b: any) =>
        // parseInt(a.key.substring(2)) < parseInt(b.key.substring(2)) ? -1 : 1
        a.handle.name < b.handle.name ? -1 : 1
      )
    },
    readme() {
      const text = this.state.flaskConfig.readme
      if (!text) return ''
      try {
        return new Markdown({ html: true, linkify: true, typographer: true }).render(text)
      } catch {
        return ''
      }
    },
    tagline() {
      return this.state.flaskConfig.tagline || 'Transport simulation data visualizer'
    },
  },

  methods: {
    zapLocalFolder(row: any) {
      this.clickedDelete(row)
    },

    go(path: string) {
      const fullPath = `${BASE_URL}${path}`.replaceAll('//', '/')
      console.log({ fullPath })
      this.$router.push(fullPath)
    },

    clickedDeleteFavorite(favorite: FavoriteLocation) {
      this.$store.commit('removeFavorite', favorite)
    },

    clickedOnFavorite(favorite: FavoriteLocation) {
      const page = {
        component: 'TabbedDashboardView',
        props: {
          root: favorite.root,
          xsubfolder: favorite.subfolder,
        },
      }

      this.$emit('navigate', page)
      return
    },

    onNavigate(event: any) {
      // pass it on up
      console.log('ZZLDIJFSD', event)
      this.$emit('navigate', event)
    },

    showDocumentation() {
      window.location.href = 'https://simwrapper.github.io/docs'
    },

    updateShortcuts() {
      const roots = this.state.svnProjects.filter(
        source => !source.hidden && !source.slug.startsWith('fs')
      )

      this.allRoots = roots
    },

    configureSources() {
      this.$emit('activate', { name: 'Settings', class: 'SettingsPanel' })
    },

    clickedOnFolder(props: { folder: string; i: number; root: string }) {
      const { folder, root, i } = props

      let destination = `${root}`
      if (folder) destination += `/${folder}`

      this.$emit('navigate', {
        component: 'TabbedDashboardView',
        props: {
          root,
          xsubfolder: '',
        },
      })
    },

    async clickedBrowseChromeLocalFolder(row: { key: string; handle: any }) {
      try {
        const status = await row.handle.requestPermission({ mode: 'read' })
        console.log(row.handle, status)

        if (status !== 'granted') return

        // if first time, add its key to the fileSystemConfig
        const exists = fileSystems.find(f => f.slug == row.key)
        if (!exists) addLocalFilesystem(row.handle, row.key)

        const props = { root: row.key } as any
        this.clickedOnFolder(props)
      } catch (e) {
        console.error('' + e)
      }
    },

    async showChromeDirectory() {
      try {
        const FileSystemDirectoryHandle = window.showDirectoryPicker()
        const dir = await FileSystemDirectoryHandle
        const slug = addLocalFilesystem(dir, null) // no key yet
        this.$router.push(`${BASE_URL}${slug}/`)
      } catch (e) {
        // shrug
      }
    },

    async clickedDelete(row: { key: string; handle: any }) {
      const handles = this.$store.state.localFileHandles
      // just filter out the key I guess?
      const filtered = handles.filter((f: any) => f.key !== row.key)

      // and save it everywhere
      await set('fs', filtered)
      this.$store.commit('setLocalFileSystem', filtered)
    },

    openDataStrip() {
      this.$store.commit('setShowLeftBar', true)
    },
  },
  mounted() {
    // set initial breadcrumbs if we don't have any yet
    if (!this.state.breadcrumbs.length) {
      const crumbs = [{ label: 'SimWrapper', url: '/' }]
      globalStore.commit('setBreadCrumbs', crumbs)
    }

    this.updateShortcuts()
    this.$store.commit('setWindowTitle', '')
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$angle: 2deg;

.splash-page {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  background-image: var(--bgSplashPage);
}

.centered {
  height: 100%;
  overflow-y: auto;
}

.splash-scroll-area {
  display: flex;
  flex-direction: column;
  max-width: 100rem;
  margin: 0 auto;
  padding: 1rem 2rem 0.5rem 2rem;
}

.content {
  // transform: skewY($angle);
  margin-bottom: 2rem;
  // max-width: 90rem;
  // margin: 0 auto;
}

.top-logo-area {
  background-image: linear-gradient(145deg, #162025, #0d252f);
  color: #ccc;
  // border-bottom: 1px solid #88888860;
}

.top-center {
  max-width: 100rem;
  margin: 0 auto;
  padding: 1.5rem 2rem 2rem 2rem;
}

.sponsors-area {
  background-color: white;
  margin-bottom: 1rem;
  padding: 2rem;
  padding-bottom: 3rem;
  color: #333;
}

h2 {
  font-size: 1.9rem;
  margin-bottom: 1px;
}

h4 {
  padding: 1rem 0 0 0;
}

.data-area {
  padding-bottom: 2rem;
}

.diagonal {
  background-color: #162025;
  transform: skewY(-$angle);
  padding: 4rem 2rem 0rem 2rem;
  margin-top: -2.5rem;
}

.footer-area {
  transform: skewY($angle);
  color: #ccc !important;

  h4 {
    color: $appTag;
    margin-bottom: 0.25rem;
  }
  a {
    color: $colorYellow;
  }
}

// hello --------------------------

// a {
//   color: #65d68f;
// }

// a:hover {
//   color: #a8ffc8;
// }

.simwrapper-logo {
  max-width: 250px;
  margin-top: 0.75rem;
}

.vsp-logo {
  max-width: 300px;
  margin-top: 0.5rem;
  margin-bottom: 0rem;
}

.links-and-logos {
  margin-top: 0.5rem;
  padding: 1rem 0rem;
  display: flex;
  flex-direction: row;
  // color: #227;
  // background-color: white;
}
.logos {
  display: grid;
  gap: 3rem;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  padding: 2rem 0rem;
  a {
    margin: 0 auto;
  }
}

.funding {
  font-size: 0.9rem;
  margin: 0.5rem 0 0.5rem 0;
}

.legal {
  // padding: 0rem 2rem 0rem 2rem;
  // display: flex;
  p {
    margin: 0 0;
  }
  a {
    margin-right: 0.75rem;
  }
  a:hover {
    color: #a8ffc8;
  }
}

.img-logo {
  height: 4.5rem;
  object-fit: contain;
}

.project-root {
  display: flex;
  flex-direction: column;
  margin-top: 0.5rem;
  padding: 0.5rem 0.5rem;
  border-left: 3px solid #29d09a;
  border-right: 1px solid #8888aa00;
  border-top: 1px solid #8888aa00;
  border-bottom: 1px solid #8888aa00;

  h5 {
    font-size: 1rem;
    line-height: 1rem;
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  p {
    line-height: 1.1rem;
  }
}

.project-root.local {
  border-left: 3px solid $matsimBlue;
}

// .local {
// }

.pt1 {
  padding-top: 2.5rem;
}

.project-root:hover {
  cursor: pointer;
  transition: background-color 0.1s ease-in-out;
  border-right: 1px solid #66666640;
  border-top: 1px solid #66666640;
  border-bottom: 1px solid #66666640;
}

.fa-times:hover {
  color: red;
}

.fa-times:active {
  color: darkred;
}

.project-root:hover .fa-times {
  opacity: 0.15;
}

.project-root:hover .fa-times:hover {
  opacity: 1;
}

.config-sources {
  margin-top: 0.5rem;
}

.roots {
  display: grid;
  gap: 0rem 0.75rem;
  grid-template-columns: repeat(auto-fit, 18rem);
  list-style: none;
  font-size: 0.9rem;
  margin: 0.5rem 0 0rem 0;
}

.section-head {
  margin-top: 0rem;
}

.tagline {
  font-size: 1.7rem;
  margin: 0.25rem 0 0rem 0rem; // 2.4rem
  font-weight: 100;
  line-height: 1.8rem;
}

.is-chrome {
  margin-top: 0rem;
}

.newbie-area {
  font-size: 1.1rem;
  // background-image: linear-gradient(45deg, rgb(7, 103, 57), #2a2de0); // #5e1419
  padding-bottom: 1rem;
}

.example-root {
  margin-top: 0;
}

.screenshot {
  float: right;
  width: 20rem;
  padding: 0.5rem;
}

.skimwrapper {
  margin: 2.5rem 0;
}

.skimwrapper-link {
  background-image: linear-gradient(45deg, #080e55, #6a11ae); // #5e1419
  padding: 1rem;
  color: #ffffff;
  font-weight: bold;
  border-radius: 10px;
  border: 1px solid #ffffff00;
}
.skimwrapper-link:hover {
  background-image: linear-gradient(45deg, #080e55, #6a11ae); // #5e1419
  border: 1px solid #ccf;
}

.fave-items {
  margin-top: 1rem;
  gap: 0.25rem;
}

.favorite {
  padding: 0.5rem;
  line-height: 1.2rem;
  margin: 0;
  // background-color: #181818;
  border: 1px solid #00000000;
  gap: 0.25rem;
  cursor: pointer;

  h5,
  p {
    margin: 0;
  }
}
.favorite:hover {
  cursor: pointer;
  background-color: var(--bgBold);
  border: 1px solid var(--bgPanel3);
  transition: background-color 0.1s ease-in-out;
}

.badges {
  margin: -1rem 0 1rem -0.75rem;
}

.very-bottom {
  margin-top: -2rem;
  height: 3.5rem;
  background-color: #162025;
}

.markdown {
  border-bottom: 1px solid #88888860;
  padding-bottom: 1rem;
}

.spacer {
  pointer-events: none;
}

.settings-popup {
  float: right;
  background-color: var(--bgBold);
  padding: 0.5rem 1rem 0 1rem;
  border: var(--borderThin);
}

.zap-folder {
  opacity: 0;
  margin: 0 6px 0 -16px;
  transition: 0.15s ease-in-out;
}

.az-cell:hover .zap-folder {
  opacity: 0.2;
}

.az-cell:hover .zap-folder:hover {
  cursor: pointer;
  opacity: 1;
}

@media only screen and (max-width: 640px) {
  .is-chrome {
    display: none;
  }

  .az-grid {
    display: flex;
    flex-direction: column;
  }
  .az-cell {
    border-bottom: none;
    padding: 0 0;
  }
  .az-row {
    display: unset;
    padding-top: 0.5rem;
  }
  .splash-scroll-area {
    padding: 0 1rem;
  }

  .logos {
    display: grid;
    gap: 2rem;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    padding: 2rem 0rem;

    a {
      margin: 0 auto;
    }
  }

  .az-quick-start-items {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .az-grid a {
    font-weight: 700 !important;
    // padding: 0.25rem;
  }
}
</style>
