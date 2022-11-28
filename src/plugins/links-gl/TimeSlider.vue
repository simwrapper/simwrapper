<template lang="pug">
.time-slider-main-content
  vue-slider.time-slider(v-bind="timeSlider" v-model="sliderValue")
</template>

<script lang="ts">
import { defineComponent } from 'vue'

import VueSlider from 'vue-slider-component'

export default defineComponent({
  name: 'TimeSliderLinksGl',
  components: { VueSlider },
  props: {
    useRange: Boolean,
    stops: { type: Array, required: true },
    dropdownValue: String,
  },
  data() {
    return {
      sliderValue: '' as any,
      timeSlider: {
        adsorb: true,
        contained: true,
        data: [] as any[],
        'enable-cross': false,
        height: 8,
        piecewise: true,
        show: false,
        marks: [] as any[],
        minRange: 1,
        processStyle: { backgroundColor: '#00bb5588', borderColor: '#f05b72' },
        sliderStyle: [{ backgroundColor: '#f05b72' }, { backgroundColor: '#3498db' }],
        'tooltip-placement': 'bottom',
      },
    }
  },
  watch: {
    dropdownValue(value) {
      this.sliderValue = value
    },

    useRange(useIt: boolean) {
      if (useIt) {
        this.sliderValue = [this.stops[0], this.stops[this.stops.length - 1]]
      } else {
        this.sliderValue = [this.stops[0]]
      }
      console.log('changed to: ' + this.sliderValue)
    },
    sliderValue(result: any) {
      this.$emit('change', result)
    },
  },
  mounted() {
    this.sliderValue = this.stops[0] || '...'
    this.timeSlider.data = this.stops
    this.timeSlider.marks = [
      this.stops[0],
      this.stops[Math.floor(this.stops.length / 2)],
      this.stops[this.stops.length - 1],
    ] // this.stops.filter((stop, i) => i % 3 === 0)
  },
})
</script>

<style scoped>
@import '../../../node_modules/vue-slider-component/theme/default.css';

.time-slider-main-content {
  padding: 0.5rem 0.25rem 2rem 0.25rem;
  margin: 0 0.2rem;
}
</style>
