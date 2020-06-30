<template lang="pug">
#slider-thing
  vue-slide-bar.my-slider(v-if="showSlider" :speed="0" :data="stops" v-model="value")

  .button-choices(v-if="showButtons")
    button.button.is-small(
      v-for="choice in stops"
      :class="{'is-link': choice===value}"
      :key="choice"
      @click='choseButton(choice)') {{ choice }}

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

  private showButtons = false
  private showSlider = true

  private interventions: any = {
    remainingFractionKiga: 'Going to kindergarten',
    remainingFractionPrimary: 'Going to primary school',
    remainingFractionSecondary: 'Going to secondary school',
    remainingFractionHigher: 'Going to univ./higher ed.',
    ShutdownType: 'Shutdown type',
  }

  private choseButton(choice: string) {
    console.log(choice)
    this.value = choice
  }

  private mounted() {
    const experiments = []
    for (const x of this.state.measures[this.measure]) {
      let label = x
      if (x === 'weak') label = 'Type A'
      if (x === 'strong') label = 'Type B'

      if (isNaN(label)) {
        if (!this.showButtons) this.value = label // select first choice
        this.showButtons = true
        this.showSlider = false
      }

      experiments.push(label)
    }

    this.stops = experiments.map(x => (x <= 1 ? x * 100 : x))
    if (this.showSlider) this.value = 'Never'
  }

  private get measureTitle() {
    return this.interventions[this.measure]
  }

  @Watch('value')
  private valueChanged() {
    let answer = this.value
    if (answer === 'Never') {
      answer = 1000
    } else if (answer === 'Type A') {
      answer = 'weak'
    } else if (answer === 'Type B') {
      answer = 'strong'
    } else if (!isNaN(answer)) {
      answer = 0.01 * answer
    }
    this.$emit('changed', this.measure, answer)
  }
}
</script>

<!-- Add "scoped" attribute to limit CSS to this component only -->
<style scoped>
.my-slider {
  margin-top: 1rem;
}

.button-choices {
  margin-top: 1rem;
}

.button-choices button {
  margin-right: 0.5rem;
}

@media only screen and (max-width: 768px) {
  .my-slider {
    margin-top: 0.25rem;
  }
}
</style>
