<template lang="pug">
.icon-panel

  .top

    .item(v-for="section in topSections" :key="section.name"
      v-show="!section.hidden"
      :class="{'is-active': section.name === activeSection, 'is-dark': isDarkMode}"
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
      .sideways
        p {{ section.name }}

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

import globalStore from '@/store'
import SettingsPanel from './SettingsPanel.vue'

import ICON_INFO from '@/assets/icons/settings.svg'
import ICON_DOCS from '@/assets/icons/readme.svg'
import ICON_SIMWRAPPER from '@/assets/simwrapper-logo/SW_logo_icon_black.png'

const DOCS_URL = 'https://simwrapper.github.io/docs'

export interface Section {
  name: string
  class: string
  icon?: string
  colorize?: boolean
  link?: string
  onlyIfVisible?: boolean
  navRoot?: string
  hidden?: boolean
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
      isDarkMode: false,
      topSections: [
        { name: 'Data', class: 'LeftSystemPanel', icon: ICON_SIMWRAPPER },
        { name: 'Split', class: 'LeftSplitFolderPanel', fontAwesomeIcon: 'fa-columns' },
        {
          hidden: true,
          name: 'Runs',
          class: 'LeftRunnerPanel',
          fontAwesomeIcon: 'fa-network-wired',
        },
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

  watch: {
    'state.isDarkMode'() {
      this.isDarkMode = this.state.isDarkMode
    },
  },

  computed: {
    isDark() {
      return this.state.isDarkMode
    },

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
        return
      }

      if (section.name !== this.activeSection) {
        // user picked new tab
        this.$store.commit('setShowLeftBar', true)
        this.$emit('activate', section)
      } else {
        // user picked same tab: toggle left panel!
        this.$store.commit('setShowLeftBar', !this.$store.state.isShowingLeftBar)
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
  margin-bottom: 0.5rem;
}

.item {
  display: flex;
  flex-direction: column;
  padding: 1rem 0;
  margin: 0 auto 0 auto;
  opacity: 0.7;
  width: 26px;
  p {
    font-size: 13px;
    line-height: 1rem;
  }
}

.item:hover {
  cursor: pointer;
  opacity: 1;
}

.bottom .item {
  margin-top: 1rem;
}

.is-active {
  opacity: 1;
  background-color: $themeColorPale;
}

img {
  margin: 10px auto 0 auto;
  width: 12px;
}

.sideways {
  transform: rotate(-90deg);
  margin-top: 0.75rem;
}

.fa-icon {
  margin: 10px auto 0 auto;
  font-size: 10px;
}

.settings-popup {
  position: absolute;
  bottom: 0.5rem;
  left: 28px;
  right: 8px;
  background-color: #202028;
  padding: 0.5rem 0.5rem 0rem 0.5rem;
  font-size: 0.9rem;
  z-index: 10000;
  filter: drop-shadow(0px 0px 8px #00000060);
}

.hide-left-panel-button:hover {
  background-color: #666; // #3c3c49;
  color: #deef6f;
  cursor: pointer;
}
</style>
