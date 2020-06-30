<template lang="pug">
#v3-app
  animation-view.anim(@loaded="toggleLoaded" :speed="speed" :day="newDay" :showSusceptible="showSusceptible")

  modal-markdown-dialog#help-dialog(
    title='COVID-19 virus spreading'
    md='@/assets/animation-helptext.md'
    :buttons="[`Let's go!`]"
    :class="{'is-active': showHelp}"
    @click="clickedCloseHelp()"
  )

  .nav

    p.big.time(v-if="!state.statusMessage") Berlin: Outbreak Day {{ newDay+1 }}
    p.big.day {{ state.statusMessage }}
    p.big.time {{ state.clock }}

  .side-section

    .day-switchers
      .day-button.switchers(:class="{dark: isDarkMode}"
                   @click="dayStep(-1)" title="Previous day")
                   i.fa.fa-1x.fa-arrow-left
      .day-button.switchers(:class="{dark: isDarkMode}"
                   @click="dayStep(1)" title="Next day")
                   i.fa.fa-1x.fa-arrow-right

    .day-button-grid
      .day-button(v-for="day of Array.from(Array(numDays+1).keys()).slice(1)"
                  :style="{borderBottom: newDay == day-1 ? 'none' : '2px solid ' + colorLookup(day-1)}"
                  :class="{currentday: newDay == day-1, dark: isDarkMode}"
                  :key="day" @click="switchDay(day-1)" :title="'Day ' + day") {{ day }}

  .right-side

    .morestuff(v-if="isLoaded")
      vue-slider.speed-slider(v-model="speed"
        :data="speedStops"
        :duration="0"
        :dotSize="20"
        tooltip="active"
        tooltip-placement="bottom"
        :tooltip-formatter="val => val + 'x'"
      )
      p.speed-label(
        :style="{'color': textColor.text}") {{ speed }}x speed

      toggle-button(@change="toggleSusceptible"
                    :value="showSusceptible"
                    :sync="true"
                    :labels="true"
                    color="#4b7cc4"
                    :speed="150")

      p.speed-label(
        :style="{color: textColor.text}") Show susceptible


  playback-controls.playback-stuff(v-if="isLoaded" @click='toggleSimulation')

  .extra-buttons(v-if="isLoaded")
    .help-button(@click='clickedHelp' title="info")
      i.help-button-text.fa.fa-1x.fa-question
    img.theme-button(src="@/assets/images/darkmode.jpg" @click='rotateColors' title="dark/light theme")

  .legend(:class="{dark: isDarkMode}")
    p(:style="{color: isDarkMode ? '#fff' : '#000'}") Legend:
    .legend-items
      p.legend-item(v-for="status in legendBits" :key="status.label" :style="{color: status.color}") {{ status.label }}

</template>

<script lang="ts">
import { Component, Vue, Prop, Watch } from 'vue-property-decorator'
import Papaparse from 'papaparse'
import VueSlider from 'vue-slider-component'
import { ToggleButton } from 'vue-js-toggle-button'

import store from '@/store'
import AnimationView from './AnimationView.vue'
import ModalMarkdownDialog from '@/components/ModalMarkdownDialog.vue'
import PlaybackControls from '@/components/PlaybackControls.vue'
import { ColorScheme, LIGHT_MODE, DARK_MODE } from '@/Globals'
import { Route } from 'vue-router'

@Component({
  components: {
    AnimationView,
    ModalMarkdownDialog,
    PlaybackControls,
    VueSlider,
    ToggleButton,
  },
})
export default class VueComponent extends Vue {
  private numDays = 90

  private newDay: number = 0

  private state = store.state
  private isDarkMode = this.state.colorScheme === ColorScheme.DarkMode
  private isLoaded = false

  private showHelp = false
  private showSusceptible = true

  private totalInfections = require('./totalInfections.csv').default

  private speedStops = [-10, -5, -2, -1, -0.5, -0.25, 0, 0.25, 0.5, 1, 2, 5, 10]
  private speed = 1

  private legendBits: any[] = []

  @Watch('state.colorScheme') private swapTheme() {
    this.isDarkMode = this.state.colorScheme === ColorScheme.DarkMode
    this.updateLegendColors()
    this.setCubeColors()
  }

  private updateLegendColors() {
    const theme = this.state.colorScheme == ColorScheme.LightMode ? LIGHT_MODE : DARK_MODE

    this.legendBits = [
      { label: 'susceptible', color: theme.susceptible },
      { label: 'latently infected', color: theme.infectedButNotContagious },
      { label: 'contagious', color: theme.contagious },
      { label: 'symptomatic', color: theme.symptomatic },
      { label: 'seriously ill', color: theme.seriouslyIll },
      { label: 'critical', color: theme.critical },
      { label: 'recovered', color: theme.recovered },
    ]
  }

  private get textColor() {
    const lightmode = {
      text: '#3498db',
      bg: '#eeeef480',
    }

    const darkmode = {
      text: 'white',
      bg: '#181518aa',
    }

    return this.state.colorScheme === ColorScheme.DarkMode ? darkmode : lightmode
  }

  private setInitialDay() {
    // set specified day, if we got one
    const param = '' + this.$route.query.day
    if (param && parseInt(param) != NaN) {
      const day = parseInt(param)
      if (day >= 1 || day < this.numDays) {
        this.newDay = day - 1 // stupid 0day
        this.$nextTick()
      }
    }
  }

  private toggleSimulation() {
    this.$store.commit('setSimulation', !this.state.isRunning)

    // ok so, many times I mashed the play/pause wondering why things wouldn't
    // start moving. Turns out a 0x speed is not very helpful! Help the user
    // out and switch the speed up if they press play.
    if (this.state.isRunning && this.speed === 0.0) this.speed = 1.0
  }

  private mounted() {
    this.$store.commit('setFullScreen', true)

    this.showHelp = !this.state.sawAgentAnimationHelp
    this.$store.commit('setShowingHelp', this.showHelp)

    // start the sim right away if the dialog isn't showing
    this.$store.commit('setSimulation', !this.showHelp)

    this.setInitialDay()

    // make nice colors
    this.setCubeColors()
    this.updateLegendColors()
  }

  private beforeDestroy() {
    this.$store.commit('setFullScreen', false)
    this.$store.commit('setSimulation', false)
  }

  private dayColors: { [day: number]: string } = {}

  private async setCubeColors() {
    const dailyTotals = Papaparse.parse(this.totalInfections, {
      header: true,
      dynamicTyping: true,
      skipEmptyLines: true,
    }).data

    const careAbout = [
      'nInfectedButNotContagious',
      'nContagious',
      'nShowingSymptoms',
      'nSeriouslySick',
      'nCritical',
      'nRecovered',
    ]

    const theme = this.state.colorScheme == ColorScheme.LightMode ? LIGHT_MODE : DARK_MODE

    // loop for each row in infection summary data
    // -- which doesn't have for day 0! But obviously no one is infected yet
    this.dayColors[0] = theme.infectedButNotContagious

    for (const row of dailyTotals) {
      let count = 0
      let largestCol = 'nix'

      for (const col of careAbout) {
        if (row[col] > count) {
          count = row[col]
          largestCol = col
        }
      }

      const day = row.day

      switch (largestCol) {
        case 'nSusceptible':
          this.dayColors[day] = theme.susceptible
          break
        case 'nInfectedButNotContagious':
          this.dayColors[day] = theme.infectedButNotContagious
          break
        case 'nContagious':
          this.dayColors[day] = theme.contagious
          break
        case 'nShowingSymptoms':
          this.dayColors[day] = theme.symptomatic
          break
        case 'nSeriouslySick':
          this.dayColors[day] = theme.seriouslyIll
          break
        case 'nCritical':
          this.dayColors[day] = theme.critical
          break
        case 'nRecovered':
          this.dayColors[day] = theme.recovered
          break
        default:
          this.dayColors[day] = '#dddddd'
          break
      }
    }
  }

  private colorLookup(day: number): string {
    return this.dayColors[day]
  }

  private clickedHelp() {
    console.log('HEEELP!')
    this.$store.commit('setSimulation', false)
    this.showHelp = true
    this.$store.commit('setShowingHelp', this.showHelp)
  }

  private clickedCloseHelp() {
    this.showHelp = false
    this.$store.commit('setShowingHelp', this.showHelp)
    // only show the help once
    this.$store.commit('setSawAgentAnimationHelp', true)
    this.$store.commit('setSimulation', true)
  }

  private toggleSusceptible() {
    this.showSusceptible = !this.showSusceptible
  }

  private switchDay(day: number) {
    const param = '' + (day + 1)
    this.$router.replace({ query: { day: param } })
    this.$nextTick()

    this.newDay = day
  }

  private dayStep(step: number) {
    let day = this.newDay + step

    // don't be stupid
    if (day < 0) return
    if (day >= this.numDays) return

    this.switchDay(day)
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
@import '~vue-slider-component/theme/default.css';
@import '@/styles.scss';

#v3-app {
  position: absolute;
  top: $navHeight;
  bottom: 0;
  left: 0;
  right: 0;
  pointer-events: none;
  display: grid;
  grid-template-columns: 1fr 6rem;
  grid-template-rows: auto auto 1fr auto;
  grid-template-areas:
    'hd              hd'
    'days     rightside'
    'days             .'
    'days  extrabuttons'
    'playback  playback'
    'legend      legend';
}

#help-dialog {
  padding: 2rem 2rem;
  pointer-events: auto;
  z-index: 20;
}

img.theme-button {
  opacity: 1;
  margin: 1rem 0 0.5rem auto;
  background-color: black;
  border-radius: 50%;
  border: 2px solid #648cb4;
  box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.25);
  width: 3rem;
  height: 3rem;
  cursor: pointer;
  pointer-events: auto;
}

img.theme-button:hover {
  border: 2px solid white;
}

#top-hover-panel img.theme-button:hover {
  cursor: pointer;
  background-color: white;
}

.nav {
  grid-area: hd;
  display: flex;
  flex-direction: row;
  margin: 0 0;
  padding: 0 0.5rem 0 1rem;
  background-color: #228855dd;

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
    color: white;
  }
}

.legend {
  margin-left: 1rem;
  grid-area: legend;
  display: flex;
  flex-direction: row;
  font-weight: bold;
  font-size: 1rem;
  background-color: #ddc;
}

.legend-items {
  flex: 1;
  display: flex;
  flex-direction: row;
  margin-left: 2rem;
  justify-content: space-evenly;
}

.legend-item {
  margin-right: 0.25rem;
}

.legend.dark {
  background-color: #181518;
}

.speed-slider {
  flex: 1;
  width: 100%;
  margin: 0.5rem 0rem 0.25rem 0;
  pointer-events: auto;
  font-weight: bold;
}

.big {
  color: red;
  opacity: 0.85;
  padding: 0rem 0;
  margin-top: 1rem;
  margin-bottom: 0.5rem;
  font-size: 2rem;
  line-height: 3.75rem;
  font-weight: bold;
}

.day {
  flex: 1;
}

.controls {
  display: flex;
  flex-direction: row;
}

.left-side {
  flex: 1;
  background-color: green;
  margin-left: 0.5rem;
  margin-right: auto;
}

.right-side {
  grid-area: rightside;
  font-size: 0.8rem;
  display: flex;
  flex-direction: column;
  margin-right: 1rem;
  text-align: right;
  padding: 0 0;
  color: white;
  pointer-events: auto;
}

.logo {
  flex: 1;
  margin-top: auto;
  margin-left: auto;
  margin-bottom: none;
}

.side-section {
  grid-area: days;
  margin: 0.6rem auto auto 0.5rem;
  padding: 0rem 1rem 0 0.5rem;
}

.day-button-grid {
  margin: 0.5rem auto 0 0;
  margin-right: auto;
  display: flex;
  flex-wrap: wrap;
  padding: 1px 1px;
  width: 4.4rem;
}

.day-button {
  margin: 1px 1px;
  background-color: #eeeeeeee;
  // border: 1px solid white;
  font-size: 0.7rem;
  width: 1.2rem;
  height: 1.2rem;
  text-align: center;
  //padding-top: 2px;
  cursor: pointer;
  pointer-events: auto;
}

.day-button:hover,
.day-button:active {
  background-color: white;
  font-weight: bold;
}

.day-button.dark {
  background-color: #222222ee;
  color: #bbb;
  border: 1px solid black;
}

.day-button.dark:hover,
.day-button.dark:active {
  background-color: black;
  border: 2px solid $themeColor;
  font-weight: bold;
}

.day-button.currentday {
  background-color: $themeColor;
  font-weight: bold;
  color: white;
}

.help-button {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  color: white;
  background-color: $themeColor;
  display: flex;
  text-align: center;
  box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.25);
  margin: 0 0 0 auto;
  cursor: pointer;
  pointer-events: auto;
}

.help-button:hover {
  background-color: #39a8f1;
  border: 2px solid white;
}

.help-button-text {
  margin: auto auto;
}

.playback-stuff {
  grid-area: playback;
  padding: 0rem 1rem 1rem 2rem;
  pointer-events: auto;
}

.extra-buttons {
  margin-left: auto;
  margin-right: 1rem;
  grid-area: extrabuttons;
}

.anim {
  grid-column: 1 / 3;
  grid-row: 1 / 7;
  pointer-events: auto;
}

.label {
  margin-right: 1rem;
  color: white;
  text-align: left;
  line-height: 1.1rem;
  width: min-content;
}

.speed-label {
  font-weight: bold;
  margin-bottom: 1rem;
  margin-top: 0.25rem;
}

.day-switchers {
  display: flex;
  flex-direction: row;
}

.switchers {
  margin-right: 0.3rem;
  width: 1.8rem;
  height: 1.8rem;
  padding-top: 0.2rem;
  font-size: 1rem;
}

@media only screen and (max-width: 640px) {
  .nav {
    padding: 0rem 0.5rem;
  }

  .right-side {
    margin-right: 1rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }

  .legend {
    margin-left: 0.5rem;
    display: flex;
    flex-direction: row;
    font-size: 0.7rem;
  }

  .legend-items {
    flex: 1;
    margin-left: 2rem;
    display: grid;
    grid-auto-flow: row;
    grid-template-columns: repeat(4, auto);
    font-size: 0.7rem;
  }

  .side-section {
    margin-left: 0;
  }

  .extra-buttons {
    margin-right: 1rem;
  }
  .playback-stuff {
    padding-right: 1rem;
  }

  .day-button {
    color: transparent;
    background-color: #eeeeeedd;
    font-size: 0.7rem;
    width: 1rem;
    height: 0.5rem;
    text-align: center;
    //padding-top: 2px;
    cursor: pointer;
    pointer-events: auto;
  }

  .day-button.dark {
    color: transparent;
    background-color: #222222cc;
    border: 1px solid black;
  }

  .day-button.currentday {
    color: transparent;
    background-color: white;
  }

  .switchers {
    width: 1.5rem;
    height: 1.5rem;
    color: black;
  }
  .switchers.dark {
    color: white;
    background-color: #223;
  }
}
</style>
