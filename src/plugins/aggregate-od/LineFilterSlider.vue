<template lang="pug">
o-slider.time-slider(
  v-model="sliderValue"
  size="small"
  :min="0"
  :max="stops.length - 1"
  :tooltip="tooltip"
  :tooltipAlways="tooltip"
  :formatter="formatLabel"
  indicator
)
  o-slider-tick(v-for="tick,i in stops" :key="i" :value="i")

</template>

<script lang="ts">
import { defineComponent } from 'vue'

// slider positions map to these filter values; the last one means "no filtering"
const STOPS = [
  0, 1, 2, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70, 75, 80, 85, 90, 95, 100, 'Alle',
]

export default defineComponent({
  name: 'LineFilterSlider',
  props: {
    initialValue: { required: true },
    tooltip: { type: Boolean, default: true },
  },
  data: () => {
    return {
      sliderValue: 0,
      stops: STOPS as any[],
    }
  },
  // VUE LIFECYCLE HOOKS
  mounted() {
    this.sliderValue = this.stops.includes(this.initialValue)
      ? this.stops.indexOf(this.initialValue)
      : 0
  },
  watch: {
    sliderValue(result: any) {
      this.$emit('change', this.stops[result])
    },
  },
  methods: {
    formatLabel(value: number) {
      return '' + this.stops[value]
    },
  },
})
</script>

<style scoped>
.time-slider {
  max-width: 100%;
  padding: 0 1rem;
}
</style>
