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
  @Prop({ required: true }) private stops!: any[]
  @Prop({ required: true }) private initialValue!: number

  private sliderValue: number = 1

  private scaleSlider = {
    height: 6,
    piecewise: true,
    show: false,
    'enable-cross': false,
    minRange: 1,
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
  public mounted() {
    this.sliderValue = this.initialValue
    this.scaleSlider.data = this.stops
  }

  @Watch('sliderValue')
  private sliderChangedEvent(result: any) {
    // console.log(result)
    this.$emit('change', result)
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
