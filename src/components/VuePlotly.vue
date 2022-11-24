<template lang="pug">
.plotly-plot(:id="plotlyId" :ref="plotlyId")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import Plotly from 'plotly.js/dist/plotly-cartesian'

let plotlyCounter = 0

export default defineComponent({
  name: 'VuePlotlyComponent',
  props: {
    data: { type: Array, required: true },
    layout: { type: Object, required: true },
    options: { type: Object, required: true },
  },
  data: () => {
    return {
      plotlyId: '__plotly__',
    }
  },
  watch: {
    data() {
      this.updatePlot()
    },
    layout() {
      this.updatePlot()
    },
    options() {
      this.updatePlot()
    },
  },
  async mounted() {
    plotlyCounter += 1
    this.plotlyId = `plotly-${plotlyCounter}`

    await this.$nextTick()

    Plotly.react(this.plotlyId, this.data, this.layout, this.options)

    const myPlot = document.getElementById(this.plotlyId) as any
    myPlot.on('plotly_click', (data: any) => {
      this.$emit('click', data)
    })
  },
  methods: {
    handleClick(click: any) {
      console.log(click)
    },
    updatePlot() {
      try {
        Plotly.react(this.plotlyId, this.data, this.layout, this.options)
      } catch (e) {
        // can error if layout changes before plot is plotted. Ignore.
      }
    },
  },
})
</script>
