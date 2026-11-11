<template lang="pug">
.my-tooltip.flex-col(v-if="lines")
  .tooltip.flex-col
    b {{ lines.title }}
    p {{ lines.detail }}
      span.tip-time(v-if="lines.time") {{ lines.time }}
</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'

import { tooltipLines, type HoverRow } from './planHover'

interface TooltipData {
  x: number
  y: number
  object?: { row?: HoverRow } | null
}

export default defineComponent({
  name: 'MapTooltip',

  props: {
    hoverInfo: { type: Object as PropType<TooltipData>, required: true },
  },

  computed: {
    // every hoverable leg and activity carries the plan-table row it was drawn from
    lines(): ReturnType<typeof tooltipLines> | null {
      const row = this.hoverInfo.object?.row
      return row ? tooltipLines(row) : null
    },
  },
})
</script>

<style lang="scss">
@use '@/variables' as *;
.my-tooltip {
  font-size: 0.9rem;
  filter: $filterShadow;
  padding: 2px 6px 3px 6px;
  background-color: var(--bgBold) !important;
}

.tooltip {
  color: var(--textBold);
  position: 'absolute';
  opacity: 0.9;
  white-space: nowrap;
}

.tip-time {
  margin-left: 0.75rem;
  font-variant-numeric: tabular-nums;
}
</style>
