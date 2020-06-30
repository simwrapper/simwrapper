<template lang="pug">
#v3-app
  animation-view(@loaded="toggleLoaded")

  #nav
    p: router-link(to=".") Infection Traces Example
    p &bullet;
    p.my-center {{ state.message }} {{ state.clock }}

    button.button.is-white.is-outlined.is-small(
      v-if="isLoaded"
      @click='toggleSimulation') {{ state.isRunning ? 'Pause' : 'Start'}}

  #hover-panel(v-if="isLoaded")
    .left-side
      img(src="@/assets/images/darkmode.jpg" width=40 @click='rotateColors')

    .right-side

</template>

<script lang="ts">
import { Component, Vue } from 'vue-property-decorator'

import store from '@/store'
import AnimationView from '@/runs/v3/AnimationView.vue'

@Component({
  components: {
    AnimationView,
  },
})
export default class App extends Vue {
  private state = store.state
  private isLoaded = false

  private toggleSimulation() {
    console.log('halt!')
    this.$store.commit('setSimulation', !store.state.isRunning)
  }

  private mounted() {
    this.$store.commit('setFullScreen', true)
    this.$store.commit('setSimulation', true)
  }
  private beforeDestroy() {
    this.$store.commit('setFullScreen', false)
    this.$store.commit('setSimulation', true)
  }

  private toggleLoaded(loaded: boolean) {
    this.isLoaded = loaded
  }

  private rotateColors() {
    this.$store.commit('rotateColors')
  }
}
</script>

<style scoped lang="scss">
$navHeight: 2.5rem;

#v3-app {
  position: absolute;
  top: $navHeight;
  bottom: 0.2rem;
  width: 100%;
  display: grid;
  grid-template-rows: $navHeight 1fr auto;
  grid-template-columns: 1fr;
}

#three-container {
  grid-row: 2 / 3;
  grid-column: 1 / 2;
}

#hover-panel {
  z-index: 5;
  display: flex;
  flex-direction: row;
  padding: 0 0.5rem 0.2rem 0;
  grid-row: 3 / 4;
  grid-column: 1 / 2;
}

#hover-panel img {
  opacity: 1;
  padding: 0.1rem 0.1rem;
  background-color: black;
}

#hover-panel img:hover {
  cursor: pointer;
  background-color: white;
}

#nav {
  display: flex;
  flex-direction: row;
  background-color: #1e5538; /* #648cb4; */
  grid-row: 1 / 2;
  grid-column: 1 / 2;
  margin: 0 0;
  padding: 0 1rem 0 3rem;

  a {
    font-weight: bold;
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    margin: auto 0.5rem auto 0;
    padding: 0 0;
    color: #ccc;
  }
}

#nav button {
  margin: auto 0;
}

.my-center {
  flex: 1;
  margin: 0 auto;
}

.left-side {
  margin-left: 0.5rem;
  margin-right: auto;
}

#rview {
  grid-row: 2 / 3;
  grid-column: 1 / 2;
}
@media only screen and (max-width: 768px) {
  #nav {
    padding-left: 1rem;
  }
}
</style>
