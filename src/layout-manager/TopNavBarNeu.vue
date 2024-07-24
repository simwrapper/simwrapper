<template lang="pug">
.my-navbar.flex-row

  .brand.flex-row
    .simwrapper-logo
      img(:src="imgLogo")
    .sidebar-button
      img(:src="imgSidebar")

  .left-section.flex1
    p Dashboard

  .right-section
    p: i.fas.fa-cog


//- b-navbar#site-nav-bar(
//-   :style="getNavbarStyle(navbar)"
//-   :type="isDark ? 'is-black' : 'is-white'"
//- )

//-   template("#brand" v-if="navbar.logo")
//-     b-navbar-item(
//-       @click="navigate(navbar.logo.url)" :style="getStyle(navbar.logo)"
//-     ): img(:src="logo" :style="getStyle()")

//-   template("#start")

//-     component(v-for="item,i in navbar.left" :key="`${i}`"
//-       hoverable
//-       :is="item.dropdown ? 'BNavbarDropdown' : 'BNavbarItem'"
//-       :style="getStyle(item)"
//-       :label="item.dropdown ? getLabel(item) : undefined"
//-       @click="navigate(item.url)"
//-     ) {{ item.dropdown ? undefined : getLabel(item) }}

//-       b-navbar-item(v-for="child in item.dropdown" :key="`child-${i}`"
//-         @click="navigate(child.url)"
//-       ) {{ getLabel(child) }}

//-   template("#end")

//-     component(v-for="item,i in navbar.right" :key="`${i}`"
//-       hoverable
//-       :is="item.dropdown ? 'BNavbarDropdown' : 'BNavbarItem'"
//-       :style="getStyle(item)"
//-       :label="item.dropdown ? getLabel(item) : undefined"
//-       @click="navigate(item.url)"
//-     ) {{ item.dropdown ? undefined : getLabel(item) }}

//-       b-navbar-item(v-for="child,j in item.dropdown" :key="`child-${j}`"
//-         @click="navigate(child.url)"
//-       ) {{ getLabel(child) }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import isDarkColor from 'is-dark-color'

import type { NavigationItem } from '@/Globals'

import imgLogo from '@/assets/simwrapper-logo/SW_logo_white.png'
import imgSidebar from '@/assets/icons/sidebar.png'

export default defineComponent({
  name: 'SiteNavBar',
  components: {},

  props: {
    // currentFolder: { type: String, required: true },
    // projectFolder: { type: String, required: true },
  },

  data() {
    return {
      showSidebarMenu: false,
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

  computed: {},

  methods: {
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

.my-navbar {
  user-select: none;
  gap: 1rem;
  background: linear-gradient(90deg, #425bda, #246a4f); // #801bec
  color: white;
  position: relative;
}

.simwrapper-logo {
  margin-top: 3px;
  width: 104px;
}

.sidebar-button {
  margin-top: 4px;
  width: 20px;
  filter: brightness(0) invert(1);
}

.brand {
  gap: 1rem;
  padding: 4px 0.75rem 3px 0.75rem;
}

.brand:hover {
  background-color: #317d68;
  cursor: pointer;
}

.left-section {
  margin: auto 0;
}

.right-section {
  margin: auto 0.75rem auto 0;
}

.my-dropdown {
  position: absolute;
}
</style>
