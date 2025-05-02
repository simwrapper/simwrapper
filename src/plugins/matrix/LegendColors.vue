<template lang="pug">
.legend-colors
  .entries.flex-col
    .entry.flex-row(v-for="entry in entries" :key="entry.label")
      .swatch(:style="getColor(entry)")
      .entry-label {{ entry.label }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { precise } from '@/js/util'

interface LegendEntry {
  rgb: number[]
  label: string
}

const MyComponent = defineComponent({
  name: 'LegendColors',
  components: {},
  props: {
    thresholds: {
      required: true,
      type: Object as PropType<{
        min: number
        max: number
        breakpoints: number[]
        colorsAsRGB: number[][]
      }>,
    },
  },
  data() {
    return {
      entries: [] as LegendEntry[],
    }
  },
  mounted() {
    this.updateLegend()
  },
  computed: {},
  watch: {
    thresholds() {
      this.updateLegend()
    },
  },
  methods: {
    getColor(entry: LegendEntry) {
      return {
        backgroundColor: `rgb(${entry.rgb[0]}, ${entry.rgb[1]}, ${entry.rgb[2]})`,
        height: '1rem',
        width: '1rem',
        margin: 'auto 0.5rem auto 0',
      }
    },

    updateLegend() {
      const colors = this.thresholds.colorsAsRGB as number[][]
      const breakpoints = this.thresholds.breakpoints as number[]
      const min = this.thresholds.min
      const max = this.thresholds.max

      const entries = [] as LegendEntry[]

      for (let i = 0; i < colors.length; i++) {
        let label = '??'
        switch (i) {
          case 0:
            label = '< ' + precise(max * breakpoints[0], 4)
            break
          case colors.length - 1:
            label = '> ' + precise(max * breakpoints[i - 1], 4)
            break
          default:
            label = `${precise(max * breakpoints[i - 1], 4)} — ${precise(max * breakpoints[i], 4)}`
        }
        entries.push({ rgb: colors[i], label })
      }
      this.entries = entries
      // console.log({ entries })
    },
  },
})

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.entry-label {
  font-size: 0.9rem;
  margin: auto 0;
}
</style>
