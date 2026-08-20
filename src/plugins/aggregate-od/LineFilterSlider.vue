<template lang="pug">
.slider-block
  //- The value lives on the label line, not inside the thumb -- see ScaleSlider.vue.
  .slider-label(v-if="label")
    span.slider-name {{ label }}
    b.slider-value {{ formatLabel(sliderValue) }}

  o-slider.time-slider(
    v-model="sliderValue"
    size="small"
    :min="0"
    :max="stops.length - 1"
    :tooltip="tooltip"
    :tooltipAlways="tooltip"
    :formatter="formatLabel"
  )
    o-slider-tick(v-for="tick,i in stops" :key="i" :value="i")

</template>

<script lang="ts">
import { defineComponent } from 'vue'

// slider positions map to these filter values; the last one means "no filtering"
const STOPS = [
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
]

export default defineComponent({
  name: 'LineFilterSlider',
  props: {
    initialValue: { required: true },
    tooltip: { type: Boolean, default: true },
    /** Optional caption; when set, it renders above the track with the value right-aligned. */
    label: { type: String, default: '' },
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
.slider-label {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.5rem;
  font-size: 0.8rem;
  line-height: 1rem;
  padding: 0 0.5rem;
}

.slider-value {
  /* "Alle" is wider than the numbers, and 0 -> 100 changes digit count while dragging */
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
  margin-right: 0.5rem;
}

.time-slider {
  max-width: 100%;
  /* Horizontal only. The `padding` shorthand would also zero the vertical padding that
     theme-oruga puts on .o-slider, collapsing the track onto its label. */
  padding-left: 1rem;
  padding-right: 1rem;
  margin-top: -4px;
}
</style>
