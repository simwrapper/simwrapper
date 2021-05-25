<template lang="pug">
#main-app(:class="{'full-page-app' : true, 'dark-mode': isDarkMode}" )

  //- .app-nav
  //-   .top-bar.full-page-app
  //-     nav.top-link
  //-       router-link(to="/"): p {{ state.app }}

  //-       //- router-link(:to="`/${link.url}`" v-for="link in topNavLinks" :key="`/${link.url}`"
  //-       //-   :class="{'selected': ($route.path==='/' && link.url==='/') || $route.path.indexOf(link.url) > 0 }" )
  //-       //-     p {{ link.name }}

  //-       .right-side
  //-         //- .top-action-button()
  //-         //-   i.fa.fa-1x.fa-share
  //-         //-   br
  //-         //-   span {{ $t('share') }}

  //-         .top-action-button(@click="toggleLocale")
  //-           i.fa.fa-1x.fa-globe
  //-           br
  //-           span {{ state.locale }}

  //-         .top-action-button(@click="toggleTheme")
  //-           i.fa.fa-1x.fa-adjust
  //-           br
  //-           span {{ $t(state.colorScheme) }}

  .center-area
    login-panel.login-panel
    router-view.main-content

  .message-zone(v-if="state.statusErrors.length")
    .message-error(v-for="err,i in state.statusErrors")
      p: i.fa.fa-icon.fa-exclamation-triangle(style="color: orange;")
      p(v-html="err")
    button.button.is-small(@click="removeAllErrors()") CLEAR

</template>

<i18n>
en:
  light: 'light'
  dark: 'dark'
  share: 'share'
de:
  light: 'hell'
  dark: 'dark'
  share: 'freigeben'
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

    document.body.style.backgroundColor = theme === ColorScheme.LightMode ? '#edebe4' : '#2d3133'

    this.toggleFullScreen(true)
  }

  private get topNavLinks() {
    // {name, description, need_password, svn, thumbnail, url }
    // a '/' will be prepended
    const home: any[] = [{ name: 'scout', url: '' }]
    const topLinks = home.concat(this.state.svnProjects)

    return topLinks
  }

  private removeAllErrors() {
    this.$store.commit('clearAllErrors')
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
  font-family: $mainFont;
  margin: 0px 0px;
  padding: 0px 0px;
  height: 100%;
  overscroll-behavior: contain;
}

h1,
h2,
h3,
h4,
h5,
h6 {
  font-family: $mainFont;
}

html {
  overflow-y: auto;
  color: var(--text);
}

:root {
  font-size: 14px;
}

canvas {
  display: block;
}

.top-bar {
  width: 100%;
  padding: 0 3rem;
  margin: 0 auto;
  max-width: $sizeVessel;
  transition: padding 0.2s ease-in-out, max-width 0.3s ease-in-out;
  // box-shadow: 0px 6px 10px #00000048;
  z-index: 5;
}

.top-bar.full-page-app {
  padding: 0 1rem;
  max-width: unset;
}

.breadcrumb-container {
  background-color: #3e455c;
  width: 100%;
  padding: 0.25rem 0;
}

.breadcrumb {
  font-size: 0.9rem;
  padding: 0 3rem;
  margin: 0 auto;
  max-width: $sizeVessel;
  transition: padding 0.2s ease-in-out;

  ul {
    max-width: $sizeVessel;
    display: flex;
    flex-direction: row;
  }

  a {
    color: #ccc;
    padding: 0 1rem;
  }

  a:hover {
    cursor: pointer;
    color: white;
  }

  a.no-breadcrumb-link {
    cursor: default;
    color: #ccc;
  }
}

.top-link {
  font-size: 0.9rem;
  font-weight: bold;
  margin-left: -0.75rem;
  display: flex;
  flex-direction: row;
}

.top-link p {
  cursor: pointer;
  padding: 1rem 0.75rem;
}

.selected p {
  background-color: #3e455c;
}

.bury-me {
  z-index: -5;
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
  background-color: var(--bgCream);
  grid-template-columns: 1fr;
  grid-template-rows: auto auto 1fr;
  margin: 0 0;
  padding: 0 0;
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

.login-panel {
  z-index: 500;
}

.app-nav {
  padding: 0 1rem;
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  z-index: 5;
  display: flex;
  flex-direction: column;
  // border-bottom: 1px solid var(--bgCream3);
}

.app-nav a.router-link-exact-active {
  font-weight: bold;
  // color: #00ffff;
}

.main-content {
  flex: 1;
}

.space {
  margin: 0 1rem;
}

.vue-slider-rail {
  background-color: green;
}

.center-area {
  grid-column: 1 / 2;
  grid-row: 2 / 4;
  z-index: 0;
  display: flex;
  flex-direction: row;
  position: relative;
}

.nav-sidebar {
  z-index: 0;
}

.footer {
  margin-top: 2rem;
  grid-column: 1 / 2;
  grid-row: 3 / 4;
  text-align: center;
  font-size: 0.8rem;
  padding: 5rem 1rem;
}

#main-app .footer {
  color: var(--text);
  background-color: $steelGray; // #18181b;
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

.footer p {
  color: #eee;
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

.right-side {
  display: flex;
  flex-direction: row;
  margin-left: auto;
}

.top-action-button {
  -moz-user-select: none;
  -webkit-user-select: none;
  user-select: none;
  font-size: 0.65rem;
  margin: auto 0 auto 1.5rem;
  padding: 2px 0px;
  width: 1.5rem;
  text-align: center;
  // color: var(--bgLink);
}

.top-action-button:hover {
  cursor: pointer;
  // background-color: #222255;
  color: var(--linkHover);
}

.top-action-button:active {
  border: 1px solid #aaa;
  transform: translateY(1px);
}

.message-zone {
  position: sticky;
  bottom: 0px;
  z-index: 5;
  grid-column: 1 / 2;
  grid-row: 1 / 4;
  box-shadow: 0px 2px 10px #22222266;
  display: flex;
  flex-direction: column;
  margin: auto auto 0 0;
  background-color: var(--bgPanel);
  border-top: 2px solid #ba2b00;
  border-right: 2px solid #ba2b00;
}

.message-error {
  padding: 0.5rem 0.5rem;
  background-color: #fff6c3;
  display: flex;
  flex-direction: row;
  line-height: 1.2rem;

  p {
    margin: auto 0.5rem auto 0;
    font-weight: normal;
    padding: 0 0;
    color: black;
  }
  button {
    margin: auto 0;
  }
}

a.mapboxgl-ctrl-logo {
  filter: opacity(70%);
  margin-left: -0.5rem;
}

.mapboxgl-ctrl-bottom-right {
  filter: opacity(70%);
  right: unset;
  left: 7rem;
  bottom: 0.5rem;
}

.mapboxgl-popup-content {
  background-color: var(--bgCream4);
}

.mapboxgl-popup-anchor-top .mapboxgl-popup-tip,
.mapboxgl-popup-anchor-top-left .mapboxgl-popup-tip,
.mapboxgl-popup-anchor-top-right .mapboxgl-popup-tip {
  border-bottom-color: var(--bgCream4);
}
.mapboxgl-popup-anchor-bottom .mapboxgl-popup-tip,
.mapboxgl-popup-anchor-bottom-left .mapboxgl-popup-tip,
.mapboxgl-popup-anchor-bottom-right .mapboxgl-popup-tip {
  border-top-color: var(--bgCream4);
}
.mapboxgl-popup-anchor-left .mapboxgl-popup-tip {
  border-right-color: var(--bgCream4);
}
.mapboxgl-popup-anchor-right .mapboxgl-popup-tip {
  border-left-color: var(--bgCream4);
}

// SCROLLBARS
/* width */
::-webkit-scrollbar {
  width: 12px;
}

/* Track */
::-webkit-scrollbar-track {
  background: #00000000;
}

/* Handle */
::-webkit-scrollbar-thumb {
  background: #88888844;
}

/* Handle on hover */
::-webkit-scrollbar-thumb:hover {
  background: #88888888;
}

@media only screen and (max-width: 640px) {
  .top-bar {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .breadcrumbs {
    padding-left: 1rem;
    padding-right: 1rem;
  }

  .footer {
    font-size: 0.7rem;
  }
}
</style>
