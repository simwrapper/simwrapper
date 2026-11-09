<template lang="pug">
.summary-chart
  .summary-title {{ weighted ? $t('populationChartTitle') : $t('cellChartTitle') }}
  VuePlotly(:data="traces" :layout="layout" :options="options")
</template>

<script lang="ts">
/**
 * Cumulative share of population (or of cells) by value, for the grid map's right panel.
 * The grid map's worker calculates the distribution; this only draws it.
 */
import { defineComponent, markRaw } from 'vue'
import type { PropType } from 'vue'

import { UI_FONT } from '@/Globals'
import VuePlotly from '@/components/VuePlotly.vue'
import type { CumulativeShare } from './GridMap.worker'

/** the threshold slider's position is marked with a vertical line in this color */
const THRESHOLD_LINE_COLOR = '#f5c400'

const i18n = {
  messages: {
    en: {
      populationShare: 'Share of population',
      cellShare: 'Share of cells',
      populationChartTitle: 'Cumulative % of population attaining accessibility level',
      cellChartTitle: 'Cumulative % of cells attaining accessibility level',
    },
    de: {
      populationShare: 'Bevölkerungsanteil',
      cellShare: 'Anteil der Zellen',
      populationChartTitle:
        'Kumulierter Anteil (%) der Bevölkerung, der das Erreichbarkeitsniveau erreicht',
      cellChartTitle: 'Kumulierter Anteil (%) der Zellen, die das Erreichbarkeitsniveau erreichen',
    },
  },
}

export default defineComponent({
  name: 'GridMapSummaryChart',
  i18n,
  components: { VuePlotly },

  props: {
    /** sorted values and their cumulative shares, from the worker; null until it answers */
    distribution: { type: Object as PropType<CumulativeShare | null>, default: null },
    /** value column on the x-axis */
    column: { type: String, required: true },
    /** with a diff, the column subtracted from it; otherwise empty */
    secondColumn: { type: String, default: '' },
    unit: { type: String, default: '' },
    /** threshold slider position, in the same unscaled units as the values */
    threshold: { type: Number, required: true },
    /** chart width in pixels */
    width: { type: Number, required: true },
  },

  data() {
    return {
      options: { displaylogo: false, displayModeBar: false, responsive: false },
    }
  },

  computed: {
    /** false if the population column was missing and every cell counted equally */
    weighted(): boolean {
      return this.distribution?.weighted ?? true
    },

    traces(): any[] {
      if (!this.distribution) return []
      return markRaw([
        {
          x: this.distribution.values,
          y: this.distribution.shares,
          type: 'scatter',
          mode: 'lines',
          line: { shape: 'hv', color: '#3498db', width: 2 },
          hovertemplate: '%{x:.3~g}<br>%{y:.1%}<extra></extra>',
        },
      ])
    },

    layout(): any {
      // the panel is narrow: two lines for a diff
      const column = this.secondColumn ? `${this.column} −<br>${this.secondColumn}` : this.column
      const unit = this.unit ? ` (${this.unit})` : ''
      const isDark = this.$store.state.isDarkMode
      const gridcolor = isDark ? '#444444' : '#e4e4e4'
      const zerolinecolor = isDark ? '#777777' : '#aaaaaa'

      // fixed to the data: a threshold line outside it would otherwise stretch the axis.
      // values are sorted, so the ends are the min and max
      const values = this.distribution?.values || []
      const min = values.length ? values[0] : 0
      const max = values.length ? values[values.length - 1] : 0
      const pad = (max - min) * 0.02

      return {
        width: Math.max(0, this.width),
        height: 220,
        // room above the plot so the 100% label isn't clipped
        margin: { t: 16, b: 0, l: 0, r: 8, pad: 2 },
        shapes: [
          {
            type: 'line',
            xref: 'x',
            yref: 'paper',
            x0: this.threshold,
            x1: this.threshold,
            y0: 0,
            y1: 1,
            line: { color: THRESHOLD_LINE_COLOR, width: 2 },
          },
        ],
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: {
          color: isDark ? '#cccccc' : '#444444',
          family: UI_FONT,
          size: 10,
        },
        showlegend: false,
        xaxis: {
          automargin: true,
          range: min < max ? [min - pad, max + pad] : undefined,
          gridcolor,
          zerolinecolor,
          title: { text: column + unit, standoff: 8 },
        },
        yaxis: {
          automargin: true,
          gridcolor,
          zerolinecolor,
          // a little past 100%, so that label and the top of the curve stay clear of the edge
          range: [0, 1.03],
          // every label from 0% to 100%, whatever the chart height
          tickmode: 'array',
          tickvals: [0, 0.2, 0.4, 0.6, 0.8, 1],
          tickformat: '.0%',
          title: {
            text: this.weighted ? this.$t('populationShare') : this.$t('cellShare'),
            standoff: 8,
          },
        },
      }
    },
  },
})
</script>

<style scoped lang="scss">
.summary-chart {
  flex: 0 0 auto;
  padding: 0.5rem 0rem;
}

.summary-title {
  font-size: 0.8rem;
  font-weight: bold;
  text-align: center;
  line-height: 1.2;
  margin: 0.25rem 0;
}
</style>
