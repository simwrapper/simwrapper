<template lang="pug">
.my-navbar.flex-row(@mouseleave="showSidebarMenu=false")

  .brand.flex-row(@mouseover="showSidebarMenu=true"
    :class="{'is-highlighted': showSidebarMenu}"
  )
    .sidebar-button
      img(:src="imgSidebar")
    .simwrapper-logo
      img(:src="imgLogo")

  .title-section.flex1
    p {{  $store.state.windowTitle }}

  .right-section
    p: i.fas.fa-cog(@click="toggleSettings()")

  settings-panel.settings-popup(v-if="showSettings"
    @close="toggleSettings()"
  )


  .dropdown-holder.flex-col(v-if="showSidebarMenu"
    @mouseover="showSidebarMenu=true"
    @mouseleave="showSidebarMenu=false"
  )
    .x-item(@click="go('/')")
      p: i.x-menu-icon.fas.fa-home
      p Home

    .space
      .xsection Sidebar
      .x-item(:class="{'is-active-side': currentSection===''}" @click="activate('')")
        p: i.x-menu-icon.fas.fa-check
        p Hide sidebar
      .x-item(:class="{'is-active-side': currentSection=='data'}" @click="activate('data')")
        p: i.x-menu-icon.fas.fa-sitemap
        p Data sources and folders
      .x-item(:class="{'is-active-side': currentSection=='split'}" @click="activate('split')")
        p: i.x-menu-icon.fas.fa-columns
        p Split view
      //- .x-item(:class="{'is-active-side': currentSection=='runs'}" @click="activate('runs')")
      //-   p: i.x-menu-icon.fas.fa-play-circle
      //-   p Run manager

    .space
      .xsection Tools
      .x-item(@click="go('/map')")
        p: i.x-menu-icon.fas.fa-map
        p Map Builder
      .x-item(@click="go('/matrix')")
        p: i.x-menu-icon.fas.fa-th
        p Matrix Viewer

    .space
      .xsection Documentation &amp; Help

      a.x-item(href="https://simwrapper.github.io/docs" target="_blank")
        p: i.x-menu-icon.fas.fa-book-open
        p Documentation
      a.x-item(href="https://simwrapper.github.io/docs/guide-getting-started " target="_blank")
        p: i.x-menu-icon.fas.fa-flag-checkered
        p Tutorial
      a.x-item(href="https://github.com/orgs/simwrapper/discussions" target="_blank")
        p: i.x-menu-icon.fas.fa-comments
        p Discussion Board
      a.x-item(href="https://github.com/simwrapper/simwrapper/issues" target="_blank")
        p: i.x-menu-icon.fas.fa-spider
        p Bugs/Feature Requests

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import isDarkColor from 'is-dark-color'

import globalStore from '@/store'
import type { NavigationItem } from '@/Globals'

import imgLogo from '@/assets/simwrapper-logo/SW_logo_white.png'
import imgSidebar from '@/assets/icons/sidebar.png'
import SettingsPanel from './SettingsPanel.vue'

const BASE_URL = import.meta.env.BASE_URL

export default defineComponent({
  name: 'SiteNavBar',
  components: { SettingsPanel },

  props: {
    currentFolder: { type: String, required: false },
    projectFolder: { type: String, required: false },
  },

  data() {
    return {
      showSidebarMenu: false,
      showSettings: false,
      selectedGroup: -1,
      isDark: false,
      imgLogo,
      imgSidebar,
      navbar: {
        left: [],
        right: [],
        baseURL: '',
      },
    }
  },

  computed: {
    currentSection() {
      const section = globalStore.state.activeLeftSection
      // console.log(123, section)
      return section
    },
  },

  methods: {
    go(path: string) {
      this.showSidebarMenu = false
      const fullPath = `${BASE_URL}${path}`.replaceAll('//', '/')
      this.$router.push(fullPath)
    },

    activate(item: string) {
      this.$store.commit('setActiveLeftSection', item)

      this.$store.commit('setShowLeftBar', !!item)
      this.showSidebarMenu = false
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

      const baseURL = this.navbar.baseURL
      const fullUrl = `${baseURL}${url}`
      return fullUrl
    },

    getStyle(item: any) {
      const style = {} as any
      if (item.style) Object.assign(style, item.style)
      return style
    },

    getNavbarStyle(item: any) {
      const style = {} as any
      if (item.style) Object.assign(style, item.style)

      // light or dark?
      const darks = ['black', 'blue', 'brown', 'green', 'red', 'purple']
      if (darks.includes(style.backgroundColor)) this.isDark = true
      if (style.backgroundColor && style.backgroundColor.startsWith('#')) {
        this.isDark = isDarkColor(style.backgroundColor)
      }
      // override text color
      if ('useDarkText' in style) this.isDark = !style.useDarkText
      return style
    },

    toggleSettings() {
      this.showSettings = !this.showSettings
    },

    navigate(url: string, group: number) {
      if (group !== undefined) this.selectedGroup = group

      if (url.startsWith('http')) {
        window.location.href = url
      } else {
        // is subfolder absolute path or relative to project?
        const xsubfolder = url.startsWith('/') ? url : `${this.projectFolder}/${url}`

        const props = {
          root: this.$store.state.topNavItems.fileSystem.slug || '',
          xsubfolder,
          thumbnail: false,
        }

        this.$emit('navigate', {
          component: 'TabbedDashboardView',
          props,
        })
      }
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$appTag: #32926f;

.my-navbar {
  user-select: none;
  gap: 1rem;
  background: linear-gradient(90deg, #425bda, #246a4f); // #801bec
  color: white;
  position: relative;
}

.simwrapper-logo {
  margin-top: 4px;
  width: 100px;
}

.sidebar-button {
  margin-top: 5px;
  width: 20px;
  filter: brightness(0) invert(1);
}

.brand {
  gap: 1rem;
  padding: 4px 0.75rem 3px 0.75rem;
}

.brand:hover {
  background-color: $appTag;
  cursor: pointer;
}

.brand.is-highlighted {
  background-color: $appTag;
}

.title-section {
  margin: auto auto;
  text-align: center;
  font-weight: bold;
  font-size: 1.2rem;
  margin-left: -9rem;
}

.right-section {
  margin: auto 0.75rem auto 0;
  cursor: pointer;
}

.x-menu-icon {
  width: 20px;
}

.is-active-side {
  background-color: white;
  font-weight: bold;
}

.settings-popup {
  position: absolute;
  top: 34px;
  right: 5px;
  background-color: white;
  color: #333;
  padding: 0.5rem 0.5rem 0rem 0.5rem;
  font-size: 0.9rem;
  z-index: 10000;
  border-radius: 0;
  filter: $filterShadow;
}

.space {
  margin: 0.5rem 0 0 0.25rem;
}

.dropdown-holder {
  position: absolute;
  top: 34px;
  background-color: #eee;
  color: #333;
  filter: $filterShadow;
  padding: 0.25rem 0;

  a {
    color: #333;
  }

  .fa-cog {
    cursor: pointer;
  }

  .xsection {
    text-transform: uppercase;
    font-size: 0.9rem;
    font-weight: bold;
    color: $appTag;
    padding: 0.5rem 5px 5px 0.5rem;
  }

  .x-item {
    display: flex;
    padding: 0 0.75rem 0 0.25rem;
  }

  .x-item:hover {
    cursor: pointer;
    background-color: $appTag;
    color: white;
  }
  hr {
    margin: 4px 0;
    background-color: #00000011;
  }
  p {
    padding: 4px 0 4px 0.5rem;
  }
}
</style>
