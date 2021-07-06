<i18n>
en:
  sync: 'Sync folders'
  theme: 'Light/Dark'
  lang: 'EN/DE'
  split: 'Split view'
de:
  sync: 'Sync'
  theme: 'Hell/Dunkel'
  lang: 'DE/EN'
  split: 'Aufteilen'
</i18n>

<template lang="pug">
.dashboard-home
  h3.logo: a(href="/") {{globalState.app }}

  .top-panel
    .stuff-in-main-panel
      .more-stuff

        //- a(href="/sql") SQL Test 1 - Postgres
        //- a(href="/sqlite") SQL Test 2 - SQLite

        .root-files(v-for="zroot in Object.keys(globalState.runFolders)" :key="zroot")
          h3 {{ zroot }}

          p(v-for="run in filteredRunFolders(zroot)" :key="`${run.root.url}/${run.path}`")
            a(@click="onNavigate(run)") {{ run.path }}
            //- router-link(:to="`${run.root.url}${run.path}`") {{ run.path }}

  .bottom-panel
    //- h3 Search
    //- input.input(placeholder="Search text (TBA)")

    .commands
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onScan" :title="$t('sync')"): i.fa.fa-sync
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onDarkLight" :title="$t('theme')"): i.fa.fa-adjust
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onLanguage" :title="$t('lang')"): i.fa.fa-globe
      button.button(:class="{'is-dark' : state.isDarkMode}" style="margin-right: 0" @click="onSplit" :title="$t('split')"): i.fa.fa-columns

    p(style="margin: 0.25rem 0.25rem 0.25rem 0.5rem") {{ globalState.runFolderCount ? `Folders scanned: ${globalState.runFolderCount}` : '' }}

</template>

<i18n>
en:
  more-info: 'For more information:'
  tagLine: 'the simulation output viewer from TU Berlin'
de:
  more-info: 'Für weitere Informationen:'
  tagLine: 'Der Modellergebnis-Browser der TU Berlin.'
</i18n>

<script lang="ts">
const readme = require('@/assets/info-top.md')
const bottom = require('@/assets/info-bottom.md')

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import Colophon from '@/components/Colophon.vue'
import VizCard from '@/components/VizCard.vue'

import globalStore from '@/store'
import { FileSystemConfig } from '@/Globals'
import runFinder from '@/util/RunFinder'

interface Run {
  root: FileSystemConfig
  // firstFolder: string
  path: string
}

@Component({
  components: { Colophon, VizCard },
})
class MyComponent extends Vue {
  private allRuns: Run[] = []
  private numberOfScannedFolders = 0
  private state = globalStore.state

  private mounted() {
    runFinder.findRuns()
  }

  private filteredRunFolders(zroot: string) {
    const allRuns: any[] = this.globalState.runFolders[zroot]
    const filtered = allRuns.filter(f => {
      const segments = f.path.split('/')
      if (segments.length && segments[segments.length - 1].startsWith('.')) return false
      return true
    })
    return filtered
  }

  private onNavigate(target: any) {
    this.$emit('navigate', {
      component: 'FolderBrowser',
      props: { root: target.root.slug, xsubfolder: target.path },
    })
    console.log(target)
  }

  private onSplit() {
    this.$emit('split')
  }

  private onScan() {
    runFinder.populate()
  }

  private onDarkLight() {
    globalStore.commit('rotateColors')
  }

  private onLanguage() {
    const newLocale = globalStore.state.locale === 'en' ? 'de' : 'en'
    this.$store.commit('setLocale', newLocale)
    this.$root.$i18n.locale = newLocale
  }

  private globalState = globalStore.state
  private readme = readme
  private readmeBottom = bottom
}
export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.dashboard-home {
  display: flex;
  flex-direction: column;
  height: 100%;
}

.top-panel {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
  margin-bottom: 0.5rem;
}

.stuff-in-main-panel {
  padding: 0rem 0rem;
  margin: 0 auto 0 0.5rem;
}

.more-stuff {
  // margin: 0 auto;
  display: flex;
  flex-direction: column;
  inline-size: 13rem;
  text-align: left;
  h1 {
    letter-spacing: -1px;
  }
  h3 {
    margin-top: 2rem;
  }

  p,
  a {
    line-height: 1.1rem;
    margin-top: 0.5rem;
    font-size: 1rem;
    max-width: 100%;
    overflow-wrap: break-word;
  }
}

.bottom-panel {
  padding: 0 1rem 0.25rem 0.5rem;
}

a {
  font-size: 1.1rem;
  // color: #00499c;
}

.top {
  margin-top: 1rem;
}

.main {
  max-width: 64rem;
}

.main .top a {
  font-size: 0.9rem;
}

.commands {
  display: flex;
  flex-direction: row;
  margin-top: 0.5rem;
}

.commands .button {
  flex: 1;
  color: #a19ebb;
  margin-right: 0.25rem;
}

.commands .button:hover {
  color: var(--link);
}

.logo {
  background-color: #60588f;
  color: white;
  padding: 0.5rem 1rem;
  margin-right: auto;
  margin-bottom: auto;

  a {
    font-size: 1.5rem;
    line-height: 1.4rem;
    color: white;
  }

  a:hover {
    color: #ff8;
  }
}

@media only screen and (max-width: 640px) {
  .content {
    padding: 2rem 1rem 8rem 1rem;
    flex-direction: column-reverse;
  }

  .headline {
    padding: 0rem 0rem 1rem 0rem;
    font-size: 1.5rem;
    line-height: 1.8rem;
  }
}
</style>
