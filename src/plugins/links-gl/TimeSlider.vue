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
  @Prop()
  private useRange!: false

  @Prop({ required: true })
  private stops!: any[]

  private sliderValue: any = this.stops[0] || '...'

  private timeSlider = {
    height: 6,
    piecewise: true,
    show: false,
    'enable-cross': false,
    minRange: 1,
    adsorb: true,
    marks: this.stops.filter((stop, i) => i % 6 === 0),
    contained: true,
    sliderStyle: [{ backgroundColor: '#f05b72' }, { backgroundColor: '#3498db' }],
    processStyle: {
      backgroundColor: '#00bb5588',
      borderColor: '#f05b72',
    },
    // tooltip: 'always',
    'tooltip-placement': 'bottom',
    data: this.stops,
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

  // @Watch('stops')
  // private setStops(newStops: any) {
  //   console.log({ newStops })
  //   this.timeSlider.data = newStops
  // }

  @Watch('sliderValue')
  private sliderChangedEvent(result: any) {
    this.$emit('change', result)
  }
}
</script>

<style scoped>
@import '../../../node_modules/vue-slider-component/theme/default.css';

.time-slider-main-content {
  padding: 0.5rem 0.25rem 2rem 0.25rem;
  margin: 0 0.2rem;
}
</style>
