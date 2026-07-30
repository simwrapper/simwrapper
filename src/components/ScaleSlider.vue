<template lang="pug">
.slider-block
  //- The value lives on the label line, not inside the thumb: an `indicator` renders it
  //- inside a 10px thumb where it overflows onto the track. Driven by our own
  //- `sliderValue` so it tracks the thumb live -- consumers debounce the `change` event,
  //- so a parent-owned copy of the value would visibly lag the drag.
  .slider-label(v-if="label")
    .slider-name {{ label }}
    b.slider-value {{ displayValue }}

  o-slider.time-slider(v-if="options.data.length"
    v-bind="options"
    v-model="sliderValue"
  )
    o-slider-tick(v-for="tick,i in options.data" :key="i" :value="i")
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'ScaleSlider',
  props: {
    stops: { type: Array, required: true },
    initialValue: { type: Number, required: true },
    tooltip: { type: Boolean, default: true },
    /** Optional caption; when set, it renders above the track with the value right-aligned. */
    label: { type: String, default: '' },
  },
  data: self => {
    return {
      sliderValue: 1,
      options: {
        tooltip: self.tooltip,
        'tooltip-always': self.tooltip,
        min: 0,
        size: 'small',
        max: 100,
        indicator: false,
        data: [] as any[], //this.stops,
        formatter: {},
      },
    }
  },
  computed: {
    displayValue(): string {
      const stops = this.options.data
      return stops.length ? '' + stops[this.sliderValue] : ''
    },
  },
  mounted() {
    this.options.formatter = (val: any) => '' + this.options.data[val]
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
  /* values run 1 -> 5000, so fix the digit width or the number jitters while dragging */
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
