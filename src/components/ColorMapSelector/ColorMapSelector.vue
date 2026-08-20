<template lang="pug">
.colormap-selector.flex-row
  .swatch(:style="{backgroundImage: gradient(value)}")

  o-select.picker(expanded size="small" v-model="selected")
    optgroup(v-for="group in Object.keys(groups)" :key="group" :label="group")
      option(v-for="name in groups[group]" :key="`${group}:${name}`" :value="name") {{ name }}

  button.invert(:class="{'is-inverted': invert}" title="Invert colors"
    @click="$emit('onInversionChange')"
  )
    i.fas.fa-random

</template>

<script lang="ts">
// Vue replacement for the React ColorMapSelector.tsx from h5web/app: same props and
// events, so consumers only change the import path. The React version is unbuildable
// here (no @deck.gl/react, no @visx/scale) -- see VUE3-MIGRATION.md.
import { defineComponent } from 'vue'

import { INTERPOLATORS } from './interpolators'
import { COLORMAP_GROUPS } from './groups'
import type { ColorMap } from './models'

// Sample the d3 interpolator to build a CSS gradient. utils.ts has getLinearGradient(),
// but importing it drags in three.js and ndarray for nothing.
const STEPS = [...Array(21).keys()].map(i => i / 20)

export default defineComponent({
  name: 'ColorMapSelector',
  props: {
    value: { type: String, required: true },
    invert: { type: Boolean, default: false },
  },
  emits: ['onValueChange', 'onInversionChange'],

  data() {
    return {
      groups: COLORMAP_GROUPS,
      selected: this.value,
    }
  },

  watch: {
    value() {
      this.selected = this.value
    },
    selected() {
      if (this.selected !== this.value) this.$emit('onValueChange', this.selected)
    },
  },

  methods: {
    gradient(colorMap: string): string {
      const interpolator = INTERPOLATORS[colorMap as ColorMap]
      if (!interpolator) return ''
      const stops = STEPS.map(t => interpolator(this.invert ? 1 - t : t))
      return `linear-gradient(to right, ${stops.join(', ')})`
    },
  },
})
</script>

<style scoped lang="scss">
.colormap-selector {
  align-items: center;
  gap: 0.25rem;
  padding: 0 3px;
}

.swatch {
  width: 3rem;
  height: 1.25rem;
  border: var(--borderFaint);
  border-radius: 3px;
}

.picker {
  min-width: 0;
}

.invert {
  border: var(--borderFaint);
  border-radius: 3px;
  background-color: var(--bgCardFrame2);
  color: var(--text);
  padding: 2px 6px;
  font-size: 0.8rem;
}

.invert:hover {
  cursor: pointer;
  color: var(--link);
}

.invert.is-inverted {
  color: var(--link);
  border-color: var(--link);
}
</style>
