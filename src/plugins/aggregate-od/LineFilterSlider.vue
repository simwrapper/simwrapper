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
  @Prop()
  private initialValue!: number

  @Prop()
  private useRange!: false

  @Prop()
  private stops!: any

  private sliderValue: any = 0

  private scaleSlider = {
    height: 6,
    piecewise: true,
    show: false,
    'enable-cross': false,
    minRange: 0,
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
    marks: [0, 25, 50, 75, 'Alle'],
    contained: true,
    sliderStyle: [{ backgroundColor: '#f05b72' }, { backgroundColor: '#3498db' }],
    processStyle: {
      backgroundColor: '#00bb5588',
      borderColor: '#f05b72',
    },
    tooltip: 'always',
    'tooltip-placement': 'bottom',
  }

  // VUE LIFECYCLE HOOKS
  public created() {}

  public mounted() {
    this.sliderValue = this.initialValue
  }

  @Watch('stops')
  private setStops(newStops: any) {
    console.log({ newStops })
    this.stops = newStops
  }

  @Watch('sliderValue')
  private sliderChangedEvent(result: any) {
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
@import '../../../node_modules/vue-slider-component/theme/default.css';

.time-slider-main-content {
  padding: 0.5rem 0.8rem 2rem 0.5rem;
}

.time-slider {
  margin-left: 0.5rem;
  margin-bottom: 0.2rem;
}
</style>
