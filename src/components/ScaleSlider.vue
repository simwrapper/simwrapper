<template lang="pug">
b-slider.time-slider(v-if="options.data.length"
  v-bind="options"
  v-model="sliderValue"
)
  b-slider-tick(v-for="tick,i in options.data" :key="i" :value="i")
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'ScaleSlider',
  props: {
    stops: { type: Array, required: true },
    initialValue: { type: Number, required: true },
    tooltip: { type: Boolean, default: true },
  },
  data: self => {
    return {
      sliderValue: 1,
      options: {
        tooltip: self.tooltip,
        'tooltip-always': self.tooltip,
        min: 0,
        size: 'is-small',
        max: 100,
        indicator: true,
        data: [] as any[], //this.stops,
        'custom-formatter': {},
      },
    }
  },
  mounted() {
    this.options['custom-formatter'] = (val: any) => '' + this.options.data[val]
    this.options.max = this.stops.length - 1
    this.options.data = this.stops
    this.sliderValue = this.stops.includes(this.initialValue)
      ? this.stops.indexOf(this.initialValue)
      : 0
  },
  watch: {
    sliderValue() {
      this.sliderChangedEvent()
    },
  },
  methods: {
    sliderChangedEvent() {
      // console.log(result)
      this.$emit('change', this.options.data[this.sliderValue])
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
