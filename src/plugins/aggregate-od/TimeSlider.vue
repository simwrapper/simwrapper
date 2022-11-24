<template lang="pug">
.time-slider-main-content
  vue-slider.time-slider(v-bind="timeSlider" v-model="sliderValue")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import * as timeConvert from 'convert-seconds'
import vueSlider from 'vue-slider-component'

export default defineComponent({
  name: 'TimeSliderX',
  components: { 'vue-slider': vueSlider },
  props: {
    initialTime: Number,
    useRange: Boolean,
    stops: { type: Array, required: true },
  },
  data: () => {
    const TOTAL_MSG = 'All >>'

    return {
      TOTAL_MSG,
      sliderValue: TOTAL_MSG as any,
      timeSlider: {
        height: 6,
        piecewise: true,
        show: false,
        'enable-cross': false,
        minRange: 1,
        marks: [] as any[],
        contained: true,
        sliderStyle: [{ backgroundColor: '#f05b72' }, { backgroundColor: '#3498db' }],
        processStyle: {
          backgroundColor: '#00bb5588',
          borderColor: '#f05b72',
        },
        tooltip: 'always',
        'tooltip-placement': 'bottom',
        data: [] as any[],
      },
    }
  },
  computed: {
    clockTime(): string {
      return this.convertSecondsToClockTime(this.sliderValue)
    },
  },
  watch: {
    initialTime(seconds: number) {
      this.sliderValue = seconds
    },

    useRange(useIt: boolean) {
      if (useIt) {
        this.sliderValue = [this.stops[0], this.stops[this.stops.length - 1]]
      } else {
        this.sliderValue = [this.stops[0]]
      }
      console.log('changed to: ' + this.sliderValue)
    },

    stops(newStops: any) {
      console.log({ newStops })
      this.timeSlider.data = newStops
    },

    sliderValue() {
      this.$emit('change', this.sliderValue)
    },
  },
  mounted() {
    this.timeSlider.data = this.stops
    this.timeSlider.marks = [
      this.stops[0],
      this.stops[Math.floor(this.stops.length / 2)],
      this.stops[this.stops.length - 1],
    ]
  },
  methods: {
    dataFunction() {
      return {
        value: this.sliderValue,
        data: this.stops,
      }
    },

    convertSecondsToClockTimeMinutes(index: number) {
      try {
        const hms = timeConvert(index)
        const minutes = ('00' + hms.minutes).slice(-2)
        return `${hms.hours}:${minutes}`
      } catch (e) {
        return '0:00'
      }
    },

    convertSecondsToClockTime(index: number) {
      const hms = timeConvert(index)
      const minutes = ('00' + hms.minutes).slice(-2)
      const seconds = ('00' + hms.seconds).slice(-2)
      return `${hms.hours}:${minutes}:${seconds}`
    },
  },
})
</script>

<style scoped lang="scss">
@import '../../../node_modules/vue-slider-component/theme/default.css';
@import '@/styles.scss';

.time-slider {
  margin-left: 0.5rem;
  padding-bottom: 0.25rem;
}
</style>
