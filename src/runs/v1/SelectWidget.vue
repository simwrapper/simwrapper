<template lang="pug">
#slider-thing
  vue-slide-bar.my-slider(:speed="0" :data="stops" v-model="value")
  p {{ measure }}

</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'
import VueSlideBar from 'vue-slide-bar'

@Component({
  components: {
    VueSlideBar,
  },
})
export default class SectionViewer extends Vue {
  @Prop() private state!: any
  @Prop() private measure!: any

  private value: any = 0
  private stops: any[] = [0, 1000]

  private mounted() {
    const experiments = []
    for (const x of this.state.measures[this.measure]) {
      experiments.push(x === 1000 ? 'Never' : x)
    }

    this.stops = experiments
    this.value = 'Never'
  }

  @Watch('value')
  private valueChanged() {
    let answer = this.value
    if (answer === 'Never') answer = 1000
    this.$emit('changed', this.measure, answer)
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.my-slider {
  margin-top: 1rem;
}

@media only screen and (max-width: 768px) {
  .my-slider {
    margin-top: 0.25rem;
  }
}
</style>
