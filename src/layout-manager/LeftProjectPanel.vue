<template lang="pug">
.panel
  .sw-leftpanel-top
    .span(v-for="item,idx of topItems" :key="`top-${idx}`")

      .image-top-thing(v-if="item.image")
        a(v-if="item.url" @click="navigate(item.url)")
          img.sw-nav-item(:src="getUrl(item.image)" :style="getStyle(item)")
        img.sw-nav-item(v-else :src="getUrl(item.image)" :style="getStyle(item)")

      h3.sw-nav-item(v-else-if="item.section") {{ getLabel(item)}}

      .sw-nav-item(v-else-if="hasLabel(item)")
        p(v-if="item.url && item.url.startsWith('http')"): a(:href="item.url") {{ getLabel(item) }}
        p(v-else-if="item.url"): a(@click="navigate(item.url)") {{ getLabel(item) }}
        p(v-else) {{ getLabel(item) }}

  .sw-leftpanel-middle
    .span(v-for="item,idx of middleItems" :key="`middle-${idx}`" :style="getStyle(item)")
      img.sw-nav-item(v-if="item.image" :src="getUrl(item.image)" :style="getStyle(item)")
      h3.sw-nav-item(v-else-if="item.section" :style="getStyle(item)") {{ getLabel(item)}}
      .sw-nav-item(v-else-if="hasLabel(item)" :style="getStyle(item)")
        p(v-if="item.url"): a(@click="navigate(item.url)" :style="getStyle(item, true)") {{ getLabel(item) }}
        p(v-else :style="getStyle(item)") {{ getLabel(item) }}

  .sw-leftpanel-bottom
    .span(v-for="item,idx of bottomItems" :key="`bottom-${idx}`")
      img.sw-nav-item(v-if="item.image" :src="getUrl(item.image)" :style="getStyle(item)")
      h3.sw-nav-item(v-else-if="item.section") {{ getLabel(item)}}
      .sw-nav-item(v-else-if="hasLabel(item)")
        p(v-if="item.url"): a(@click="navigate(item.url)") {{ getLabel(item) }}
        p(v-else) {{ getLabel(item) }}

    //- .action-buttons
    //-   p.show-hide(@click="$store.commit('setShowLeftBar', false)")
    //-     i.fas.fa-arrow-left
    //-     | &nbsp;&nbsp;hide
    //-   p.settings-icon(@click="$store.commit('rotateColors')")
    //-     i.fas.fa-adjust
    //-     | &nbsp;&nbsp;{{ globalState.isDarkMode ? 'dark':'light' }}
    //-   p.settings-icon(@click="updateLanguage")
    //-     i.fas.fa-globe
    //-     | &nbsp;&nbsp;{{ globalState.locale }}
    //-   p.settings-icon(@click="$emit('split', {root, xsubfolder: subfolder})")
    //-     i.fas.fa-columns
    //-     | &nbsp;&nbsp;split

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import globalStore from '@/store'
import {
  BreadCrumb,
  FavoriteLocation,
  FileSystemConfig,
  NavigationItem,
  YamlConfigs,
} from '@/Globals'

import ErrorPanel from '@/components/left-panels/ErrorPanel.vue'

const components = Object.assign({ ErrorPanel })

export default defineComponent({
  name: 'ProjectLeftPanel',
  i18n,
  components,
  props: {
    currentFolder: { type: String, required: true },
    projectFolder: { type: String, required: true },
    navRoot: { type: String, required: false },
  },
  data: () => {
    return {
      globalState: globalStore.state,
      subfolder: '',
      root: '',
      summaryYamlFilename: 'viz-summary.yml',
      highlightedViz: -2, // -2:none, -1: dashboard, 0-x: tile
      allConfigFiles: { dashboards: {}, topsheets: {}, vizes: {}, configs: {} } as YamlConfigs,
      allRoots: [] as FileSystemConfig[],
      errorStatus: '',
      folders: [],
      isLoading: false,
    }
  },
  mounted() {
    // this.updateShortcuts()
    // this.updateFavorites()
  },

  watch: {
    'globalState.leftNavItems'() {
      console.log('CHANGED!!!')
    },

    subfolder() {
      this.updateRoute()
    },
  },
  computed: {
    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.navRoot
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    topItems(): NavigationItem[] {
      return this.globalState.leftNavItems?.top || []
    },

    middleItems(): NavigationItem[] {
      return this.globalState.leftNavItems?.middle || []
    },

    bottomItems(): NavigationItem[] {
      return this.globalState.leftNavItems?.bottom || []
    },

    hasErrors(): any {
      return this.globalState.statusErrors.length > 0
    },
  },
  methods: {
    updateLanguage() {
      this.$store.commit('setLocale', this.$store.state.locale == 'en' ? 'de' : 'en')
      this.$root.$i18n.locale = this.$store.state.locale
    },

    hasLabel(item: NavigationItem): any {
      return item.text || item.text_de || item.text_en
    },

    getLabel(item: NavigationItem): string {
      let label = ''
      if (this.$store.state.locale === 'de') {
        label = item.text_de || item.text || item.text_en || 'item'
      } else {
        label = item.text_en || item.text || item.text_de || 'item'
      }
      return label
    },

    getUrl(url: string) {
      if (url.startsWith('http')) return url

      const fullUrl = `${this.fileSystem.baseURL}${url}`
      return fullUrl
    },

    getStyle(item: any, isLink: boolean) {
      let style = {} as any
      if (item.style) Object.assign(style, item.style)

      if (!isLink || !this.currentFolder.length) return style

      const absoluteCurrentFolder = '/' + this.currentFolder

      // Current folder gets special highlight
      if (absoluteCurrentFolder.endsWith(item.url)) {
        style.backgroundColor = '#e3e3e0'
        style.borderRadius = '4px'
        style.color = 'black'
      }
      return style
    },

    navigate(url: string) {
      if (url.startsWith('http')) {
        window.location.href = url
      } else {
        // is subfolder absolute path or relative to project?
        const xsubfolder = url.startsWith('/') ? url : `${this.projectFolder}/${url}`

        const props = {
          root: this.navRoot || '',
          xsubfolder,
          thumbnail: false,
        }

        this.$emit('navigate', {
          component: 'TabbedDashboardView',
          props,
        })
      }
    },

    updateRoute() {
      if (!this.root) return

      this.subfolder = this.subfolder || ''
      this.highlightedViz = -2
    },

    authenticationChanged() {
      console.log('AUTH CHANGED - Reload')
      this.updateRoute()
    },

    updateShortcuts() {
      const roots = this.globalState.svnProjects.filter(
        source => !source.hidden && !source.slug.startsWith('fs')
      )

      this.allRoots = roots
    },

    cleanName(text: string) {
      return decodeURIComponent(text)
    },

    getFileSystem(name: string) {
      const svnProject: FileSystemConfig[] = globalStore.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === name
      )

      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }

      return svnProject[0]
    },

    clickedOnFolder(props: { root: string }) {
      // if (this.myState.isLoading) return

      const rootPage = {
        component: 'TabbedDashboardView',
        props: {
          root: props.root,
          xsubfolder: '',
        },
      }

      this.$emit('navigate', rootPage)
      return
    },

    clickedLogo() {
      this.$router.push('/')
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';
.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  user-select: none;
  font-size: 0.9rem;
  color: #eee;
  // background-color: $themeColorPale;
  background-image: linear-gradient(-125deg, #343549, #141a22);
}

.sw-leftpanel-top {
  display: flex;
  flex-direction: column;
  background-color: white;
  color: $colorPurple;
}

h1 {
  letter-spacing: -1px;
}

h2 {
  font-size: 1.8rem;
}

h3 {
  font-family: $mainFont;
  font-size: 1rem;
  line-height: 1.1rem;
  margin-top: 1.5rem;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

h4 {
  background-color: #00000080;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.25rem;
  font-weight: bold;
  text-transform: uppercase;
  color: #ddd;
}

.sw-leftpanel-middle,
.sw-leftpanel-bottom {
  display: flex;
  flex-direction: column;
  margin-bottom: 1rem;
  overflow-y: auto;
  overflow-x: hidden;
  text-align: left;
  user-select: none;

  p,
  a {
    max-width: 100%;
    overflow-wrap: break-word;
  }
}

.sw-leftpanel-middle {
  padding-top: 1rem;
  flex: 1;
}

// .sw-leftpanel-bottom {
// }

.fade {
  opacity: 0.4;
  pointer-events: none;
}

.fa-arrow-up {
  margin-right: 2px;
}

.flex-row {
  display: flex;
  flex-direction: row;
}

.highlighted {
  background-color: var(--bgHover);
}

.sw-nav-item {
  padding: 0 1rem 1px 1rem;
  a {
    margin-left: -4px;
    padding: 2px 4px;
    color: #ccc;
  }
  a:hover {
    color: $yellowHighlight;
  }
}

img.sw-nav-item {
  padding-top: 1rem;
  padding-bottom: 1rem;
  max-height: 7rem;
}

.root {
  font-weight: bold;
  color: #5fe2a7; // $appTag;
}

.description {
  font-size: 0.75rem;
  margin-top: -2px;
}

.action-buttons {
  background-color: #48485f;
  margin-top: 1.25rem;
  display: flex;
  flex-direction: row;

  p {
    padding: 2px 0;
    font-size: 0.8rem;
    text-align: center;
    vertical-align: center;
    flex: 1;
  }

  p:hover {
    background-color: #3c3c49;
    color: $yellowHighlight;
    cursor: pointer;
  }
}

.settings-icon {
  border-left: 1px solid #888;
}
</style>
