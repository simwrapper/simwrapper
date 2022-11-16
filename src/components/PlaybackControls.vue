<template lang="pug">
.slider-thingy
  b-slider.slider(
    v-model="sliderValue"
    v-bind="sliderOptions"
    size="is-large"
    @dragging="dragging"
    @dragstart="dragStart"
    @dragend="dragEnd")

  .buttons
    .playpause(@click='toggleSimulation')
      i.button-icon.fa.fa-1x.fa-pause(v-if="isRunning")
      i.button-icon.fa.fa-1x.fa-play(v-else)

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import * as timeConvert from 'convert-seconds'

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private isRunning!: boolean

  @Prop({ required: true })
  private timeStart!: number

  @Prop({ required: true })
  private timeEnd!: number

  @Prop({ required: true })
  private currentTime!: number

  private sliderValue = 0

  private sliderOptions = {
    min: 0,
    max: 1000000,
    clickable: false,
    duration: 0,
    lazy: true,
    tooltip: true,
    'tooltip-placement': 'top',
    'custom-formatter': (v: number) => {
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

  private pauseWhileDragging = false

  private dragStart() {
    if (this.isRunning) {
      this.pauseWhileDragging = true
      this.$emit('click')
    }
  }

  private dragEnd() {
    if (this.pauseWhileDragging) this.$emit('click')
    this.pauseWhileDragging = false
  }

  private dragging(value: number) {
    this.$emit('time', this.getSecondsFromSlider(value))
  }

  private onKeyPressed(ev: KeyboardEvent) {
    if (ev.code === 'Space') this.toggleSimulation()
  }

  private getSecondsFromSlider(value: number) {
    let seconds = ((this.timeEnd - this.timeStart) * value) / 1000000.0
    if (seconds === this.timeEnd) seconds = this.timeEnd - 1
    return seconds
  }

  @Watch('currentTime') handleTimeChanged() {
    this.sliderValue =
      (1000000.0 * (this.currentTime - this.timeStart)) / (this.timeEnd - this.timeStart)
  }

  private mounted() {
    window.addEventListener('keyup', this.onKeyPressed)
  }

  private beforeDestroy() {
    window.removeEventListener('keyup', this.onKeyPressed)
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.slider-thingy {
  display: flex;
  flex-direction: row;
  z-index: 1;
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
  .slider-thingy {
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
