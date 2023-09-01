<template lang="pug">
.time-slider-main-content

  b-slider(
    v-model="sliderValue"
    :max="stops.length - 1"
    :tooltip="false"
  )
      b-slider-tick(v-for="stop,i in stops" :key="i" :value="i")


</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'TimeSliderLinksGl',
  props: {
    useRange: Boolean,
    stops: { type: Array, required: true },
    dropdownValue: String,
  },
  data() {
    return {
      sliderValue: 0 as any,
    }
  },
  watch: {
    // dropdownValue(value) {
    //   this.sliderValue = value
    // },

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
  mounted() {},
})
</script>

<style scoped>
.time-slider-main-content {
  padding: 0rem 0rem 0rem 0.25rem;
  margin: 0 0.2rem;
}
</style>
