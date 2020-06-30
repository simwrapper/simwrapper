<template lang="pug">
#slider-thing
  .button-choices(v-if="showButtons")
    button.button.is-small(
      v-for="choice in stops"
      :class="{'is-link': choice===selectedValue}"
      :key="choice"
      @click='choseButton(choice)') {{ choice }}

  p {{ measure.title }}

</template>

<script lang="ts">
import { Component, Prop, Vue, Watch } from 'vue-property-decorator'

@Component({
  components: {},
})
export default class VueComponent extends Vue {
  @Prop({ required: true }) private options!: any[]
  @Prop({ required: true }) private measure!: { measure: string; title: string; order?: string }

  private selectedValue: string = ''
  private stops: any[] = []

  private showButtons = false

  private choseButton(choice: string) {
    console.log(choice)
    this.selectedValue = choice
  }

  private mounted() {
    console.log({ measure: this.measure, options: this.options })
    this.updateOptions()
  }

  @Watch('options') private updateOptions() {
    let experiments = []
    if (!this.options) return

    // if the options are (a) all numbers and (b) all 0.0 > x > 1.0, then use %
    // otherwise treat as text
    let usePercent = true
    for (const x of this.options) {
      if (isNaN(x)) {
        usePercent = false
        break
      }
      if (x < 0.0 || x > 1.0) {
        usePercent = false
        break
      }
    }

    // build labels
    for (const x of this.options) {
      let label = usePercent ? '' + Math.round(x * 100) + '%' : '' + x

      this.showButtons = true
      experiments.push(label)
    }

    if (experiments[0].startsWith('+')) experiments.sort()

    // hand-selected button order, if available
    if (this.measure.order) {
      const newOrder = []
      for (const item of this.measure.order.split(',')) {
        const btn = experiments.filter(a => a === item)
        if (btn.length) newOrder.push(btn[0])
      }
      experiments = newOrder
    }

    this.selectedValue = experiments[0] // select first choice
    this.stops = experiments
  }

  @Watch('selectedValue')
  private valueChanged() {
    // don't fire events if we're just building the widget
    // if (this.isUpdating) {
    //   console.log('ignoring')
    //   return
    // }

    if (this.selectedValue.endsWith('%') && !this.selectedValue.startsWith('+')) {
      const answer = this.selectedValue.substring(0, this.selectedValue.length - 1)
      let v = '' + parseFloat(answer) / 100.0
      if (v === '0') v = '0.0'
      if (v === '1') v = '1.0'
      this.$emit('changed', this.measure.measure, v)
    } else {
      this.$emit('changed', this.measure.measure, this.selectedValue)
    }
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
