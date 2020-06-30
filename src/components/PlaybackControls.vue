<template lang="pug">
#vue-component
  vue-slider.slider(v-model="sliderValue"
    v-bind="sliderOptions"
    @dragging="dragging"
    @drag-start="dragStart"
    @drag-end="dragEnd")

  .buttons
    .playpause(@click='toggleSimulation')
      i.button-icon.fa.fa-1x.fa-pause(v-if="state.isRunning")
      i.button-icon.fa.fa-1x.fa-play(v-else)

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import VueSlider from 'vue-slider-component'
import * as timeConvert from 'convert-seconds'

import store from '@/store'
import EventBus from '@/EventBus.vue'

@Component({ components: { VueSlider }, props: {} })
export default class VueComponent extends Vue {
  private state = store.state

  private sliderValue = 0
  private maxSliderVal = 100000.0

  private sliderOptions = {
    min: 0,
    max: this.maxSliderVal - 1,
    clickable: false,
    dotSize: 20,
    duration: 0,
    lazy: true,
    tooltip: 'active',
    'tooltip-placement': 'top',
    'tooltip-formatter': (v: number) => {
      return this.convertSecondsToClockTimeMinutes(v)
    },
  }

  private toggleSimulation() {
    this.$emit('click')
  }

  private convertSecondsToClockTimeMinutes(index: number) {
    const seconds = this.getSecondsFromSlider(index)

    try {
      const hms = timeConvert(seconds)
      const minutes = ('00' + hms.minutes).slice(-2)
      return `${hms.hours}:${minutes}`
    } catch (e) {
      return '00:00'
    }
  }

  private dragStart() {
    console.log('start')
    EventBus.$emit(EventBus.DRAG, -1)
  }

  private dragEnd() {
    console.log('end')
    EventBus.$emit(EventBus.DRAG, -2)
  }

  private dragging(value: any) {
    EventBus.$emit(EventBus.DRAG, this.getSecondsFromSlider(value))
  }

  private onKeyPressed(ev: KeyboardEvent) {
    if (ev.code === 'Space') this.toggleSimulation()
  }

  private getSecondsFromSlider(oneToTenThousand: number) {
    let seconds = (oneToTenThousand / this.maxSliderVal) * 86400
    if (seconds === 86400) seconds = 86400 - 1
    return seconds
  }

  mounted() {
    const parent = this

    EventBus.$on(EventBus.SIMULATION_PERCENT, function(time: number) {
      parent.sliderValue = Math.floor(parent.maxSliderVal * time)
    })

    window.addEventListener('keyup', this.onKeyPressed)
  }

  beforeDestroy() {
    EventBus.$off(EventBus.SIMULATION_PERCENT)
    window.removeEventListener('keyup', this.onKeyPressed)
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

#vue-component {
  display: flex;
  flex-direction: row;
}

.slider {
  margin: auto 0;
  flex: 1;
  font-weight: bold;
}

.buttons {
  margin: 0 0 0 2rem;
}

.playpause {
  width: 3rem;
  height: 3rem;
  border-radius: 50%;
  color: white;
  background-color: $themeColor;
  display: flex;
  text-align: center;
  // box-shadow: 0px 5px 10px rgba(0, 0, 0, 0.25);
  cursor: pointer;
  pointer-events: auto;
}

.playpause:hover {
  background-color: #39a8f1;
  border: 2px solid white;
}

.button-icon {
  margin: auto auto;
}

@media only screen and (max-width: 640px) {
  #vue-component {
    display: flex;
    flex-direction: row;
  }

  .slider {
    flex: 1;
    margin: auto 0rem;
  }

  .buttons {
    margin: 0.25rem 0 0 2rem;
  }
}
</style>
