<template lang="pug">
.legend-colors
  .edit-entries.flex-col(v-if="isEditing")
    .edit-row.flex-row(v-for="entry,i in entries" :key="i")
      .swatch(:style="getColor(entry)") &nbsp;
      .flex1: b-field(:type="userBreakpoints[i-1] > userBreakpoints[i] ? 'is-danger' : ''")
        b-input(
          type="number"
          step="any"
          size="is-small"
          v-model="userBreakpoints[i-1]"
          :disabled="i==0"
          @input="debHandleEntry"
        )
      p: b &nbsp;{{entry.label[1]}}&nbsp;
      .flex1: b-field(:type="userBreakpoints[i] < userBreakpoints[i-1] ? 'is-danger' : ''")
        b-input(
          type="number"
          step="any"
          size="is-small"
          v-model="userBreakpoints[i]"
          :disabled="i==entries.length-1"
          @input="debHandleEntry"
        )
      .edit-actions.flex-row
        p: i.fa.fa-plus(@click="handleAddRow(i)")
        p: i.fa.fa-times(style="color: #b00" @click="handleRemoveRow(i)")

  //- Clean layout legend: columns of right/left aligned numbers split at decimal point
  .entries.flex-row(v-else)
    .swatches.flex-col
      .swatch(v-for="entry in entries" :style="getColor(entry)")
    .bridge.flex-col
      .blank &nbsp;
      .flex-row(v-for="breakpoint in thresholds.breakpoints" style="margin-left: auto;") {{ getPrecise(breakpoint,4) }}
    .bridge.flex-col
      .flex-row(v-for="entry,i in entries") &nbsp;&nbsp;{{ entry.label[1] }}&nbsp;
    .bridge.flex-col
      .flex-row(v-for="breakpoint in thresholds.breakpoints" style="margin-left: auto;") {{ getPrecise(breakpoint,4) }}
      .blank &nbsp;

  //- .entries.flex-col
  //-   .entry.flex-row(v-for="entry,i in entries" :key="entry.key")
  //-     .swatch(:style="getColor(entry)")
  //-     .entry-label(v-if="i<entries.length-1") {{ entry.label.join(' ') }}
  //-     .entry-label(v-else) {{ entry.label.toReversed().join(' ') }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { debounce } from 'debounce'

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
    isEditing: Boolean,
    thresholds: {
      required: true,
      type: Object as PropType<{ breakpoints: number[]; colorsAsRGB: number[][] }>,
    },
  },
  data() {
    return {
      isUpdating: true,
      entries: [] as LegendEntry[],
      userBreakpoints: [] as any[], // can be string or number
      debHandleEntry: {} as any,
    }
  },
  mounted() {
    this.debHandleEntry = debounce(this.handleEntry, 250)
    this.updateLegend()
  },
  computed: {},
  watch: {
    thresholds() {
      this.updateLegend()
    },
  },

  methods: {
    getPrecise(num: number, fix: number) {
      return precise(num, fix)
    },

    splitNumber(num: string | number) {
      console.log(num)
      const numAsString = typeof num == 'string' ? num : num.toFixed(3)
      const [int, dec = '0'] = numAsString.split('.')
      return [int, `.${dec}`]
    },

    handleRemoveRow(i: number) {
      this.userBreakpoints.splice(i, 1)
      const values = this.userBreakpoints.map(b => parseFloat(b))
      this.$emit('breakpoints-changed', values)
    },

    handleAddRow(i: number) {
      const values = this.userBreakpoints.map(b => parseFloat(b))
      let midpoint

      if (i == 0) midpoint = values[i] / 2
      else if (i == values.length) midpoint = values[i] + 1
      else midpoint = values[i - 1] / 2 + values[i] / 2
      if (!midpoint) midpoint = values[i]

      values.splice(i, 0, midpoint)
      this.$emit('breakpoints-changed', values)
    },

    handleEntry() {
      console.log('CHANGE!')
      const values = this.userBreakpoints.map(b => parseFloat(b))
      // only register change if values are all in ascending order (user will have to fix red squigglies)
      if (values.every((v, i) => i == 0 || v > values[i - 1])) {
        console.log('SEND IT!')
        this.$emit('breakpoints-changed', values)
      }
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
            label = [`${precise(breakpoints[i - 1], 4)}`, '—', `${precise(breakpoints[i], 4)}`]
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
.legend-colors {
  margin-right: 0.25rem;
}

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
