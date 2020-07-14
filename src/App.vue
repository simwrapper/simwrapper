<template lang="pug">
#app(:class=" {'full-page-app' : state.isFullScreen}" )
  #nav
    top-nav-bar#nav(v-if="!state.isFullScreen" :style="{paddingLeft: state.isFullScreen ? '0rem':''}" )

    .breadcrumbs-bar(v-if="state.breadcrumbs.length > 0"
                     :style="{paddingLeft: state.isFullScreen ? '0.75rem':''}")
      nav.breadcrumb(aria-label="breadcrumbs")
        ul
          li(v-for="crumb in state.breadcrumbs" :key="crumb.label + crumb.url"
            @click="clickedLink(crumb.url)")
              p {{ crumb.label }}

  .center-area.nav-padding
    login-panel
    router-view.main-content

  .footer(v-if="!state.isFullScreen")
    p AVÖV Projekt Webseite, &copy; 2020 VSP TU-Berlin.
    p Mehr Info über VSP:
      a(href="https://www.vsp.tu-berlin.de") &nbsp;https://vsp.tu-berlin.de
    p GDPR: keine persönlichen Informationen gesammelt oder übertragen.
</template>

<script lang="ts">
import mapboxgl from 'mapbox-gl'
import Buefy from 'buefy'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import store from '@/store'

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
  private state = store.state

  private clickedLink(path: string) {
    this.$router.push({ path })
  }

  @Watch('state.isFullScreen') toggleFullScreen(isFullPage: boolean) {
    console.log('~~SWITCHING FULL PAGE: ', isFullPage)

    if (isFullPage) {
      document.body.classList.add('full-screen-page')
    } else {
      document.body.classList.remove('full-screen-page')
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
  margin: 0px 0px;
  padding: 0px 0px;
  // overflow-y: auto;
  height: 100%;
  overscroll-behavior: contain;
}

canvas {
  display: block;
}

html {
  background-color: #505050;
}

.breadcrumbs-bar {
  background-color: #626577;
  padding: 0.5rem 3rem;
}

.breadcrumb {
  font-size: 0.85rem;
  font-weight: bold;
  margin-left: -0.5rem;
}

.breadcrumb p {
  color: #e0e0e0;
  cursor: pointer;
  margin: 0 0.5rem;
}

.breadcrumb p:hover {
  color: yellow;
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

#app {
  background-color: white;
  display: grid;
  grid-template-columns: 1fr;
  grid-template-rows: auto 1fr auto;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  margin: 0px 0px 0px 0px;
  padding: 0px 0px 0px 0px;
  font-family: Roboto, Avenir, Helvetica, Arial, sans-serif;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  background-color: $paleBackground;
}

.full-page-app {
  height: 100%;
}

.modebar-group {
  top: -1.2rem;
  right: -1rem;
}

#nav {
  grid-column: 1 / 2;
  grid-row: 1 / 2;
  width: 100%;
  z-index: 10000;
  box-shadow: 0 4px 8px 0 rgba(0, 0, 0, 0.2), 0 6px 20px 0 rgba(0, 0, 0, 0.1);
}

.main-content {
  flex: 1;
}

#nav a.router-link-exact-active {
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
  margin: 2rem 0 0 0;
  padding: 1rem 1rem;
  color: #ccc;

  background-color: $colorBoldBackground;
}

.footer a {
  color: $matsimBlue;
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
