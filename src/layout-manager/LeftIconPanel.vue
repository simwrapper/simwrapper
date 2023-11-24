<template lang="pug">
.icon-panel

  .top

    .item(v-for="section in topSections" :key="section.name"
      :class="{'is-active': section.name === activeSection}"
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

  .hide-left-panel-button(@click="hideLeftPanel")
    p.show-hide: i.fas.fa-arrow-left

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
    hideLeftPanel() {
      this.$store.commit('setShowLeftBar', false)
      this.$store.commit('setManualLeftPanelHidden', true)
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
  margin-bottom: 4rem;
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

.is-active {
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
  bottom: 0.5rem;
  left: 28px;
  right: 8px;
  background-color: #202028;
  padding: 0.5rem 0.5rem 0rem 0.5rem;
  font-size: 0.9rem;
  z-index: 2;
  filter: drop-shadow(0px 0px 8px #00000060);
}

.hide-button {
  padding-top: 0;
  // background-color: #48485f;
}

.hide-left-panel-button {
  position: absolute;
  left: 0;
  bottom: 0;
  height: 3rem;
  margin-bottom: 1rem;
  background-color: #48485f; // $appTag;
  z-index: 8000;
  color: #ccc;
  border-top-right-radius: 6px;
  border-bottom-right-radius: 6px;
  display: flex;
  flex-direction: column;

  p {
    margin: auto 0;
    padding: 0 3px;
    font-size: 9px;
    text-align: center;
  }
}

.hide-left-panel-button:hover {
  background-color: #666; // #3c3c49;
  color: #deef6f;
  cursor: pointer;
}
</style>
