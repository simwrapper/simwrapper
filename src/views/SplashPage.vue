<template lang="pug">
.splash-page

  .top-area
    .simwrapper-logo
      img(v-if="state.isDarkMode" src="@/assets/simwrapper-logo/SW_logo_yellow.png")
      img(v-else src="@/assets/simwrapper-logo/SW_logo_purple.png")

    h2.splash-readme(style="text-align: center; margin: -0.5rem auto 0 auto" v-html="$t('tagLine')")

    //- h2: b {{ $t('more-info') }}
    //- info-bottom.splash-readme

  .middle-area

    p
      i.fa.fa-arrow-left
      | &nbsp;&nbsp;Browse your files or example data from the left pane.


  .bottom-area
    .legal
      p
        a(href="https://vsp.berlin/en/" target="_blank") VSP&nbsp;Home
        a(href="https://vsp.berlin/impressum/" target="_blank") Impressum
        a(@click="showPrivacy") Privacy

    .bottom-content

      //- .logos
      //-   a(v-for="logo in allLogos"
      //-     :href="logo.url"
      //-     :title="logo.name"
      //-     target="_blank"
      //-   )
      //-     img.img-logo(:src="logo.image")

      //- .words
      //-   p.funding SimWrapper is open source: all code is available on&nbsp;
      //-     a(href="https://github.com/simwrapper/simwrapper") GitHub.
      //-     br
      //-     br
      //-     span Funding sponsored by TU Berlin and the ActivitySim Consortium, including these agencies.


</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      'more-info': 'Documentation:',
      tagLine: 'the simulation browser and data visualizer from TU&nbsp;Berlin.',
      privacy:
        'SimWrapper is a client-side app, which means there is no upstream server collecting or storing data.\n\nSimWrapper does not collect, handle or process any data about you while you use the site. SimWrapper does not contain any tracking devices or analytics software. No user cookies are stored or transmitted.',
    },
    de: {
      'more-info': 'Für weitere Informationen:',
      tagLine: 'Der Modellergebnis-Browser der TU Berlin.',
    },
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import globalStore from '@/store'
import FileSystemProjects from '@/components/FileSystemProjects.vue'
import InfoBottom from '@/assets/info-bottom.md'

const BASE_URL = import.meta.url

@Component({
  i18n,
  components: { FileSystemProjects, InfoBottom },
})
class MyComponent extends Vue {
  private state = globalStore.state

  private logos = [
    { url: 'https://vsp.berlin/en/', image: 'vsp-logo-300dpi.png', name: 'VSP TU-Berlin' },
    { url: 'https://bmbf.de', image: 'bmbf-logo.png', name: 'German Federal BMBF' },
    { url: 'https://tu.berlin', image: 'tu-logo.png', name: 'TU Berlin' },
    { url: 'https://mtc.ca.gov/', image: 'mtc.png', name: 'MTC' },
    { url: 'https://metrocouncil.org/', image: 'metcouncil.png', name: 'Met Council' },
    { url: 'https://www.psrc.org/', image: 'psrc.png', name: 'Puget Sound Regional Council' },
    { url: 'https://www.mwcog.org/', image: 'mwcog.png', name: 'MWCOG' },
    { url: 'https://www.oregon.gov/ODOT', image: 'oregondot.png', name: 'Oregon DOT' },
    { url: 'https://atlantaregional.org/', image: 'arc.png', name: 'ARC' },
    { url: 'https://www.transportation.ohio.gov/', image: 'ohiodot.png', name: 'Ohio DOT' },
    { url: 'http://www.sandag.org/', image: 'sandag.jpg', name: 'SANDAG' },
    { url: 'http://semcog.org/', image: 'semcog.jpg', name: 'SEMCOG' },
    { url: 'https://www.sfcta.org/', image: 'sfcta.png', name: 'SFCTA' },
    { url: 'https://matsim.org/', image: 'matsim-logo-blue.png', name: 'MATSim' },
  ]

  private get allLogos() {
    return this.logos.map(p => {
      return { url: p.url, image: new URL('../assets/images/logos/' + p.image, BASE_URL) }
    })
  }

  private mounted() {
    // set initial breadcrumbs if we don't have any yet
    if (!this.state.breadcrumbs.length) {
      const crumbs = [{ label: 'SimWrapper', url: '/' }]
      globalStore.commit('setBreadCrumbs', crumbs)
    }

    // always start with nav bar when loading splashpage
    globalStore.commit('setShowLeftBar', true)
  }

  private onNavigate(event: any) {
    // pass it on up
    this.$emit('navigate', event)
  }

  private showPrivacy() {
    alert(this.$t('privacy'))
  }
}
export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.splash-page {
  height: 100%;
  overflow-y: auto;
  background-color: var(--bgPanel2);
  // background-image: linear-gradient(#a9accb, #85b5df, #238a8d);
  // background-image: linear-gradient(#238a8d, #33638d, #443c84);
  // background-image: linear-gradient(150deg, #440d54, #238a8d); //  #33638d, #443c84);
  // background-image: linear-gradient(150deg, #23072c, #144e50); //  #33638d, #443c84);
  display: flex;
  flex-direction: column;
  padding: 1rem 1rem;
}

.top-area {
  max-width: 500px;
  margin: auto auto;
  padding: 1.5rem 2rem;
  border: 5px dotted var(--textFancy);
}

.middle-area {
  max-width: 500px;
  margin: 0 auto auto auto;
  padding: 1.5rem 2rem;
  font-size: 1.2rem;
  color: var(--textFancy);
  background-color: var(--bgPanel2);
}

.gap {
  margin-top: 3rem;
  margin-bottom: 2rem;
}

a {
  color: #00499c;
}

.splash-readme {
  // margin-top: 1rem;
  // margin-bottom: 3rem;
  color: var(--textFancy);
}

.simwrapper-logo {
  max-width: 350px;
  margin: 0 auto;
}

.logos {
  display: grid;
  gap: 1.5rem;
  flex: 1;
  grid-template-columns: repeat(auto-fill, 6rem);
  margin: auto auto;
  padding: 1rem 1rem;
  a {
    margin-top: auto;
  }
}

.words {
  width: 14rem;
  line-height: 1.1rem;
  display: flex;
  flex-direction: column;
  margin: auto 0;
  border-left: 1px solid var(--bgBrowser);
  padding-left: 1rem;
}

hr {
  height: 1px;
  background-color: var(--bgBrowser);
  margin: 0.75rem 0;
}

h2.splash-readme {
  padding: 1rem 1rem 0 1rem;
  font-size: 1.5rem;
  font-weight: normal;
  line-height: 1.8rem;
}

.bottom-area {
  // background-color: #fff;
  color: var(--text);
  padding: 1rem 0 0.5rem 0;
  // font-size: 0.9rem;
  // border-top: 1px solid var(--bgBrowser);
}

.bottom-content {
  display: flex;
  padding: 0 1rem;
}

.legal {
  p {
    text-align: center;
    margin: 0.25rem 0 0 0;
  }
  a {
    margin-right: 0.75rem;
    color: var(--text);
  }
  a:hover {
    color: #079f6f;
  }
}

.img-logo {
  margin-bottom: auto;
}

@media only screen and (max-width: 1024px) {
  .logos {
    display: none;
  }
}
</style>
