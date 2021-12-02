<template lang="pug">
  .plotly-plot(:id="plotlyId" :ref="plotlyId")
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import Plotly from 'plotly.js/dist/plotly-cartesian'

let plotlyCounter = 0

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) data!: any[]
  @Prop({ required: true }) layout!: any
  @Prop({ required: true }) options!: any

  private plotlyId = '__plotly__'

  private async mounted() {
    plotlyCounter += 1
    this.plotlyId = `plotly-${plotlyCounter}`

    await this.$nextTick()

    Plotly.react(this.plotlyId, this.data, this.layout, this.options)

    const myPlot = document.getElementById(this.plotlyId) as any
    myPlot.on('plotly_click', (data: any) => {
      this.$emit('click', data)
    })
  }

  private handleClick(click: any) {
    console.log(click)
  }

  @Watch('data')
  @Watch('layout')
  @Watch('options')
  private updatePlot() {
    Plotly.react(this.plotlyId, this.data, this.layout, this.options)
  }
}
</script>
