<template lang="pug">
.splash-page

    .content
      .main

        .simwrapper-logo
          img(v-if="state.isDarkMode" src="@/assets/simwrapper-logo/SW_logo_yellow.png")
          img(v-else src="@/assets/simwrapper-logo/SW_logo_yellow.png")

        h2.splash-readme(style="text-align: center; margin: -0.5rem auto 0 auto" v-html="$t('tagLine')")

        hr
        h2: b Explore model results:
        file-system-projects.gap(@navigate="onNavigate")
        hr

        .is-chrome(v-if="isChrome")
          h2: b Browse local files (Chrome/Edge only):

          .localRow(v-for="row in localRows" @click="clickedLocalRow(row)")
            p(style="flex: 1;") Local folder {{ row.key.substring(2) }}: {{ row.handle.name}}
            i.fa.fa-times(@click.stop="clickedDelete(row)")

          button.button.add-folder(@click="showChromeDirectory") Browse folder...
          hr

        h2: b {{ $t('more-info') }}
        info-bottom.splash-readme

        .tu-logo
          a(href="https://vsp.berlin/en/")
            img.img-logo(src="@/assets/images/vsp-logo-300dpi.png")
          a(href="https://tu.berlin")
            img.img-logo(src="@/assets/images/tu-logo.png")

      .right


</template>

<script lang="ts">
// Typescript doesn't know the Chrome File System API
declare const window: any

const BASE_URL = import.meta.env.BASE_URL

const i18n = {
  messages: {
    en: {
      'more-info': 'Documentation:',
      tagLine: 'the simulation browser and data visualizer from TU&nbsp;Berlin.',
    },
    de: {
      'more-info': 'Für weitere Informationen:',
      tagLine: 'Der Modellergebnis-Browser der TU Berlin.',
    },
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'
import { get, set, clear } from 'idb-keyval'

import globalStore from '@/store'
import FileSystemProjects from '@/components/FileSystemProjects.vue'
import InfoBottom from '@/assets/info-bottom.md'
import fileSystems, { addLocalFilesystem } from '@/fileSystemConfig'

@Component({
  i18n,
  components: { FileSystemProjects, InfoBottom },
})
class MyComponent extends Vue {
  private state = globalStore.state

  private mounted() {
    const crumbs = [
      {
        label: 'SimWrapper',
        url: '/',
      },
    ]

    // save them!
    globalStore.commit('setBreadCrumbs', crumbs)

    // always start with nav bar when loading splashpage
    globalStore.commit('setShowLeftBar', true)
  }

  private async clickedLocalRow(row: { key: string; handle: any }) {
    try {
      const status = await row.handle.requestPermission({ mode: 'read' })
      console.log(row.handle, status)

      // if first time, add its key to the fileSystemConfig
      const exists = fileSystems.find(f => f.slug == row.key)
      if (!exists) addLocalFilesystem(row.handle, row.key)

      this.$router.push(`${BASE_URL}${row.key}/`)
    } catch (e) {
      console.error('' + e)
    }
  }

  private async clickedDelete(row: { key: string; handle: any }) {
    const handles = this.$store.state.localFileHandles
    // just filter out the key I guess?
    const filtered = handles.filter((f: any) => f.key !== row.key)

    // and save it everywhere
    await set('fs', filtered)
    this.$store.commit('setLocalFileSystem', filtered)
  }

  private onNavigate(event: any) {
    // pass it on up
    this.$emit('navigate', event)
  }

  private get localRows() {
    return this.$store.state.localFileHandles.sort((a: any, b: any) =>
      parseInt(a.key.substring(2)) < parseInt(b.key.substring(2)) ? -1 : 1
    )
  }

  // Only Chrome supports the File System Access API
  private get isChrome() {
    return !!window.showDirectoryPicker
  }

  private async showChromeDirectory() {
    try {
      const FileSystemDirectoryHandle = window.showDirectoryPicker()
      const dir = await FileSystemDirectoryHandle
      const slug = addLocalFilesystem(dir, null) // no key yet
      this.$router.push(`${BASE_URL}${slug}/`)
    } catch (e) {
      // shrug
    }
  }
}
export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.splash-page {
  height: 100%;
  overflow-y: auto;
  // background-color: var(--bgDashboard);
  background-image: linear-gradient(#443c84, #33638d, #238a8d);
  background-image: linear-gradient(#238a8d, #33638d, #443c84);
  background-image: linear-gradient(150deg, #440d54, #238a8d); //  #33638d, #443c84);
  background-image: linear-gradient(150deg, #23072c, #144e50); //  #33638d, #443c84);
  background-image: var(--bgSplash);
}

.gap {
  margin-top: 3rem;
  margin-bottom: 2rem;
}

.content {
  flex: 1;
  padding: 1rem 1rem 5rem 3rem;
  display: flex;
  max-width: 64rem;
  margin: 0 auto;
}

a {
  font-size: 1.1rem;
  color: #00499c;
}

.splash-readme {
  margin-top: 1rem;
  margin-bottom: 3rem;
  flex: 1;
  color: white;

  // color: var(--text);
}

.simwrapper-logo {
  width: 400px;
  margin: 0 auto 1rem auto;
}

.simwrapper-logo img {
  width: 100%;
}

.main {
  margin-top: 2rem;
  max-width: 64rem;

  h1 {
    margin-top: 2rem;
    font-weight: bold;
    font-size: 3rem;
    color: var(--text);
  }

  h2 {
    margin-top: 1rem;
    font-weight: normal;
  }

  h2,
  h3 {
    color: white;
  }
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
  margin-right: 2rem;
  h1 {
    letter-spacing: -1px;
  }
}

.main .top a {
  font-size: 0.9rem;
}

.page-area {
  display: flex;
  flex-direction: row;
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
  text-align: right;
  margin-top: 0rem;
}

.img-logo {
  margin-left: 4rem;
  width: 7rem;
  margin-bottom: 4rem;
}

.right {
  margin-top: 1rem;
}

hr {
  height: 1px;
  background-color: #53ade1; // 8d4eeb
  margin: 4rem 0 -0.5rem 0;
}

.localRow {
  color: var(--link);
  font-size: 1.1rem;
  padding: 0.1rem 0.25rem;
  margin-bottom: 0.25rem;
  border-radius: 5px;
  display: flex;
  flex-direction: row;

  p {
    margin-bottom: 0;
  }
}

.localRow:hover {
  cursor: pointer;
  color: white;
  background-color: #ffffff30;
}

.add-folder {
  margin-top: 1rem;
}

.fa-times {
  margin: auto 0.5rem;
}

.fa-times:hover {
  color: red;
}

@media only screen and (max-width: 640px) {
  .content {
    padding: 2rem 1rem 8rem 1rem;
    flex-direction: column;
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
