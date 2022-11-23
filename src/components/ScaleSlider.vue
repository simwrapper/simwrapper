<template lang="pug">
b-slider.time-slider(v-if="options.data.length"
  v-bind="options"
  v-model="sliderValue"
)
  b-slider-tick(v-for="tick,i in options.data" :key="i" :value="i")
</template>

<script lang="ts">
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

@Component({ components: {} })
export default class ScaleSlider extends Vue {
  @Prop({ required: true }) private stops!: any[]
  @Prop({ required: true }) private initialValue!: number

  private sliderValue = 1

  private options = {
    // tooltip: false,
    'tooltip-always': true,
    min: 0,
    size: 'is-small',
    max: 100,
    indicator: true,
    data: [] as any[], //this.stops,
    'custom-formatter': (val: any) => '' + this.options.data[val],
  }

  // VUE LIFECYCLE HOOKS
  public mounted() {
    this.sliderValue = this.stops.includes(this.initialValue)
      ? this.stops.indexOf(this.initialValue)
      : 0
    this.options.max = this.stops.length - 1
    this.options.data = this.stops
  }

  @Watch('sliderValue')
  private sliderChangedEvent(result: any) {
    // console.log(result)
    this.$emit('change', this.options.data[result])
  }
}
</script>

<style scoped>
.time-slider {
  max-width: 100%;
  padding: 0 1rem;
}
</style>
