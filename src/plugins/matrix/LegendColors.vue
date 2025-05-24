<template lang="pug">
.legend-colors
  .edit-entries.flex-col(v-if="isEditing")
    .edit-row.flex-row(v-for="entry,i in entries" :key="i")
      .swatch(:style="getColor(entry)") &nbsp;
      .flex1: b-field(:type="userBreakpoints[i-1] > userBreakpoints[i] ? 'is-danger' : ''")
        b-input(type="number" step="any" size="is-small" v-model="userBreakpoints[i-1]" :disabled="i==0" )
      p: b &nbsp;{{entry.label[1]}}&nbsp;
      .flex1: b-field(:type="userBreakpoints[i] < userBreakpoints[i-1] ? 'is-danger' : ''")
        b-input(type="number"  step="any" size="is-small" v-model="userBreakpoints[i]" :disabled="i==entries.length-1")
      .edit-actions.flex-row
        p: i.fa.fa-plus
        p: i.fa.fa-times(style="color: #b00" @click="removeRow(i)")

  .entries.flex-col()
    .entry.flex-row(v-for="entry,i in entries" :key="entry.key")
      .swatch(:style="getColor(entry)")
      .entry-label(v-if="i<entries.length-1") {{ entry.label.join(' ') }}
      .entry-label(v-else) {{ entry.label.toReversed().join(' ') }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { precise } from '@/js/util'

interface LegendEntry {
  rgb: number[]
  label: any[]
  key: number
}

const MyComponent = defineComponent({
  name: 'LegendColors',
  components: {},
  props: {
    thresholds: {
      required: true,
      type: Object as PropType<{ breakpoints: number[]; colorsAsRGB: number[][] }>,
    },
  },
  data() {
    return {
      entries: [] as LegendEntry[],
      isEditing: true,
      userBreakpoints: [] as number[],
      isUpdating: true,
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
    removeRow(i: number) {
      this.userBreakpoints.splice(i, 1)
      this.$emit('breakpoints-changed', this.userBreakpoints)
    },

    getColor(entry: LegendEntry) {
      return {
        backgroundColor: `rgb(${entry.rgb[0]}, ${entry.rgb[1]}, ${entry.rgb[2]})`,
        height: '1rem',
        width: '1rem !important',
        margin: 'auto 0.5rem auto 0',
      }
    },

    updateLegend() {
      const colors = this.thresholds.colorsAsRGB as number[][]
      const breakpoints = this.thresholds.breakpoints as number[]
      const entries = [] as LegendEntry[]

      this.userBreakpoints = breakpoints.map(b => parseFloat(precise(b, 4)))

      for (let i = 0; i < colors.length; i++) {
        let label = []
        switch (i) {
          case 0:
            label = ['', '<', precise(breakpoints[0], 4)]
            break
          case colors.length - 1:
            label = [precise(breakpoints[i - 1], 4), '>', '']
            break
          default:
            label = [`${precise(breakpoints[i - 1], 4)}`, '–', `${precise(breakpoints[i], 4)}`]
        }
        entries.push({ rgb: colors[i], label, key: Math.random() })
      }
      this.entries = entries
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

.edit-entries {
  gap: 1px;
  margin-bottom: 2rem;
}

.edit-row {
  gap: 5px;
}

.edit-actions {
  gap: 7px;
  margin-top: 2px;
}
</style>
