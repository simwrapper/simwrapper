<template lang="pug">
.left-nav-panel
  .top
    button.item(v-for="section in topSections" :key="section.name"
      :style="buttonStyle(section)"
      @click="select(section)"
    )
      img.svg-icon(
        :src="section.icon"
        :draggable="false"
        :style="{filter: section.colorize ? issueColor : 'invert(100%)'}"
      )
      p {{ section.name }}

  .bottom
    button.item(v-for="section in bottomSections" :key="section.name"
      :style="buttonStyle(section)"
      @click="select(section)"
    )
      img.svg-icon(
        :src="section.icon"
        :draggable="false"
        :style="{filter: section.colorize ? issueColor : 'invert(100%)'}"
      )
      p {{ section.name }}

  //- .hide
  //-   b-button.button(size="is-small" expanded) <<

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import ICON_FILES from '@/assets/icons/files.svg'
import ICON_ISSUES from '@/assets/icons/issues.svg'
import ICON_INFO from '@/assets/icons/settings.svg'
import ICON_DOCS from '@/assets/icons/readme.svg'

import globalStore from '@/store'

const DOCS_URL = 'https://simwrapper.github.io/docs'

export interface Section {
  name: string
  class: string
  icon?: string
  colorize?: boolean
  link?: string
  onlyIfVisible?: boolean
}

export default defineComponent({
  name: 'LeftIconPanel',
  props: {
    activeSection: { type: String, required: true },
  },
  data: () => {
    return {
      state: globalStore.state,
      topSections: [
        { name: 'Files', class: 'BrowserPanel', icon: ICON_FILES },
        { name: 'Issues', class: 'ErrorPanel', icon: ICON_ISSUES, colorize: true },
        // { name: 'Search', class: 'RunFinderPanel', icon: ICON_ARROW },
        // { name: 'Gallery', class: 'RunFinderPanel', icon: ICON_ARROW },
      ] as Section[],
      bottomSections: [
        { name: 'Docs', link: DOCS_URL, icon: ICON_DOCS },
        { name: 'Settings', class: 'SettingsPanel', icon: ICON_INFO },
      ] as Section[],
    }
  },
  computed: {
    issueColor() {
      // red
      if (this.state.statusErrors.length)
        return 'invert(60%) sepia(100%) hue-rotate(310deg) saturate(8.5)'
      // yellow
      if (this.state.statusWarnings.length)
        return 'invert(75%) sepia(100%) hue-rotate(15deg) saturate(5.5)'
      // white
      return 'invert(100%)'
    },
  },
  methods: {
    select(section: Section) {
      this.$emit('activate', section)
    },

    buttonStyle(section: any) {
      const colorizedOpacity =
        this.state.statusErrors.length || this.state.statusWarnings.length ? 0.8 : 0.4

      if (this.activeSection !== section.name) {
        return { opacity: section.colorize ? colorizedOpacity : 0.4 }
      }

      return {
        opacity: 1.0,
        borderLeft: '3px solid white',
      }
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.left-nav-panel {
  background-color: #313135;
  display: flex;
  flex-direction: column;
  user-select: none;
}

.top {
  margin-bottom: auto;
  display: flex;
  flex-direction: column;
  padding-top: 4px;
}

.bottom {
  display: flex;
  flex-direction: column;
}

.item {
  width: 60px;
  text-align: center;
  margin-bottom: 16px;
  border-left: 3px solid #00000000;
  border-right: 3px solid #00000000;
  opacity: 0.4;
}

p {
  margin-top: -6px;
  font-size: 11px;
  color: #c6c1b9;
}

.item img {
  margin: 5px 4px;
  width: 26px;
}

.item:hover {
  cursor: pointer;
  opacity: 1;
}

.button {
  background-color: #444;
  border: none;
  color: #ccc;
  height: 20px;
}

.button:hover,
.button:active {
  background-color: #555;
}
</style>
