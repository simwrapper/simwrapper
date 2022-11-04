<template lang="pug">
.left-nav-panel
  .top
    button.item(v-for="section in topSections" :key="section.name"
      :style="buttonStyle(section)"
      @click="select(section)"
    )
      img(:src="section.icon" :draggable="false")
      p {{ section.name }}

  .bottom
    .item(v-for="section in bottomSections" :key="section.name"
      :style="buttonStyle(section)"
      @click="select(section)"
    )
      img(:src="section.icon")
      p {{ section.name }}

  //- .hide
  //-   b-button.button(size="is-small" expanded) <<

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import ICON_ARROW from '@/assets/images/sw_north_arrow_dm.png'

export interface Section {
  name: string
  class: string
  icon?: string
}

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) activeSection!: string

  private topSections: Section[] = [
    { name: 'Files', class: 'TabbedDashboardView', icon: ICON_ARROW },
    { name: 'Issues', class: 'ErrorPanel', icon: ICON_ARROW },
    // { name: 'Search', class: 'RunFinderPanel', icon: ICON_ARROW },
    // { name: 'Gallery', class: 'RunFinderPanel', icon: ICON_ARROW },
  ]

  private bottomSections: Section[] = [
    // { name: 'Docs', class: 'RunFinderPanel', icon: ICON_ARROW },
    { name: 'Settings', class: 'SettingsPanel', icon: ICON_ARROW },
  ]

  public select(section: Section) {
    if (section.name === this.activeSection) this.$emit('activate', '')
    else this.$emit('activate', section)
  }

  public buttonStyle(section: any) {
    if (this.activeSection !== section.name) return {}

    return {
      opacity: 1.0,
      borderLeft: '3px solid white',
    }
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.left-nav-panel {
  background-color: #333338;
  display: flex;
  flex-direction: column;
  user-select: none;
}

.top {
  margin-bottom: auto;
  display: flex;
  flex-direction: column;
  padding-top: 8px;
}

.bottom {
  display: flex;
  flex-direction: column;
}

.item {
  width: 60px;
  text-align: center;
  margin-bottom: 12px;
  border-left: 3px solid #00000000;
  border-right: 3px solid #00000000;
  opacity: 0.5;
}

p {
  margin-top: -6px;
  font-size: 11px;
  color: #c6c1b9;
}

.item img {
  width: 44px;
  margin: 0 auto;
  transform: rotate(90deg);
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
  color: white;
  background-color: #555;
}

@media only screen and (max-width: 640px) {
}
</style>
