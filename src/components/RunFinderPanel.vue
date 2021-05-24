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

  .top-panel
    h3.logo: a(href="/") {{globalState.app }}
    .stuff-in-main-panel
      .more-stuff

        .root-files(v-for="zroot in Object.keys(globalState.runFolders)" :key="zroot")
          h3 {{ zroot }}

          p(v-for="run in globalState.runFolders[zroot]" :key="`${run.root.url}/${run.path}`")
            a(@click="onNavigate(run)") {{ run.path }}
            //- router-link(:to="`${run.root.url}${run.path}`") {{ run.path }}

  .bottom-panel
    h3 Search
    input.input(placeholder="Search text (TBA)")

    .commands
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onScan" title="Sync folders"): i.fa.fa-sync
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onDarkLight" title="Light/Dark"): i.fa.fa-adjust
      button.button(:class="{'is-dark' : state.isDarkMode}" @click="onLanguage" title="EN/DE"): i.fa.fa-globe
      button.button(:class="{'is-dark' : state.isDarkMode}" style="margin-right: 0" @click="onSplit" title="Split view"): i.fa.fa-columns

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
import { SVNProject } from '@/Globals'
import runFinder from '@/util/RunFinder'

interface Run {
  root: SVNProject
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

  private onNavigate(target: any) {
    this.$emit('navigate', {
      component: 'FolderBrowser',
      props: { root: target.root.url, xsubfolder: target.path },
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
  margin: 0 auto;
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
  grid-row: 2 / 3;
  grid-column: 1 / 3;
  // border-top: 1px solid var(--bgCream3);
  padding: 0 1rem 0.5rem 1rem;
}

.gap {
  margin-top: 2rem;
  margin-bottom: 2rem;
}

.banner {
  display: flex;
  flex-direction: column;
  padding: 6rem 3rem 1rem 3rem;
  background-color: #181a1b;
  color: #f54f5f;
  background: url(../assets/images/banner.jpg);
  background-repeat: no-repeat;
  background-size: cover;
}

a {
  font-size: 1.1rem;
  // color: #00499c;
}

.readme {
  margin-top: 1rem;
  margin-bottom: 3rem;
  flex: 1;
  color: var(--text);
}

.more-stuff h1 {
  font-weight: bold;
  font-size: 3rem;
  color: var(--text);
}

.more-stuff h2 {
  margin-top: 1rem;
  font-weight: normal;
  line-height: 2.8rem;
  color: var(--textFancy);
}

.viz-cards {
  padding-bottom: 1rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr));
  gap: 2rem;
}

.one-viz {
  margin-bottom: 1rem;
}

.preamble {
  display: flex;
}

.top {
  margin-top: 1rem;
}

.colophon {
  padding: 2rem 2rem 1rem 5rem;
  text-align: right;
  font-size: 0.85rem;
  background-color: white;
}

.main {
  max-width: 64rem;
}

.main .top a {
  font-size: 0.9rem;
}

.page-area {
  display: flex;
  flex-direction: row-reverse;
}

.headline {
  font-size: 2rem;
  line-height: 2.7rem;
  padding: 1rem 0;
  color: $themeColor;
}

#app .footer {
  color: #222;
  background-color: white;
  text-align: center;
  padding: 2rem 0.5rem 3rem 0.5rem;
}

.footer a {
  color: $matsimBlue;
}

.footer img {
  margin: 1rem auto;
  padding: 0 1rem;
}

.tu-logo {
  margin-top: -4rem;
  text-align: right;
  margin-right: 2rem;
}

.img-logo {
  height: 8rem;
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

  a {
    font-size: 2rem;
    color: white;
  }

  a:hover {
    color: #ff8;
  }
}

@media only screen and (max-width: 640px) {
  .banner {
    padding: 2rem 1rem;
  }

  .content {
    padding: 2rem 1rem 8rem 1rem;
    flex-direction: column-reverse;
  }

  .colophon {
    display: none;
  }

  .headline {
    padding: 0rem 0rem 1rem 0rem;
    font-size: 1.5rem;
    line-height: 1.8rem;
  }

  .tu-logo {
    margin-top: -2rem;
    text-align: right;
    margin-right: 0.5rem;
  }

  .img-logo {
    height: 4rem;
  }
}
</style>
