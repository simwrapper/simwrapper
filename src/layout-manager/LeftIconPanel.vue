<template lang="pug">
.icon-panel
  .top
    .item(v-for="section in topSections" :key="section.name"
      :class="{'is-active': activeSection === section.name}"

      @click="select(section)"
    )
      .sideways
        p {{ section.name }}

      img.svg-icon(v-if="section.icon"
        :src="section.icon"
        :draggable="false"
        :style="{filter: section.colorize ? issueColor : 'invert(100%)'}"
      )
      i.fa-icon.fas(v-if="section.fontAwesomeIcon" :class="section.fontAwesomeIcon")

  .bottom

    .item(v-for="section in bottomSections" :key="section.name"
      @click="select(section)"
    )
      p.sideways {{ section.name }}
      img.svg-icon(v-if="section.icon"
        :src="section.icon"
        :draggable="false"
        :style="{filter: section.colorize ? issueColor : 'invert(100%)'}"
      )

  settings-panel.settings-popup(v-if="isShowingSettings"
    @close="toggleSettings()"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'

import ICON_FILES from '@/assets/icons/files.svg'
import ICON_ISSUES from '@/assets/icons/issues.svg'
import ICON_INFO from '@/assets/icons/settings.svg'
import ICON_DOCS from '@/assets/icons/readme.svg'
import ICON_SIMWRAPPER from '@/assets/simwrapper-logo/SW_logo_icon_black.png'

import globalStore from '@/store'
import SettingsPanel from './SettingsPanel.vue'

const DOCS_URL = 'https://simwrapper.github.io/docs'

export interface Section {
  name: string
  class: string
  icon?: string
  colorize?: boolean
  link?: string
  onlyIfVisible?: boolean
  navRoot?: string
}

export default defineComponent({
  name: 'LeftIconPanel',
  components: { SettingsPanel },
  props: {
    activeSection: { type: String, required: true },
  },
  data: () => {
    return {
      state: globalStore.state,
      isShowingSettings: false,
      topSections: [
        { name: 'Home', class: 'LeftSystemPanel', icon: ICON_SIMWRAPPER },
        { name: 'Split', class: 'LeftSplitFolderPanel', fontAwesomeIcon: 'fa-columns' },
        // { name: 'Issues', class: 'ErrorPanel', icon: ICON_ISSUES, colorize: true },
        // { name: 'Search', class: 'RunFinderPanel', icon: ICON_ARROW },
        // { name: 'Gallery', class: 'RunFinderPanel', icon: ICON_ARROW },
      ] as Section[],
      bottomSections: [
        { name: 'Documentation', link: DOCS_URL, icon: ICON_DOCS },
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
      if (section.name == 'Settings') {
        this.toggleSettings()
      } else {
        this.$emit('activate', section)
      }
    },

    toggleSettings() {
      this.isShowingSettings = !this.isShowingSettings
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.icon-panel {
  background-color: var(--bgIconBar);
  display: flex;
  flex-direction: column;
  user-select: none;
  color: #fff;
  // padding-top: 1rem;
}

.top {
  margin-top: 0rem;
  margin-bottom: auto;
  display: flex;
  flex-direction: column;
}

.bottom {
  display: flex;
  flex-direction: column;
}

.item {
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  margin: 0 auto 0 auto;
  opacity: 0.4;
  width: 22px;
  p {
    font-size: 0.8rem;
  }
}

.item:hover {
  cursor: pointer;
  opacity: 1;
}

.item.is-active {
  opacity: 1;
  background-color: $themeColorPale;
}

img {
  margin: 8px auto 0 auto;
  width: 11px;
}

.sideways {
  transform: rotate(-90deg);
  margin-top: 0.75rem;
}

.fa-icon {
  margin: 7px auto 0 auto;
  font-size: 10px;
}

.settings-popup {
  position: absolute;
  bottom: 26px;
  left: 28px;
  right: 8px;
  background-color: #202028;
  padding: 0.5rem 0.5rem 0rem 0.5rem;
  font-size: 0.9rem;
  filter: drop-shadow(0px 0px 8px #00000060);
}
</style>
