<template lang="pug">
#slider-thing
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

@Component({
  components: {},
})
export default class SectionViewer extends Vue {
  @Prop({ required: true }) private state!: any
  @Prop({ required: true }) private measure!: any

  private value: any = 0
  private stops: any[] = [0, 1000]

  private showButtons = false

  private interventions: any = {
    remainingFractionLeisure1: 'Leisure activities',

    remainingFractionWork: 'Work activities',
    remainingFractionLeisure2: 'Leisure activities',
    remainingFractionShoppingBusinessErrands: 'All other activities',

    remainingFractionKiga: 'Going to kindergarten',
    remainingFractionPrima: 'Going to primary school',
    remainingFractionSecon: 'Going to secondary/univ.',
  }

  private choseButton(choice: string) {
    console.log(choice)
    this.value = choice
  }

  private mounted() {
    this.updateOptions()
  }

  private updateOptions() {
    const experiments = []

    for (const x of this.state.measures[this.measure]) {
      let label = '' + x * 100 + '%'

      this.value = label // select first choice
      this.showButtons = true

      experiments.push(label)
    }

    this.stops = experiments
  }

  private get measureTitle() {
    return this.interventions[this.measure]
  }

  @Watch('value')
  private valueChanged() {
    let answer = this.value.substring(0, this.value.length - 1)
    answer = parseFloat(answer) / 100.0
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
  margin-left: 0;
  margin-top: 1rem;
}

.button-choices button {
  margin-right: 0.2rem;
}

@media only screen and (max-width: 768px) {
  .my-slider {
    margin-top: 0.25rem;
  }
}
</style>
