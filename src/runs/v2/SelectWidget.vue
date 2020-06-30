<template lang="pug">
#slider-thing
  vue-slide-bar.my-slider(:speed="0" :data="stops" v-model="value")
  p {{ measureTitle }}

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

  private interventions: any = {
    remainingFractionWork: 'Still going to work',
    remainingFractionShopping: 'Still shopping',
    remainingFractionLeisure: 'Still doing leisure activities',
    remainingFractionOther: 'Still doing other activities',
    ReopenAfter: 'Lift Shutdown After X Days',
  }

  private mounted() {
    const experiments = []
    for (const x of this.state.measures[this.measure]) {
      experiments.push(x === 1000 ? 'Never' : x)
    }

    this.stops = experiments.map(x => (x <= 1 ? x * 100 : x))
    this.value = 'Never'
  }

  private get measureTitle() {
    return this.interventions[this.measure]
  }

  @Watch('value')
  private valueChanged() {
    let answer = this.value
    if (answer === 'Never') answer = 1000
    else if (answer !== 21) answer = 0.01 * answer
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
