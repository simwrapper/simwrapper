<template lang="pug">
b-slider.time-slider(
  v-bind="options"
  v-model="sliderValue"
  tooltip-always
)
  b-slider-tick(v-for="tick,i in options.data" :key="i" :value="i")

</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'LineFilterSlider',
  props: {
    initialValue: { type: Number, required: true },
    tooltip: { type: Boolean, default: true },
  },
  data: self => {
    return {
      sliderValue: 0,
      options: {
        size: 'is-small',
        indicator: true,
        min: 0,
        max: 100,
        'tooltip-always': self.tooltip,
        tooltip: self.tooltip,
        data: [
          0,
          1,
          2,
          5,
          10,
          15,
          20,
          25,
          30,
          35,
          40,
          45,
          50,
          55,
          60,
          65,
          70,
          75,
          80,
          85,
          90,
          95,
          100,
          'Alle',
        ],
      } as any,
    }
  },
  // VUE LIFECYCLE HOOKS
  mounted() {
    this.options['custom-formatter'] = (val: any) => '' + this.options.data[val]
    this.sliderValue = this.initialValue
    this.sliderValue = this.options.data.includes(this.initialValue)
      ? this.options.data.indexOf(this.initialValue)
      : 0
    this.options.max = this.options.data.length - 1
  },
  watch: {
    sliderValue(result: any) {
      this.$emit('change', this.options.data[result])
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
