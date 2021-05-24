<i18n>
en:
  close: 'Close panel'
  back: 'Go back'
de:
  close: 'Schließen'
  back: 'Zurück'
</i18n>

<template lang="pug">
#split-screen

  run-finder-panel.split-panel.narrow(@navigate="onNavigate(0,$event)" @split="onSplit")

  .split-panel(v-for="panel,i in panels" :key="panel.key")
    component.fill-panel(:is="panel.component" v-bind="panel.props" @navigate="onNavigate(i,$event)")
    .control-buttons()
      a(@click="onBack(i)" :title="$t('back')" v-if="panel.component !== 'FolderBrowser' && panel.component !== 'SplashPage'")
        i.fa.fa-icon.fa-arrow-left
      a(@click="onClose(i)" v-if="panels.length > 1" :title="$t('close')")
        i.fa.fa-icon.fa-times-circle

</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import plugins from '@/plugins/pluginRegistry'

import RunFinderPanel from '@/components/RunFinderPanel.vue'
import FolderBrowser from '@/views/FolderBrowser.vue'
import SplashPage from '@/views/SplashPage.vue'

@Component({
  components: Object.assign({ SplashPage, RunFinderPanel, FolderBrowser }, plugins),
})
class MyComponent extends Vue {
  // the calls to $forceUpdate() below are because Vue does not watch deep array contents.

  private mounted() {
    this.buildLayoutFromURL()
  }

  private buildLayoutFromURL() {
    const pathMatch = this.$route.params.pathMatch
    if (!pathMatch) return

    try {
      const content = atob(pathMatch)
      // console.log(content)
      const json = JSON.parse(content)
      this.panels = json
    } catch (e) {
      // couldn't do
      this.$router.replace('/')
    }
  }

  private onSplit() {
    // front page
    if (this.panels[0].component === 'SplashPage') {
      return this.panels.push({
        component: 'SplashPage',
        props: {},
        key: Math.random(),
      })
    }

    // all other cases
    const leftProps = this.panels[0].props
    const newPanel = {
      component: 'FolderBrowser',
      props: Object.assign({ xsubfolder: leftProps.subfolder || leftProps.xsubfolder }, leftProps),
      key: Math.random(),
    }

    this.panels.unshift(newPanel)
  }

  private onNavigate(panelNumber: number, newPanel: { component: string; props: any }) {
    this.panels[panelNumber] = Object.assign({ key: this.panels[panelNumber].key }, newPanel)
    this.updateURL()
    this.$forceUpdate()
  }

  private onClose(panel: number) {
    this.panels.splice(panel, 1) // at i:panel remove 1 item
    this.updateURL()
  }

  private onBack(panel: number) {
    this.panels[panel].component = 'FolderBrowser'
    this.panels[panel].props.xsubfolder = this.panels[panel].props.subfolder
    this.updateURL()
    this.$forceUpdate()
  }

  private updateURL() {
    const base64 = btoa(JSON.stringify(this.panels))
    this.$router.replace(`/${base64}`)
  }

  private panels = [
    {
      component: 'SplashPage',
      key: Math.random(),
      props: {} as any,
    },
  ]
}

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#split-screen {
  display: flex;
  flex-direction: row;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
}

.split-panel {
  background-color: var(--bgBold);
  border-right: 1.5px solid var(--bgCream3);
  position: relative;
  flex: 1;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: 1fr;
}

.fill-panel {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  height: 100%;
}

.narrow {
  z-index: 1;
  width: 16rem;
  flex: unset;
  border-right: none;
}

.control-buttons {
  padding: 0.5rem 0.5rem;
  z-index: 2;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: column;
  margin: 0 auto auto 0;

  a {
    color: #88888880;
    font-size: 0.8rem;
    margin: 0.3rem 0rem 0.3rem -3px;
  }

  a:hover {
    color: var(--link);
  }
}

.control-buttons:hover {
  background-color: #88888822;
}

@media only screen and (max-width: 640px) {
  // #split-screen {
  //   flex-direction: column;
  // }
}
</style>
