<template lang="pug">
.plotly-plot(v-if="plotlyId" :id="plotlyId" :ref="plotlyId")
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import Plotly from 'plotly.js/dist/plotly'

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
      plotlyId: `plotly-${plotlyCounter++}`,
      myPlot: null as any,
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
    await this.$nextTick()
    Plotly.react(this.plotlyId, this.data, this.layout, this.options)

    this.myPlot = this.$refs[this.plotlyId]
    this.myPlot.on('plotly_click', this.handleClick)
  },

  beforeDestroy() {
    this.myPlot.removeAllListeners()
    Plotly.purge(this.$refs[this.plotlyId])
  },

  methods: {
    handleClick(click: any) {
      this.$emit('click', click)
    },

    async updatePlot() {
      try {
        await this.$nextTick()
        Plotly.react(this.plotlyId, this.data, this.layout, this.options)
      } catch (e) {
        console.warn('' + e)
        // can error if layout changes before plot is plotted. Ignore.
      }
    },
  },
})
</script>
