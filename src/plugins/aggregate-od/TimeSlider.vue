<template lang="pug">
.time-slider
  b-slider(:min="0" :max="stops.length" v-model="sliderValue" :tooltip="false")
    b-slider-tick(v-for="stop,i of allStops" :key="stop" :value="i")
  p: b {{ stopLabel }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'TimeSliderX',
  components: {},
  props: {
    useRange: Boolean,
    all: String,
    stops: { type: Array, required: true },
  },
  data: () => {
    return {
      sliderValue: 0 as any,
    }
  },
  computed: {
    allStops() {
      const initial = this.all ? [this.all] : []
      return [...initial, ...this.stops]
    },

    stopLabel() {
      if (Array.isArray(this.sliderValue))
        return `${this.allStops[this.sliderValue[0]]} : ${this.allStops[this.sliderValue[1]]}`
      else return this.allStops[this.sliderValue]
    },
  },
  watch: {
    useRange(useIt: boolean) {
      if (useIt) {
        this.sliderValue = [1, this.allStops.length - 1]
      } else {
        this.sliderValue = this.sliderValue[0]
      }
    },

    sliderValue() {
      const timePeriod = Array.isArray(this.sliderValue)
        ? [this.allStops[this.sliderValue[0]], this.allStops[this.sliderValue[1]]]
        : this.allStops[this.sliderValue]
      this.$emit('change', timePeriod)
    },
  },
  mounted() {
    // console.log(777, this.stops)
  },
  methods: {},
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.time-slider {
  margin: 0.5rem;
  margin-top: -0.75rem;
}

p {
  font-size: 1rem;
  margin: 0;
  margin-left: -0.4rem;
  padding: 0;
  line-height: 0.5rem;
}
</style>
