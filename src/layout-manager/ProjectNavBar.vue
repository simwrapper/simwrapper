<template lang="pug">
b-navbar#site-nav-bar(
  :style="getNavbarStyle(navbar)"
  :type="isDark ? 'is-black' : 'is-white'"
)

  template("#brand" v-if="navbar.logo")
    b-navbar-item(
      @click="navigate(navbar.logo.url)" :style="getStyle(navbar.logo)"
    ): img(:src="navbar.logo.image" :style="getStyle(navbar.logo)")

  template("#start")

    component(v-for="item,i in navbar.left" :key="`${i}`"
      hoverable
      :is="item.dropdown ? 'BNavbarDropdown' : 'BNavbarItem'"
      :style="getStyle(item)"
      :label="item.dropdown ? getLabel(item) : undefined"
      @click="navigate(item.url)"
    ) {{ item.dropdown ? undefined : getLabel(item) }}

      b-navbar-item(v-for="child in item.dropdown" :key="`child-${i}`"
        @click="navigate(child.url)"
      ) {{ getLabel(child) }}

  template("#end")

    component(v-for="item,i in navbar.right" :key="`${i}`"
      hoverable
      :is="item.dropdown ? 'BNavbarDropdown' : 'BNavbarItem'"
      :style="getStyle(item)"
      :label="item.dropdown ? getLabel(item) : undefined"
      @click="navigate(item.url)"
    ) {{ item.dropdown ? undefined : getLabel(item) }}

      b-navbar-item(v-for="child,j in item.dropdown" :key="`child-${j}`"
        @click="navigate(child.url)"
      ) {{ getLabel(child) }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import isDarkColor from 'is-dark-color'

import type { NavigationItem } from '@/Globals'
export default defineComponent({
  name: 'ProjectNavBar',
  components: {},

  props: {
    currentFolder: { type: String, required: true },
    projectFolder: { type: String, required: true },
  },

  data: () => {
    return {
      selectedGroup: -1,
      isDark: false,
    }
  },

  computed: {
    navbar() {
      const items = this.$store.state.topNavItems
      if (!items) return { left: [], right: [], baseURL: '' }

      return items
    },
  },

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

#site-nav-bar {
  user-select: none;
  padding: 0 0.5rem;
}
</style>
