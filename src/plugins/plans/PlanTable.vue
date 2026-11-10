<template lang="pug">
.plan-table(
  oncontextmenu="return false"
  :style="{bottom: `${bottomOffset}px`}"
)

  //- Two header rows, offset and interleaved so legs are legible
  table.plan-html-table
    thead
      tr
        th.header1 n
        th.header1(v-for="act in headersAct" colspan="2" :key="act") {{ act }}
      tr
        th.header2 &nbsp;
        th.header2 &nbsp;
        th.header2(v-for="leg,i in headersLeg" :key="leg" :colspan="i < headersAct.length-1 ? '2': '1'" ) {{ leg }}
    tbody(ref="rows")
      tr(v-for="row,i in plans" :key="i"
        :class="[i%2 ? 'is-leg': 'is-act', {'is-active': isActive(row), 'is-locked': row === lockedRow, 'is-map-hover': row === mapHoveredRow}]"
        @mouseenter="$emit('hover-row', row)"
        @mouseleave="$emit('hover-row', null)"
        @click="$emit('click-row', row)"
      )
        td.xcellvalue {{ i+1 }}
        td.xcellvalue(v-for="col in interleavedColumns" :key="col"
        ) {{ `${row[col] || ''}`.replaceAll(' ', '&nbsp;') }}
        //- td.xcellvalue {{ i+1 }}
        //- //- td(v-if="i%2") x&nbsp;
        //- td(v-if="i%2") &nbsp;
        //- td.xcellvalue(v-for="col in interleavedColumns.filter(c => !!row[c])" :key="col"
        //-   colspan="2"
        //- ) {{ `${row[col] || ''}`.replaceAll(' ', '&nbsp;') }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import globalStore from '@/store'
import type { Plan } from './PlansViewer.vue'
import { isActiveAt, timeWindow } from './planTime'

const PlanTable = defineComponent({
  name: 'PlanTable',
  i18n,
  components: {},

  props: {
    plans: { required: true, type: Array as PropType<Plan[]> },
    // time slider position (seconds); 0 = no time filter, so nothing is highlighted
    currentTime: { type: Number, default: 0 },
    // px to keep clear at the bottom of the map, e.g. for the time slider
    bottomOffset: { type: Number, default: 0 },
    // the row whose map highlight is locked (clicked), to mark it in the table too
    lockedRow: { type: Object as PropType<Plan | null>, default: null },
    // the row whose leg/activity the mouse is over on the map: light it up and keep it in view
    mapHoveredRow: { type: Object as PropType<Plan | null>, default: null },
  },

  emits: ['hover-row', 'click-row'],

  data() {
    return {
      // legModeColors: Object.entries(LegModeColor),
      globalState: globalStore.state,
      headersAct: [] as string[],
      headersLeg: [] as string[],
      interleavedColumns: [] as string[],
    }
  },

  computed: {
    textColor() {
      const lightmode = {
        text: '#3498db',
        bg: '#eeeef480',
      }

      const darkmode = {
        text: 'white',
        bg: '#181518aa',
      }

      return this.globalState.isDarkMode ? darkmode : lightmode
    },
  },

  watch: {
    // 'globalState.isDarkMode'() {
    //   // this.updateLegendColors()
    // },

    // the map asked for a row: nothing to do if it isn't one of ours (or the mouse left)
    mapHoveredRow(row: Plan | null) {
      const i = row ? this.plans.indexOf(row) : -1
      if (i < 0) return
      this.$nextTick(() => {
        const el = (this.$refs.rows as HTMLElement | undefined)?.children[i]
        // 'nearest': only scrolls when the row isn't fully visible, then just far enough
        el?.scrollIntoView({ block: 'nearest' })
      })
    },
  },

  mounted() {
    // hi
    this.headersAct = this.calcHeadersAct()
    this.headersLeg = this.calcHeadersLeg()
    this.interleavedColumns = this.zip(this.headersAct, this.headersLeg)
    // console.log('INTERLE', this.interleavedColumns)
  },

  methods: {
    isActive(row: Plan) {
      return this.currentTime > 0 && isActiveAt(timeWindow(row), this.currentTime)
    },

    calcHeadersAct() {
      if (!this.plans.length) return []
      const actCols = Object.keys(this.plans[0]).filter(col => col.startsWith('activity_'))
      // .map(col => col.slice(9))
      // console.log(actCols)

      let cc = new Set(['activity_type', 'activity_end_time', ...actCols])
      const hide = ['activity_type_simple', 'activity_lon', 'activity_lat']
      hide.forEach(h => cc.delete(h))

      return [...cc.values()]
    },

    calcHeadersLeg() {
      if (!this.plans.length) return []
      const legCols = Object.keys(this.plans[0]).filter(
        col => col.startsWith('leg_') || col.startsWith('route_')
      )
      let cc = new Set([...legCols])
      const hide = ['route_text']
      hide.forEach(h => cc.delete(h))
      // route text at end
      cc.add('route_text')
      return [...cc.values()]
    },

    zip(a: any[], b: any[]) {
      const out = []
      for (let i = 0; i < Math.max(a.length, b.length); i++) {
        if (i < a.length) out.push(a[i])
        if (i < b.length) out.push(b[i])
      }
      return out
    },
  },
})

export default PlanTable
</script>

<style scoped lang="scss">
@use '@/variables' as *;

/* SCROLLBARS
   The emerging W3C standard is currently Firefox-only */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--bgBold) var(--bgPanel2);
}

/* And this works on Chrome/Edge/Safari */
*::-webkit-scrollbar {
  width: 10px;
}

.plan-table {
  font-size: 0.9rem;
  overflow: auto;
  // border: var(--borderThin);
  filter: drop-shadow(0px 3px 5px #00000033);
  z-index: 5;
}

.plan-html-table {
  background-color: var(--bgBold);
}

.header1 {
  padding: 1px 4px;
  font-weight: bold;
  color: var(--text);
}

.header2 {
  color: $appTag;
  padding: 1px 4px;
  font-weight: bold;
}

.xcellvalue {
  color: var(--text);
  padding: 0px 4px;
  // font-weight: bold;
}

th {
  background: var(--bgPanel);
}
.is-leg {
  // background: var(--bgCream);
}

.is-act {
  background: var(--bgMapLand);
}

.is-leg .xcellvalue {
  color: $appTag;
  font-weight: bold;
}

// the activity/leg the person is at when the time slider is at currentTime
.is-active {
  background: rgba(255, 196, 0, 0.35);
}

// rows highlight their leg/activity on the map: hover lights it, click locks it
tbody tr {
  cursor: pointer;
}

tbody tr:hover {
  background: rgba(255, 255, 255, 0.28);
}

// more specific than `tbody tr:hover`, so a locked row keeps its stronger wash when hovered
tbody tr.is-locked {
  background: rgba(255, 255, 255, 0.45);
}

// the row hovered on the map: bluer than the white lock, so both stay readable together
tbody tr.is-map-hover {
  background: rgba(80, 170, 255, 0.5);
}

// keep room for the sticky two-row header when scrollIntoView aligns a row to the top
tbody tr {
  scroll-margin-top: 2.5rem;
}

thead {
  position: sticky;
  top: 0;
  z-index: 10;
  background-color: var(--bgBold);
  filter: drop-shadow(0px 2px 4px #00000020);
}
</style>
