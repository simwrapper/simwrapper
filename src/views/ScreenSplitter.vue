<template lang="pug">
#split-screen

  run-finder-panel.split-panel.narrow(v-show="showLeftBar"
    @navigate="onNavigate(0,$event)"
    @split="onSplit"
  )

  .split-panel(v-for="panel,i in panels" :key="panel.key"
    :class="{'is-multipanel' : panels.length > 1}"
  )
    component.fill-panel(
      :is="panel.component"
      v-bind="panel.props"
      @navigate="onNavigate(i,$event)"
      @zoom="showBackArrow(i, $event)"
    )

    .control-buttons
      a(v-if="!zoomed && panelsWithNoBackButton.indexOf(panel.component) === -1"
        @click="onBack(i)" :title="$t('back')")
          i.fa.fa-icon.fa-arrow-left
      a(v-if="panels.length > 1 && !zoomed" :title="$t('close')"
        @click="onClose(i)")
          i.fa.fa-icon.fa-times-circle

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { close: 'Close panel', back: 'Go back' },
    de: { close: 'Schließen', back: 'Zurück' },
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { Route } from 'vue-router'
import micromatch from 'micromatch'

import globalStore from '@/store'
import plugins from '@/plugins/pluginRegistry'

import RunFinderPanel from '@/components/RunFinderPanel.vue'
import TabbedDashboardView from '@/views/TabbedDashboardView.vue'
import SplashPage from '@/views/SplashPage.vue'

@Component({
  i18n,
  components: Object.assign({ SplashPage, RunFinderPanel, TabbedDashboardView }, plugins),
})
class MyComponent extends Vue {
  // the calls to $forceUpdate() below are because Vue does not watch deep array contents.

  private baseURL = import.meta.env.BASE_URL

  private panels = [] as any

  private panelsWithNoBackButton = ['TabbedDashboardView', 'SplashPage', 'FolderBrowser']

  private zoomed = false

  private showBackArrow(isZoomed: number, state: boolean) {
    this.zoomed = state
  }

  private mounted() {
    this.buildLayoutFromURL()
  }

  @Watch('$route') routeChanged(to: Route, from: Route) {
    if (to.path === this.baseURL) {
      // root node is not a normal splitpane, so we instead replace
      // with a brand new clean startpage.
      this.panels = [
        {
          component: 'SplashPage',
          key: Math.random(),
          props: {} as any,
        },
      ]
    } else {
      this.buildLayoutFromURL()
      globalStore.commit('resize')
      // TODO clear error
    }
  }

  private buildLayoutFromURL() {
    const pathMatch = this.$route.params.pathMatch
    if (!pathMatch) {
      this.panels = [{ component: 'SplashPage', key: Math.random(), props: {} as any }]
      return
    }

    // splash page:
    if (pathMatch === '/') {
      this.panels = [
        {
          component: 'SplashPage',
          key: Math.random(),
          props: {} as any,
        },
      ]
      return
    }

    // split panel:
    if (pathMatch.startsWith('split/')) {
      const payload = pathMatch.substring(6)
      try {
        const content = atob(payload)
        const json = JSON.parse(content)
        this.panels = json
      } catch (e) {
        // couldn't do
        this.$router.replace('/')
      }
      return
    }

    // split out project root and subfolder
    let root = pathMatch
    let xsubfolder = ''
    const slash = pathMatch.indexOf('/')
    if (slash > -1) {
      root = pathMatch.substring(0, slash)
      xsubfolder = pathMatch.substring(slash + 1)
    }

    // single visualization?
    const fileNameWithoutPath = [pathMatch.substring(1 + pathMatch.lastIndexOf('/'))]
    for (const vizPlugin of globalStore.state.visualizationTypes.values()) {
      if (micromatch(fileNameWithoutPath, vizPlugin.filePatterns).length) {
        // plugin matched!
        const key = this.panels.length === 1 ? this.panels[0].key : Math.random()
        this.panels = [
          {
            key,
            component: vizPlugin.kebabName,
            props: {
              root,
              subfolder: xsubfolder.substring(0, xsubfolder.lastIndexOf('/')),
              yamlConfig: fileNameWithoutPath[0],
              thumbnail: false,
            } as any,
          },
        ]
        this.$store.commit('setShowLeftBar', true)
        return
      }
    }

    // Last option: folder browser/dashboard panel
    const key = this.panels.length === 1 ? this.panels[0].key : Math.random()
    this.panels = [
      {
        key,
        component: 'TabbedDashboardView',
        props: { root, xsubfolder } as any,
      },
    ]
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
    const leftPanel = this.panels[0]
    const newPanel = {
      component: leftPanel.component,
      props: Object.assign({}, leftPanel.props),
      key: Math.random(),
    }

    this.panels.unshift(newPanel)
    this.updateURL()
    globalStore.commit('resize')
  }

  private onNavigate(panelNumber: number, newPanel: { component: string; props: any }) {
    if (newPanel.component === 'SplashPage') {
      this.panels[panelNumber] = { component: 'SplashPage', props: {}, key: Math.random() }
    } else {
      this.panels[panelNumber] = Object.assign({ key: this.panels[panelNumber].key }, newPanel)
    }

    this.updateURL()
    this.buildLayoutFromURL()
    // this.$forceUpdate()
  }

  private onClose(panel: number) {
    this.panels.splice(panel, 1) // at i:panel, remove 1 item
    this.updateURL()
    globalStore.commit('resize')
  }

  private onBack(panel: number) {
    this.panels[panel].component = 'TabbedDashboardView'
    this.panels[panel].props.xsubfolder = this.panels[panel].props.subfolder
    delete this.panels[panel].props.yamlConfig

    this.updateURL()
    // this.$forceUpdate()
  }

  private updateURL() {
    const BASE = import.meta.env.BASE_URL

    if (this.panels.length === 1) {
      const props = this.panels[0].props

      const root = props.root || ''
      const xsubfolder = props.xsubfolder || props.subfolder || ''
      const yaml = props.yamlConfig || ''

      if (yaml.indexOf('/') > -1) {
        // a YAML from a config folder will have a path in it:
        const yamlFileWithoutPath = yaml.substring(yaml.lastIndexOf('/'))
        this.$router.replace(`${BASE}${root}/${xsubfolder}/${yamlFileWithoutPath}`)
      } else if (yaml) {
        // YAML config specified
        this.$router.replace(`${BASE}${root}/${xsubfolder}/${yaml}`)
      } else {
        // No config file, just the folder
        this.$router.push(`${BASE}${root}/${xsubfolder}`)
      }
    } else {
      const base64 = btoa(JSON.stringify(this.panels))
      this.$router.push(`${BASE}split/${base64}`)
    }
  }
  private get showLeftBar() {
    return this.$store.state.isShowingLeftBar
  }
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
  background-color: var(--splitPanel);
}

.is-multipanel {
  margin-right: 0.25rem;
}

.split-panel {
  background-color: var(--bgBold);
  // border: 1.5px solid var(--bgCream3);
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
  margin-right: 0rem;
  border-right: 1px solid #333;
  background-color: var(--bgBrowser);
  color: white;
}

.control-buttons {
  padding: 0.25rem 0.5rem;
  z-index: 250;
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  display: flex;
  flex-direction: column;
  margin: 0 auto auto 0;

  a {
    color: var(--textVeryPale);
    font-size: 0.9rem;
    margin: 2px 0rem 0.1rem -4px;
    padding: 2px 4px 1px 4px;
    border-radius: 10px;
  }

  a:hover {
    color: white;
    background-color: rgb(204, 204, 204);
  }
}

@media only screen and (max-width: 640px) {
}
</style>
