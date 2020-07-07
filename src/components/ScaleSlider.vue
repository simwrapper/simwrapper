<template lang="pug">
.time-slider-main-content
  vue-slider.time-slider(v-bind="scaleSlider" v-model="sliderValue")
</template>

<script lang="ts">
import * as timeConvert from 'convert-seconds'
import vueSlider from 'vue-slider-component'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

@Component({ components: { 'vue-slider': vueSlider } })
export default class ScaleSlider extends Vue {
  private TOTAL_MSG = 1

  @Prop()
  private initialTime!: number

  @Prop()
  private useRange!: false

  @Prop()
  private stops!: any
  private sliderValue: any = this.TOTAL_MSG

  private scaleSlider = {
    height: 6,
    piecewise: true,
    show: false,
    'enable-cross': false,
    minRange: 1,
    marks: [1, 10, 100, 300, 500],
    contained: true,
    sliderStyle: [{ backgroundColor: '#f05b72' }, { backgroundColor: '#3498db' }],
    processStyle: {
      backgroundColor: '#00bb5588',
      borderColor: '#f05b72',
    },
    tooltip: 'always',
    'tooltip-placement': 'bottom',
    data: this.stops,
  }

  // VUE LIFECYCLE HOOKS
  public created() {}
  public mounted() {}

  @Watch('stops')
  private setStops(newStops: any) {
    console.log({ newStops })
    this.stops = newStops
  }

  @Watch('sliderValue')
  private sliderChangedEvent(result: any) {
    console.log(result)
    this.$emit('change', result)
  }

  private dataFunction() {
    return {
      value: this.sliderValue,
      data: this.stops,
    }
  }
}
</script>

<style scoped>
@import '../../node_modules/vue-slider-component/theme/default.css';

.time-slider-main-content {
  padding: 0.5rem 0.8rem 2rem 0.5rem;
}

.time-slider {
  margin-left: 0.5rem;
  margin-bottom: 0.2rem;
}
</style>
