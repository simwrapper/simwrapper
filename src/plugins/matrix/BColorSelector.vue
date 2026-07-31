<template lang="pug">
.b-color-selector.flex-row
  //- COLOR RAMP SELECTOR ----------------
  o-dropdown(selectable @change="$emit('change', $event)"
    :scrollable="true" :maxHeight="400"
  )
      template(#trigger="{active}")
        o-button.btn-selected-color(size="small")
          .flex-row
            span {{ colormap }}
            canvas.swatch(ref="swatch" width="32" height="16")
            i.fa(:class="active ? 'fa-caret-up' : 'fa-caret-down'" style="margin-left: 0.4rem")

      o-dropdown-item.my-b-item.is-link(v-for="color,i in colorOptions" :key="i"
        :value="color.color ? color.color : color.title"
        :clickable="!!color.color"
        :class="{'is-color-group': !!color.title}"
      )
        .flex-row
          span.flex1 {{ color.color ? color.color  : color.title }}
          //- Vue 3 does not build $refs arrays from a v-for, so collect these by hand
          canvas.swatch(v-if="color.color" :ref="el => setSwatchRef(i, el)" width="32" height="16")

  //- INVERTER ----------------------------
  o-button(size="small"
    :variant="inverted ? 'info' : ''"
    @click="$emit('change')"
  )
    i.fa.fa-retweet
    span &nbsp;&nbsp;Invert

  //- SCALE SELECTOR --------------------
  o-dropdown(selectable @change="$emit('changeScale', $event)"
    position="bottom-left"
  )
      template(#trigger="{active}")
        o-button(size="small")
          i.fa.fa-signal
          span &nbsp;&nbsp;{{ scaleOptions[selectedScale].text }}
          i.fa(:class="active ? 'fa-caret-up' : 'fa-caret-down'" style="margin-left: 0.4rem")

      o-dropdown-item(v-for="sc in scaleKeys" :key="sc"
        :value="sc"
      ) {{ scaleOptions[sc].text + scaleOptions[sc].hint }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { COLORMAP_GROUPS, INTERPOLATORS } from './interpolators'

const colorOptions = [] as { title?: string; color?: string }[]
for (const group of Object.keys(COLORMAP_GROUPS)) {
  colorOptions.push({ title: group })
  const colors = COLORMAP_GROUPS[group]
  colors.forEach(c => {
    colorOptions.push({ color: c })
  })
}

const scales = {
  linear: { text: 'Linear', hint: '' },
  log: { text: 'Log', hint: ' (+ values only)' },
  symlog: { text: 'SymLog', hint: ' (+/- values)' },
  sqrt: { text: 'Sqr Root', hint: '' },
}

const MyComponent = defineComponent({
  name: 'BColorSelector',
  components: {},
  emits: ['change', 'changeScale'],
  props: {
    value: String,
    invert: Boolean,
    scale: String,
  },
  data() {
    return {
      colorGroups: Object.keys(COLORMAP_GROUPS),
      colorOptions,
      colormap: 'Viridis',
      selectedScale: 'linear',
      inverted: false,
      scaleOptions: scales,
    }
  },

  computed: {
    scaleKeys() {
      return Object.keys(this.scaleOptions)
    },
  },

  mounted() {
    this.colormap = this.value || 'Turbo'
    this.inverted = this.invert
    this.selectedScale = this.scale || 'linear'
    // the big swatch on the trigger button is always in the DOM; the per-option ones
    // are drawn from setSwatchRef() as the dropdown menu mounts them.
    this.drawSwatch(this.$refs.swatch, this.colormap)
  },

  watch: {
    value() {
      this.colormap = this.value || 'Turbo'
      this.drawSwatch(this.$refs.swatch, this.colormap)
    },
    invert() {
      this.inverted = this.invert
    },
    scale() {
      this.selectedScale = this.scale || 'linear'
    },
  },
  methods: {
    // Vue 3 dropped the "refs inside v-for become an array" behavior, and a dynamic
    // string ref name never worked there anyway. A function ref fires on mount and on
    // unmount (with null), which also covers Oruga rendering the menu lazily.
    setSwatchRef(i: number, el: any) {
      if (!el) return
      const color = this.colorOptions[i]?.color
      if (color) this.drawSwatch(el, color)
    },

    drawSwatch(canvas: any, color: string) {
      if (!canvas?.getContext) return
      //@ts-ignore
      const interpolator = INTERPOLATORS[color]
      if (!interpolator) return
      const ctx = canvas.getContext('2d') as any
      for (let x = 0; x < canvas.width; x++) {
        ctx.fillStyle = interpolator(x / canvas.width)
        ctx.fillRect(x, 0, 1, canvas.height)
      }
    },
  },
})
export default MyComponent
</script>

<style scoped lang="scss">
$bgBeige: #636a67;
$bgLightGreen: #d2e4c9;
$bgLightCyan: #effaf6;
$bgDarkerCyan: #def3ec;

.b-color-selector {
  gap: 1rem;
}

.comparison-selector {
  margin-top: 1px;
  display: flex;
  flex-direction: row;
}

.fa-layer-group {
  padding: 8px 8px 8px 0;
}

.diffFile {
  margin-bottom: -4px;
}

.divider {
  padding: 0;
  margin: 0;
}

.dropdown-item {
  padding-inline-end: 1rem !important;
}

.is-color-group {
  text-transform: uppercase;
  font-weight: bold;
  color: #196096;
  cursor: default;
  pointer-events: none;
  margin: 0.25rem 0;
}

.btn-selected-color {
  position: relative;
  display: flex;
  flex-direction: row;
  height: 28px;
  margin-top: -1px;
  padding: 0px 10px;
}
.swatch {
  margin-left: 0.5rem;
}
</style>
