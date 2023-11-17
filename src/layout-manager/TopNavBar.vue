<template lang="pug">
#site-nav-bar(:style="getStyle(navbar)")
  .span(v-for="item in navbar.left" :style="getStyle(item)")
    .logo(v-if="item.image")
      a(v-if="item.url" @click="navigate(item.url)")
        img(:src="getUrl(item.image)" :style="getStyle(item)")
      img(v-else :src="getUrl(item.image)" :style="getStyle(item)")

    .xmenu(v-else-if="hasLabel(item)" :style="getStyle(item)")
      p(v-if="item.url"): a(@click="navigate(item.url)" :style="getStyle(item, true)") {{ getLabel(item) }}
      p(v-else) {{ getLabel(item) }}

  .push-right &nbsp;

  .stacked(v-for="item,i in navbar.right" :style="getStyle(item)")

      .xmenu(v-if="hasLabel(item)" :style="getStyle(item)")
        p(v-if="item.url"): a(@click="navigate(item.url, i)" :style="getStyle(item, true)") {{ getLabel(item) }}
        p(v-else @click="selectedGroup=i") {{ getLabel(item) }}

      .child-options(:class="{'is-parent-selected': i===selectedGroup}")
        .span(v-for="child in item.children" :style="getStyle(child)")
          p(v-if="child.url"): a(@click="navigate(child.url, i)" :style="getStyle(child, true)") {{ getLabel(child) }}
          p(v-else) {{ getLabel(child) }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import type { NavigationItem } from '@/Globals'
export default defineComponent({
  name: 'SiteNavBar',
  components: {},

  props: {
    currentFolder: { type: String, required: true },
  },

  data: () => {
    return {
      selectedGroup: -1,
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

    getStyle(item: any, isLink: boolean) {
      const style = {} as any
      if (item.style) Object.assign(style, item.style)

      // Current folder gets special highlight
      if (
        isLink &&
        item.url &&
        this.currentFolder.length > 1 &&
        item.url.indexOf(this.currentFolder) > -1
      ) {
        style.borderBottom = '1px solid white'
        style.fontWeight = 'bold'
      }
      return style
    },

    navigate(url: string, group: number) {
      if (group !== undefined) this.selectedGroup = group

      if (url.startsWith('http')) {
        window.location.href = url
      } else {
        const props = {
          root: this.$store.state.topNavItems.fileSystem.slug || '',
          xsubfolder: url,
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
  display: flex;
  flex-direction: row;
  color: #ddd;
  background-color: #333faa;
  padding-right: 0.5rem;
  font-size: 13px;
}

.xmenu {
  padding: 0px 0px;
  margin: 0 0;
  margin-right: 1rem;
  line-height: 1.2rem;
}

p {
  padding: 0 0;
}

a {
  color: #ddd;
}

a:hover {
  color: yellow;
}

.xmenu:hover {
  // background-color: #4b55aa;
  cursor: pointer;
  color: yellow;
}

.xbrand {
  font-weight: bold;
  color: white;
  font-family: $fancyFont;
  // margin-top: -1px;
}

.push-right {
  margin-left: auto;
}

.errors {
  background-color: #ae0f0f;
  color: white;
  font-weight: bold;
}

.stacked {
  display: flex;
  flex-direction: column;
  margin-top: 3px;
  margin-right: 1rem;
  margin-bottom: 3px;
}

.child-options {
  display: flex;
  flex-direction: row;
  visibility: hidden;

  p {
    padding: 0 0;
    margin: 0 0;
    margin-right: 1rem;
  }
}

.stacked:hover .child-options {
  visibility: visible;
}

.is-parent-selected {
  visibility: visible;
}
</style>
