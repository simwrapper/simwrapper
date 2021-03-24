<template lang="pug">
#main-app(:class="{'full-page-app' : state.isFullScreen, 'dark-mode': isDarkMode}" )

  #nav
    .breadcrumbs-bar(v-if="state.breadcrumbs.length > 0"
                     :style="{paddingLeft: state.isFullScreen ? '0.75rem':''}")
      nav.breadcrumb(aria-label="breadcrumbs")
        ul
          li(v-for="crumb,i in state.breadcrumbs" :key="crumb.label + crumb.url"
            @click="clickedLink(crumb.url)"
            @click.middle="openNewTab(crumb.url)"
            @click.ctrl="openNewTab(crumb.url)"
            @click.meta="openNewTab(crumb.url)"
            )
              p {{ i === 0 ? 'aftersim' : crumb.label }}

    .locale(@click="toggleTheme")
      i.fa.fa-1x.fa-adjust
      br
      span {{ $t(state.colorScheme) }}

    .locale(@click="toggleLocale")
      i.fa.fa-1x.fa-globe
      br
      span {{ state.locale }}

  .center-area.nav-padding
    login-panel.login-panel
    router-view.main-content

  .footer(v-if="!state.isFullScreen")
    //- colophon.colophon
    a(href="https://vsp.tu-berlin.de")
      img(alt="TU-Berlin logo" src="@/assets/images/vsp-logo.png" width=225)
    a(href="https://matsim.org")
      img(alt="MATSim logo" src="@/assets/images/matsim-logo-blue.png" width=250)

    p aftersim &copy; 2020 VSP TU-Berlin.
    p More info about VSP:
      a(href="https://www.vsp.tu-berlin.de") &nbsp;https://vsp.tu-berlin.de
    p EU GDPR: No personal information collected or transmitted.
</template>

<i18n>
en:
  light: 'light'
  dark: 'dark'
de:
  light: 'hell'
  dark: 'dark'
</i18n>

<script lang="ts">
import mapboxgl from 'mapbox-gl'
import Buefy from 'buefy'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import globalStore from '@/store'

import { ColorScheme } from '@/Globals'
import Colophon from '@/components/Colophon.vue'
import LoginPanel from '@/components/LoginPanel.vue'
import SideNavBar from '@/components/SideNavBar.vue'
import TopNavBar from '@/components/TopNavBar.vue'

// MAPBOX TOKEN
// this is a required workaround to get the mapbox token assigned in TypeScript
// see https://stackoverflow.com/questions/44332290/mapbox-gl-typing-wont-allow-accesstoken-assignment
const writableMapBox: any = mapboxgl
writableMapBox.accessToken =
  'pk.eyJ1IjoidnNwLXR1LWJlcmxpbiIsImEiOiJjamNpemh1bmEzNmF0MndudHI5aGFmeXpoIn0.u9f04rjFo7ZbWiSceTTXyA'

@Component({ components: { TopNavBar, SideNavBar, LoginPanel, Colophon } })
class App extends Vue {
  private state = globalStore.state

  private clickedLink(path: string) {
    this.$router.push({ path })
  }

  private mounted() {
    // theme
    const theme = localStorage.getItem('colorscheme')
      ? localStorage.getItem('colorscheme')
      : (window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)')).matches
      ? ColorScheme.DarkMode
      : ColorScheme.LightMode

    if (theme === ColorScheme.LightMode) this.$store.commit('rotateColors')

    // locale: we only support EN and DE
    const locale = localStorage.getItem('locale')
      ? '' + localStorage.getItem('locale')
      : // @ts-ignore
      (navigator.language || navigator.userLanguage).startsWith('de')
      ? 'de'
      : 'en'

    this.$store.commit('setLocale', locale)
  }

  private toggleLocale() {
    const newLocale = this.state.locale === 'en' ? 'de' : 'en'
    this.$store.commit('setLocale', newLocale)
    this.$root.$i18n.locale = newLocale
  }

  private toggleTheme() {
    this.$store.commit('rotateColors')
  }

  private get isDarkMode() {
    return this.state.colorScheme == ColorScheme.DarkMode
  }

  @Watch('state.isFullScreen') toggleFullScreen(isFullPage: boolean) {
    if (isFullPage) {
      document.body.classList.add('full-screen-page')
      document.documentElement.style.overflowY = 'auto'
    } else {
      document.body.classList.remove('full-screen-page')
      document.documentElement.style.overflowY = null as any
    }
  }
}
export default App
</script>

<style lang="scss">
@import '@/styles.scss';
@import '~buefy/dist/buefy.css';
@import '~mapbox-gl/dist/mapbox-gl.css';

html {
  box-sizing: border-box;
}

*,
*::before,
*::after {
  box-sizing: inherit;
}

body,
html {
  // font-size: 16px;
  margin: 0px 0px;
  padding: 0px 0px;
  height: 100%;
  overscroll-behavior: contain;
}

html {
  overflow-y: auto;
  color: var(--text);
  background-color: $steelGray;
}

canvas {
  display: block;
}

.breadcrumbs-bar {
  flex: 1;
  padding: 0.7rem 3rem;
  transition: padding 0.2s ease-in-out;
}

.breadcrumb {
  font-size: 0.9rem;
  font-weight: bold;
  margin-left: -0.5rem;
}

.breadcrumb p {
  color: #e0e0e0;
  cursor: pointer;
  margin: 0 0.5rem;
}

.breadcrumb p:hover {
  color: #a8ffc8;
}

.bury-me {
  z-index: -5;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: 'Roboto', Avenir, Helvetica, Arial, sans-serif;
}

h2 {
  font-size: 2.5rem;
  font-weight: bold;
}

h3 {
  font-size: 1.5rem;
  font-weight: bold;
}

#main-app {
  display: grid;
  color: var(--text);
  background-color: var(--bg);
  font-family: Roboto, Avenir, Helvetica, Arial, sans-serif;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr auto;
  margin: 0px 0px 0px 0px;
  padding: 0px 0px 0px 0px;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

a {
  color: var(--link);
}
a:hover {
  color: var(--linkHover);
}

.full-page-app {
  height: 100%;
}

.modebar-group {
  top: -1.2rem;
  right: -1rem;
}

.login-panel {
  z-index: 12000;
}

#nav {
  background-color: $steelGray;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  width: 100%;
  z-index: 10000;
  display: flex;
  flex-direction: row;
}

.main-content {
  flex: 1;
}

#nav a.router-link-exact-active {
  font-weight: bold;
  color: #ffffff;
}

.space {
  margin: 0 1rem;
}

.vue-slider-rail {
  background-color: green;
}

.center-area {
  grid-column: 1 / 2;
  grid-row: 2 / 3;
  z-index: 1;
  display: flex;
  flex-direction: row;
}

.nav-sidebar {
  z-index: 0;
}

.footer {
  grid-column: 1 / 2;
  grid-row: 3 / 4;
  text-align: center;
  font-size: 0.8rem;
  margin: 0 0 0 0;
  padding: 5rem 1rem;
  color: #ccc;
}

#main-app .footer {
  color: var(--text);
  background-color: var(--bgBold);
  text-align: center;
  padding: 2rem 0.5rem 3rem 0.5rem;
  // background-color: #648cb4;
}

.footer a {
  color: $matsimBlue;
}

.footer img {
  margin: 1rem auto;
  padding: 0 1rem;
}

.medium-zoom-overlay {
  z-index: 100;
}

.medium-zoom-overlay ~ img {
  z-index: 101;
}

.markdown {
  p {
    margin-top: 0.5rem;
  }
  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-weight: normal;
  }

  ul {
    list-style: disc;
    margin-top: 0.5rem;
    padding-left: 1.5rem;
  }
}

.mapboxgl-popup-content {
  width: min-content !important;
}

.locale {
  -moz-user-select: none;
  -webkit-user-select: none;
  font-size: 0.7rem;
  background-color: $steelGray;
  color: #ccc;
  margin: auto 0;
  padding: 2px 0px;
  width: 1.5rem;
  text-align: center;
  margin-right: 0.75rem;
}

.locale:hover {
  cursor: pointer;
  background-color: #222255;
  color: #ffe;
}

.locale:active {
  border: 1px solid #aaa;
  transform: translateY(1px);
}

@media only screen and (max-width: 640px) {
  .breadcrumbs-bar {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .footer {
    font-size: 0.7rem;
  }
}
</style>
