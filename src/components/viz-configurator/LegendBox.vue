<template lang="pug">
.legend-box(v-if="sections.length")
  h4 Legend
  .legend-section(v-for="section,i in sections" :key="`${section.section}${i}`")
    p(:style="{marginBottom: '0.25rem', marginTop: i ? '1rem':''}"): b {{ sectionTitle(section) }}
    .section-row(v-for="row,i of getRowsInSection(section)" :key="i")
      .row-value(:style="getRowStyle(row)")
      .row-label(:style="getLabelStyle(row)") {{ getRowLabel(row) }}
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import LegendStore, { LegendSection } from '@/js/LegendStore'

export default defineComponent({
  name: 'LegendBox',
  props: {
    legendStore: { type: Object as PropType<LegendStore>, required: true },
  },
  data: () => {
    return {}
  },
  beforeDestroy() {
    this.legendStore.clear()
  },
  computed: {
    sections(): any {
      return this.legendStore.state.sections
    },
  },
  methods: {
    sectionTitle(section: LegendSection) {
      let title = section.column

      if (section.normalColumn) title += ` / ${section.normalColumn}`

      if (section.relative) {
        title += ' (% Diff)'
      } else if (section.diff) {
        title += ' (Diff)'
      }

      return title
    },

    getRowsInSection(section: LegendSection) {
      if (!section) return

      const z = section.values.filter((f: any) => !Number.isNaN(f.label))
      return z
    },

    getRowLabel(row: { label: string; value: any }) {
      return row.label // || row.value // no label -> it's a line width
    },

    getRowStyle(row: { label: string; value: any }) {
      if (Array.isArray(row.value)) {
        // it's a 3-color
        const backgroundColor = `rgb(${row.value[0]},${row.value[1]},${row.value[2]})`
        const style = {
          backgroundColor,
          width: '1rem',
          height: '1rem',
          border: '1px solid #88888844',
          // lineHeight: '14px',
        }
        return style
      } else {
        const style = {
          backgroundColor: '#779',
          width: '2rem',
          height: `${row.value / 2}px`,
          margin: 'auto 0 4px 0',
        }
        return style
      }
      return {}
    },

    getLabelStyle(row: { label: string; value: any }) {
      if (Array.isArray(row.value)) {
        // colors
        return {
          marginLeft: '4px',
        }
      } else {
        // widths
        return {
          display: 'flex',
          flexDirection: 'column-reverse',
          marginLeft: '4px',
          marginBottom: '-2px',
        }
      }
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.legend-box {
  font-size: 0.85rem;
  padding: 0.5rem 0.25rem;
  color: var(--text);
  background-color: var(--bgCardFrame);

  h4 {
    font-weight: bold;
    margin: -0.25rem 0 1rem 0;
    padding-top: 0;
    line-height: 1rem;
    text-transform: uppercase;
  }
}

.legend-section {
  width: max-content;
}

.section-row {
  display: flex;
  flex-direction: row;
}

b {
  font-size: 1rem;
  line-height: 1rem;
}
</style>
