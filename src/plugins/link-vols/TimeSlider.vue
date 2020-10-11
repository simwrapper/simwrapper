<template lang="pug">
.time-slider-main-content
  vue-slider.time-slider(v-bind="timeSlider" v-model="sliderValue")
</template>

<script lang="ts">
import * as timeConvert from 'convert-seconds'
import vueSlider from 'vue-slider-component'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

@Component({ components: { 'vue-slider': vueSlider } })
export default class TimeSlider extends Vue {
  private TOTAL_MSG = 'Alle >>'

  @Prop()
  private initialTime!: number

  @Prop()
  private useRange!: false

  @Prop()
  private stops!: any
  private sliderValue: any = this.TOTAL_MSG

  private timeSlider = {
    height: 6,
    piecewise: true,
    show: false,
    'enable-cross': false,
    minRange: 1,
    marks: [
      this.stops[0],
      this.stops[Math.floor(this.stops.length / 2)],
      this.stops[this.stops.length - 1],
    ],
    contained: true,
    sliderStyle: [{ backgroundColor: '#f05b72' }, { backgroundColor: '#3498db' }],
    processStyle: {
      backgroundColor: '#00bb5588',
      borderColor: '#f05b72',
    },
    tooltip: 'always',
    'tooltip-placement': 'bottom',
    data: this.stops,
  }

  private get clockTime() {
    return this.convertSecondsToClockTime(this.sliderValue)
  }

  // VUE LIFECYCLE HOOKS
  public created() {}
  public mounted() {}

  @Watch('initialTime')
  private initialTimeChanged(seconds: number) {
    this.sliderValue = seconds
  }

  @Watch('useRange')
  private changeUseRange(useIt: boolean) {
    if (useIt) {
      this.sliderValue = [this.stops[0], this.stops[this.stops.length - 1]]
    } else {
      this.sliderValue = [this.stops[0]]
    }
    console.log('changed to: ' + this.sliderValue)
  }

  @Watch('stops')
  private setStops(newStops: any) {
    console.log({ newStops })
    this.stops = newStops
  }

  @Watch('sliderValue')
  private sliderChangedEvent(result: any) {
    this.$emit('change', result)
  }

  private dataFunction() {
    return {
      value: this.sliderValue,
      data: this.stops,
    }
  }

  private convertSecondsToClockTimeMinutes(index: number) {
    try {
      const hms = timeConvert(index)
      const minutes = ('00' + hms.minutes).slice(-2)
      return `${hms.hours}:${minutes}`
    } catch (e) {
      return '0:00'
    }
  }

  private convertSecondsToClockTime(index: number) {
    const hms = timeConvert(index)
    const minutes = ('00' + hms.minutes).slice(-2)
    const seconds = ('00' + hms.seconds).slice(-2)
    return `${hms.hours}:${minutes}:${seconds}`
  }
}
</script>

<style scoped>
@import '../../../node_modules/vue-slider-component/theme/default.css';

.time-slider-main-content {
  padding: 0.5rem 0.8rem 2rem 0.5rem;
}

.time-slider {
  margin-left: 0.5rem;
  margin-bottom: 0.2rem;
}
</style>
