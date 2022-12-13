<template lang="pug">
.splash-page
  .scrolly
    .thing-area
      .top-area
        .simwrapper-logo
          img(v-if="state.isDarkMode" src="@/assets/simwrapper-logo/SW_logo_yellow.png")
          img(v-else src="@/assets/simwrapper-logo/SW_logo_purple.png")

        //- h2.splash-readme(style="text-align: center; margin: -0.5rem auto 0 auto" v-html="$t('tagLine')")

        //- h2: b {{ $t('more-info') }}
        //- info-bottom.splash-readme

      .middle-area
        .is-chrome(v-if="isChrome")
          h3 Local Folders

          p(v-if="!localFileHandles.length") Chrome &amp; Edge can browse folders directly:

          .roots
            .project-root.local(v-for="row in localFileHandles" :key="row.key"
              @click="clickedBrowseChromeLocalFolder(row)")

              h5.remove-local(style="flex: 1;") {{ row.handle.name}}
                i.fa.fa-times(@click.stop="clickedDelete(row)")
              p Local folder

          p.config-sources: a(@click="showChromeDirectory") Add local folder...

        h3(style="margin-top: 1rem") Data Sources

        .roots
          .project-root(v-for="project in allRoots" :key="project.slug"
            @click="clickedOnFolder({root: project.slug})"
          )
            h5 {{ project.name }}
            p {{ project.description }}

        p.config-sources: a(@click="configureSources") Edit data sources...


        p.funding Funded by TU Berlin, the German Bundesministerium für Bildung und Forschung, and the ActivitySim Consortium member agencies.

        .legal
          p SimWrapper is open source and available on&nbsp;
            a(href="https://github.com/simwrapper/simwrapper") GitHub.

        .legal
          p
              a(href="https://vsp.berlin/en/" target="_blank") VSP&nbsp;TU&nbsp;Berlin
              a(href="https://vsp.berlin/impressum/" target="_blank") Impressum
              a(@click="showPrivacy") Privacy

    .links-and-logos
      .logos
        a(v-for="logo in allLogos"
          :href="logo.url"
          :title="logo.name"
          target="_blank"
        )
          img.img-logo(:src="logo.image")


</template>

<script lang="ts">
// Typescript doesn't know the Chrome File System API
declare const window: any

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

import { defineComponent } from 'vue'
import { get, set, clear } from 'idb-keyval'

import globalStore from '@/store'
import FileSystemProjects from '@/components/FileSystemProjects.vue'
import InfoBottom from '@/assets/info-bottom.md'
import { FileSystemConfig } from '@/Globals'
import fileSystems, { addLocalFilesystem } from '@/fileSystemConfig'

const BASE_URL = import.meta.env.BASE_URL

const logos = [
  { url: 'https://vsp.berlin/en/', image: 'vsp-logo-300dpi.png', name: 'VSP TU-Berlin' },
  { url: 'https://matsim.org/', image: 'matsim-logo-blue.png', name: 'MATSim' },
  { url: 'https://tu.berlin', image: 'tu-logo.png', name: 'TU Berlin' },
  { url: 'https://bmbf.de', image: 'bmbf-logo.png', name: 'German Federal BMBF' },
  { url: 'https://www.sfcta.org/', image: 'sfcta.png', name: 'SFCTA' },
  { url: 'https://metrocouncil.org/', image: 'metcouncil.png', name: 'Met Council' },
  { url: 'http://www.sandag.org/', image: 'sandag.jpg', name: 'SANDAG' },
  { url: 'https://mtc.ca.gov/', image: 'mtc.png', name: 'MTC' },
  { url: 'https://www.psrc.org/', image: 'psrc.png', name: 'Puget Sound Regional Council' },
  { url: 'https://www.mwcog.org/', image: 'mwcog.png', name: 'MWCOG' },
  { url: 'https://www.oregon.gov/ODOT', image: 'oregondot.png', name: 'Oregon DOT' },
  { url: 'https://atlantaregional.org/', image: 'arc.png', name: 'ARC' },
  { url: 'https://www.transportation.ohio.gov/', image: 'ohiodot.png', name: 'Ohio DOT' },
  { url: 'http://semcog.org/', image: 'semcog.jpg', name: 'SEMCOG' },
]

export default defineComponent({
  name: 'SplashPage',
  i18n,
  components: { FileSystemProjects, InfoBottom },
  data: () => {
    return {
      state: globalStore.state,
      allRoots: [] as FileSystemConfig[],
    }
  },
  computed: {
    allLogos(): any[] {
      return logos.map(p => {
        return { url: p.url, image: `${BASE_URL}/images/logos/${p.image}` }
      })
    },

    isChrome() {
      return !!window.showDirectoryPicker
    },

    localFileHandles(): any[] {
      // sort a copy of the array so we don't get an infinite loop
      return this.$store.state.localFileHandles
        .concat()
        .sort((a: any, b: any) =>
          parseInt(a.key.substring(2)) < parseInt(b.key.substring(2)) ? -1 : 1
        )
    },
  },
  methods: {
    onNavigate(event: any) {
      // pass it on up
      this.$emit('navigate', event)
    },

    showPrivacy() {
      alert(this.$t('privacy'))
    },

    updateShortcuts() {
      const roots = this.state.svnProjects.filter(
        source => !source.hidden && !source.slug.startsWith('fs')
      )

      this.allRoots = roots
    },

    configureSources() {
      this.$emit('activate', { name: 'Settings', class: 'SettingsPanel' })
    },

    clickedOnFolder(props: { folder: string; i: number; root: string }) {
      console.log(props)
      const { folder, root, i } = props

      let destination = root
      if (folder) destination += `/${folder}`
      this.$router.push(destination)
    },

    async clickedBrowseChromeLocalFolder(row: { key: string; handle: any }) {
      try {
        const status = await row.handle.requestPermission({ mode: 'read' })
        console.log(row.handle, status)

        if (status !== 'granted') return

        // if first time, add its key to the fileSystemConfig
        const exists = fileSystems.find(f => f.slug == row.key)
        if (!exists) addLocalFilesystem(row.handle, row.key)

        const props = { root: row.key } as any
        this.clickedOnFolder(props)
      } catch (e) {
        console.error('' + e)
      }
    },

    async showChromeDirectory() {
      try {
        const FileSystemDirectoryHandle = window.showDirectoryPicker()
        const dir = await FileSystemDirectoryHandle
        const slug = addLocalFilesystem(dir, null) // no key yet
        this.$router.push(`${BASE_URL}${slug}/`)
      } catch (e) {
        // shrug
      }
    },

    async clickedDelete(row: { key: string; handle: any }) {
      const handles = this.$store.state.localFileHandles
      // just filter out the key I guess?
      const filtered = handles.filter((f: any) => f.key !== row.key)

      // and save it everywhere
      await set('fs', filtered)
      this.$store.commit('setLocalFileSystem', filtered)
    },
  },
  mounted() {
    // set initial breadcrumbs if we don't have any yet
    if (!this.state.breadcrumbs.length) {
      const crumbs = [{ label: 'SimWrapper', url: '/' }]
      globalStore.commit('setBreadCrumbs', crumbs)
    }

    // always start with nav bar when loading splashpage
    globalStore.commit('setShowLeftBar', true)

    this.updateShortcuts()
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.splash-page {
  background-color: var(--bgSplash);
}

.scrolly {
  background-color: white;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  display: grid;
  grid-template-columns: 1fr auto;
  overflow-y: auto;
}

.thing-area {
  background-color: var(--bgSplash);
  flex: 1;
}

.top-area {
  margin: 2rem 3rem;
}

.middle-area {
  padding: 1.5rem 3rem 1rem 3rem;
  font-size: 0.9rem;
  color: var(--textFancy);
}

a {
  color: #00499c;
}

.splash-readme {
  color: var(--textFancy);
}

.simwrapper-logo {
  max-width: 228px;
  margin-left: auto;
}

.logos {
  display: grid;
  gap: 1.5rem;
  flex: 1;
  grid-template-columns: repeat(auto-fill, 6.5rem);
  padding: 1rem 0rem;
  margin: 0 auto;
  a {
    margin-top: auto;
  }
}

.links-and-logos {
  padding: 0.5rem 0;
  width: 9rem;
  display: flex;
  flex-direction: column;
  color: #227;
  background-color: #fff;
}

.words {
  line-height: 1.2rem;
  display: flex;
  flex-direction: column;
  margin: auto 0;
  padding: 0 5rem;
  text-align: center;
  font-size: 1rem;
}

.words a {
  color: var(--link);
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

.funding {
  font-size: 0.9rem;
  margin: 3rem 0 0.5rem 0;
}

.legal {
  // padding: 0rem 2rem 0rem 2rem;
  display: flex;
  p {
    margin: 0rem 0 0 0;
    font-size: 0.9rem;
  }
  a {
    margin-right: 0.75rem;
    color: #119175;
  }
  a:hover {
    color: #3d95d8;
  }
}

.img-logo {
  margin-bottom: auto;
}

.project-root {
  display: flex;
  flex-direction: column;
  margin-top: 0.75rem;
  padding: 0.5rem 0.5rem;
  background-color: var(--bgMapPanel);
  border-left: 3px solid var(--sliderThumb);

  h5 {
    font-size: 1rem;
    line-height: 1rem;
    font-weight: bold;
    margin-bottom: 0.25rem;
  }

  p {
    line-height: 1.1rem;
  }
}

.project-root.local {
  border-left: 3px solid $matsimBlue;
}

.project-root:hover {
  cursor: pointer;
  background-color: var(--bgHover);
  transition: background-color 0.1s ease-in-out;
}

.fa-times {
  opacity: 0;
  float: right;
  padding: 1px 1px;
}

.fa-times:hover {
  color: red;
}

.fa-times:active {
  color: darkred;
}

.project-root:hover .fa-times {
  opacity: 0.15;
}

.project-root:hover .fa-times:hover {
  opacity: 1;
}

.config-sources {
  margin-top: 0.5rem;
  text-align: right;
  a {
    color: var(--text);
  }
}

.config-sources a:hover {
  cursor: pointer;
  color: var(--linkHover);
}

.roots {
  display: grid;
  gap: 0.5rem 1rem;
  grid-template-columns: repeat(auto-fit, minmax(18rem, 1fr));
  list-style: none;
}

@media only screen and (max-width: 800px) {
}
</style>
