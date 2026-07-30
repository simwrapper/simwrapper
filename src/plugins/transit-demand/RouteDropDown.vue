<template lang="pug">
.route-dropdown.flex-col(:class="{'is-open' : isOpen}")

  .title-panel.flex-row
      .leftside.flex-row.flex1(@click.prevent="toggleCheck")
        .mode-color-strip
        o-checkbox.fade(
            :modelValue="lineCheckActive"
            size="small"
            :class="{faded: isPartial}"
        )
        .text-area.flex-col
          .line-title(v-if="!line.name") {{ line.id }}
          .line-title.flex-row(v-else) {{ line.name}}
            .span(style="font-weight: normal") &nbsp;&nbsp;/&nbsp; {{ line.id }}

          .metrics.flex-row
            .stat {{ stats.departures }} deps
            .stat(v-if="stats.pax") {{ stats.pax }} pax
            .stat(v-if="stats.loadfac") {{ stats.loadfac.toFixed(3) }} Lfac
            //- .stat(v-if="stats.cap") {{ stats.cap }} cap

      .rightside.flex-row
          a.card-header-icon(@click="toggleOpen")
            font-awesome-icon.icon-reveal(:icon="isOpen ? 'chevron-down' : 'chevron-up'")


  .card-details.flex-col(v-if="isOpen")
    .route.flex-row(v-for="route in line.transitRoutes" :key="route.id")
      .stuff.flex-col
        o-checkbox.route-checkbox(:modelValue="!!checkStates[route.id]" size="small"
          @update:modelValue="value => toggleRoute(route.id, value)"
        )
          .route-title {{ route.id}}
        .service-period {{ route.firstDeparture }} — {{ route.lastDeparture }}
        .detail.flex-row
          .deps Deps: {{ route.departures }}
          .deps.clink(v-if="route.pax") Pax: {{ route.pax }}
          .deps.clink(v-if="route.pax") Lfac: {{ route.loadfac.toFixed(3) }}
          .deps.clink(v-if="route.cap") Cap: {{ route.cap }}
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { RouteDetails } from './Interfaces'

enum CheckState {
  NONE,
  FADED,
  ALL,
}

// CHECKBOX.
// Bright: checked / all routes selected
// Faded: checked / some routes selected
// Empty: no routes selected

export default defineComponent({
  name: 'RouteDropdown',
  components: {},
  props: {
    source: { type: Object, required: true },
    index: { type: Number, required: true },
    selectedRoutes: { type: Array, required: true },
    searchTerm: { type: String, required: true },
    activeTransitLines: { type: Object, required: true },
    color: String,
    cbToggleLineOpen: { type: Function, required: true },
    cbToggleLineChecked: { type: Function, required: true },
    cbToggleRouteChecked: { type: Function, required: true },
  },

  data() {
    return {
      lineCheck: CheckState.NONE,
      isChecked: false,
      isOpen: false,
      isPartial: false,
      checkStates: {} as any,
      stats: { departures: 0, pax: 0, loadfac: 0 },
    }
  },

  mounted() {
    this.isPartial = false
    this.isChecked = this.line.checked
    this.isOpen = this.line.isOpen
    this.selectedRoutes.forEach((id: any) => (this.checkStates[id] = true))

    for (const route of this.line.transitRoutes) {
      if (route.departures) this.stats.departures += route.departures
      if (route.pax) this.stats.pax += route.pax
      if (route.loadfac) this.stats.loadfac += route.loadfac
    }
    this.stats.loadfac = 0.001 * Math.round(1000 * this.stats.loadfac)
    this.setRouteCheckmarks()
  },

  computed: {
    lineCheckActive() {
      return this.lineCheck !== CheckState.NONE
    },

    line() {
      return this.source
    },
  },

  watch: {
    activeTransitLines() {
      // ridership data
      if (this.line.id in this.activeTransitLines) {
        this.stats = this.activeTransitLines[this.line.id].stats
      }
    },

    selectedRoutes() {
      this.setRouteCheckmarks()
      // if empty, uncheck main box
      if (!this.selectedRoutes.length) this.isChecked = false
    },
  },

  methods: {
    setRouteCheckmarks() {
      let numChecked = 0
      this.isPartial = false
      this.checkStates = {}
      this.line.transitRoutes.forEach((route: RouteDetails) => {
        if (this.selectedRoutes.indexOf(route.id) > -1) {
          this.checkStates[route.id] = true
          numChecked++
        }
      })
      // activate main checkbox if ALL subroutes are clicked
      this.lineCheck = CheckState.NONE
      if (numChecked && numChecked == this.line.transitRoutes.length) {
        this.isChecked = true
        this.lineCheck = CheckState.ALL
      }
      if (numChecked && numChecked < this.line.transitRoutes.length) {
        this.lineCheck = CheckState.FADED
        this.isPartial = true
      }
    },

    toggleCheck() {
      this.isChecked = !this.isChecked
      this.cbToggleLineChecked({ offset: this.line.offset, isChecked: this.isChecked })
    },
    toggleOpen() {
      this.isOpen = !this.isOpen
      this.setRouteCheckmarks()
      this.cbToggleLineOpen({ offset: this.line.offset, isOpen: this.isOpen })
    },
    toggleRoute(id: string, isChecked: boolean) {
      // o-checkbox is bound one-way; we own the checkmark state
      this.checkStates[id] = isChecked
      this.cbToggleRouteChecked({
        route: id,
        offset: this.line.offset,
        isChecked,
      })
    },
  },
})
</script>

<style scoped lang="scss">
.route-dropdown {
  cursor: auto;
  user-select: none;
  margin: 2px 4px 3px 0px;
  background-color: var(--bgCardFrame2);
  border: 1px solid #00000000;
  z-index: 5;
}

.leftside {
  cursor: pointer;

  // The line checkbox only *displays* `lineCheckActive` -- the whole row is the click
  // target, via `@click.prevent` above. Letting the input take the click means the browser
  // toggles it on pre-click activation and the preventDefault then rolls that toggle back,
  // so it never showed a checkmark even though the click registered. Making the control
  // inert routes every click to .leftside, which is what the one-way binding assumes.
  // (`.checkbox` is theme-bulma's root class; our own class lands on the inner input.)
  :deep(.checkbox) {
    pointer-events: none;
  }
}

.is-open {
  border: 1px solid var(--bgHover2);
}

.title-panel {
  display: flex;
  padding: 0px 0px 2px 0px;
}

.line-title {
  font-weight: bold;
  font-size: 0.9rem;
  padding-top: 2px;
  color: var(--link);
  width: max-content;
}

.mode-color-strip {
  width: 2px;
  height: 8px;
  background-color: #76353500;
  // 2px strip + 8px == the 10px .text-area gets on the other side of the checkbox
  margin: auto 8px auto 0px;
}

.text-area {
  margin-left: 10px;
}

.metrics {
  gap: 5px;
  line-height: 0.8rem;
  font-size: 0.9rem;
  width: max-content;
}

.icon-reveal {
  border: 1px solid #80808060;
  border-radius: 4px;
  // sizes the whole control: the svg is 1em, and padding+border add 12x10 around it
  font-size: 12px;
  padding: 3px 3px;
  margin: auto 6px auto 0;
}

.icon-reveal:hover {
  border: 1px solid #808080aa;
}

.card-details {
  border-top: 1px solid #88888844;
  margin: 2px 0.5rem 0.25rem 12px;
  padding: 0.5rem 0;
  font-size: 0.9rem;
}

.route-title {
  margin-left: 5px;
  font-size: 0.9rem !important;
  line-height: 18px;
  font-weight: bold;
  // color: var(--textBold);
}
// Oruga forwards a class to the checkbox's inner <input>, which never carries
// the scope id -- so these two need :deep() to match at all.
:deep(.route-checkbox):hover {
  // font-weight: bold !important;
  color: var(--textBold) !important;
}

.detail {
  gap: 0.75rem;
  margin-left: 25px;
  margin-bottom: 0.5rem;
}

.route {
  line-height: 1rem;
}

.service-period {
  margin-left: 25px;
}

.clink {
  color: var(--link);
}

:deep(.faded) {
  filter: grayscale(100%) brightness(130%);
}
</style>
