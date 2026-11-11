<template lang="pug">
.summary-chart
  .summary-title {{ weighted ? $t('populationChartTitle') : $t('cellChartTitle') }}
  VuePlotly(:data="traces" :layout="layout" :options="options")
  //- with a diff: which line is which. Below the chart, wrapping in the narrow panel
  .summary-legend(v-if="series.length > 1")
    .legend-item(v-for="s in series" :key="s.key")
      span.legend-swatch(:style="{background: s.color}")
      span.legend-label {{ s.label }}
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

/**
 * Line colors: the value, or with a diff its two sides. Categorical slots 1-2 (blue,
 * orange), stepped separately for each theme's panel background and checked for
 * color-blind separation.
 */
const LINE_COLORS = {
  light: ['#2a78d6', '#eb6834'],
  dark: ['#3987e5', '#d95926'],
}

const i18n = {
  messages: {
    en: {
      populationShare: 'Share of population',
      cellShare: 'Share of cells',
      value: 'Value',
      populationChartTitle: 'Cumulative % of population by value',
      cellChartTitle: 'Cumulative % of cells by value',
    },
    de: {
      populationShare: 'Bevölkerungsanteil',
      cellShare: 'Anteil der Zellen',
      value: 'Wert',
      populationChartTitle: 'Kumulierter Anteil (%) der Bevölkerung nach Wert',
      cellChartTitle: 'Kumulierter Anteil (%) der Zellen nach Wert',
    },
  },
}

/** one line on the chart */
interface ChartSeries {
  key: string
  label: string
  color: string
  values: Float32Array
  shares: Float32Array
}

/** just the plotted arrays of a distribution */
function pick(d: { values: Float32Array; shares: Float32Array }) {
  return { values: d.values, shares: d.shares }
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

    /**
     * One line, or with a diff its two sides: the data columns and what they are compared
     * to. The sides only come along when the worker has a diff to split.
     */
    series(): ChartSeries[] {
      const d = this.distribution
      if (!d) return []

      const colors = LINE_COLORS[this.$store.state.isDarkMode ? 'dark' : 'light']
      const sides = this.secondColumn ? d.sides || [] : []
      if (sides.length < 2) {
        return [{ key: 'value', label: this.column, color: colors[0], ...pick(d) }]
      }
      return [
        { key: 'data', label: this.column, color: colors[0], ...pick(sides[0]) },
        { key: 'compare', label: this.secondColumn, color: colors[1], ...pick(sides[1]) },
      ]
    },

    traces(): any[] {
      const several = this.series.length > 1
      return markRaw(
        this.series.map(s => ({
          x: s.values,
          y: s.shares,
          name: s.label,
          type: 'scatter',
          mode: 'lines',
          line: { shape: 'hv', color: s.color, width: 2 },
          // with several lines, plotly's side box names the line under the cursor
          hovertemplate: '%{x:.3~g}<br>%{y:.1%}' + (several ? '' : '<extra></extra>'),
        }))
      )
    },

    layout(): any {
      // with several lines the legend names them, so the axis is just values.
      // Otherwise the panel is narrow: two lines for a diff
      let column = this.column
      if (this.series.length > 1) column = `${this.$t('value')}`
      else if (this.secondColumn) column = `${this.column} −<br>${this.secondColumn}`
      const unit = this.unit ? ` (${this.unit})` : ''
      const isDark = this.$store.state.isDarkMode
      const gridcolor = isDark ? '#444444' : '#e4e4e4'
      const zerolinecolor = isDark ? '#777777' : '#aaaaaa'

      // fixed to the data: a threshold line outside it would otherwise stretch the axis.
      // values are sorted, so each line's ends are its min and max
      let min = Number.POSITIVE_INFINITY
      let max = Number.NEGATIVE_INFINITY
      for (const { values } of this.series) {
        if (!values.length) continue
        min = Math.min(min, values[0])
        max = Math.max(max, values[values.length - 1])
      }
      if (min > max) min = max = 0
      const pad = (max - min) * 0.02

      return {
        width: Math.max(0, this.width),
        height: 220,
        // room above the plot so the 100% label isn't clipped
        margin: { t: 16, b: 0, l: 0, r: 8, pad: 2 },
        // the threshold is in the units of what the map shows. With a diff the lines are
        // its two sides, not the difference, so the threshold has no place on this axis
        shapes:
          this.series.length > 1
            ? []
            : [
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

.summary-legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.15rem 0.75rem;
  margin-top: 0.4rem;
  font-size: 0.75rem;
  color: var(--text);
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

// a short stroke, like the lines it names
.legend-swatch {
  width: 14px;
  height: 2px;
  border-radius: 1px;
  flex-shrink: 0;
}

.summary-title {
  font-size: 0.8rem;
  font-weight: bold;
  text-align: center;
  line-height: 1.2;
  margin: 0.25rem 0;
}
</style>
