<template lang="pug">
.route-dropdown.flex-col(v-show="visible" :class="{'is-open' : isOpen}")

  .title-panel.flex-row
      .leftside.flex-row.flex1(@click.prevent="toggleCheck")
        .mode-color-strip
        b-checkbox(v-model="isChecked" size="is-small")
        .text-area.flex-col
          .line-title {{ line.id }}
          .metrics.flex-row
            .stat {{ stats.departures }} deps
            .stat {{ stats.pax }} pax
            .stat {{ stats.loadfac }} loadfac

      .rightside.flex-row
          a.card-header-icon(@click="toggleOpen")
            b-icon.icon-reveal(size="is-small" :icon="isOpen ? 'menu-down' : 'menu-up'")


  .card-details.flex-col(v-if="isOpen")
    .route.flex-row(v-for="route in this.line.transitRoutes" :key="route.id")
      .stuff.flex-col
        b-checkbox.route-checkbox(v-model="checkStates[route.id]" size="is-small" @input="toggleRoute(route.id)")
          .route-title {{ route.id}}
        .service-period {{ route.firstDeparture }} — {{ route.lastDeparture }}
        .detail.flex-row
          .deps {{ route.departures }} deps
          .deps(v-if="route.pax") {{ route.pax }} pax
          .deps(v-if="route.loadfac") {{ route.loadfac }} loadfac
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
  name: 'RouteDropdown',
  components: {},
  props: {
    line: { type: Object, required: true },
    // routeData: { type: Object, required: true },
    selectedRoutes: { type: Array, required: true },
    searchTerm: { type: String, required: true },
    activeTransitLines: { type: Object, required: true },
    // {[id: string]: { id: string; routes: RouteDetails[]; isOpen: boolean; stats: any }}
    offset: Number,
    color: String,
  },

  data() {
    return {
      isOpen: false,
      isChecked: false,
      checkStates: {} as any,
      stats: { departures: 0, pax: 0, loadfac: 0 },
    }
  },

  mounted() {
    this.isChecked = this.line.checked
    this.selectedRoutes.forEach((id: any) => (this.checkStates[id] = true))

    for (const route of this.line.transitRoutes) {
      if (route.departures) this.stats.departures += route.departures
      if (route.pax) this.stats.pax += route.pax
      if (route.loadfac) this.stats.loadfac += route.loadfac
    }
  },

  computed: {
    visible(): boolean {
      if (!this.searchTerm) return true

      const idClean = this.line.id.toLocaleLowerCase().trim()
      if (idClean.includes(this.searchTerm)) return true
      return false
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
      // optimize - we don't care about route checkmarks if box is closed
      if (this.isOpen) this.setRouteCheckmarks()
      // if empty, uncheck main box
      if (!this.selectedRoutes.length) this.isChecked = false
    },
  },

  methods: {
    setRouteCheckmarks() {
      this.checkStates = {}
      this.selectedRoutes.forEach((id: any) => {
        this.checkStates[id] = true
      })
    },
    toggleCheck() {
      this.isChecked = !this.isChecked
      this.$emit('check', { offset: this.offset, isChecked: this.isChecked })
    },
    toggleOpen() {
      this.isOpen = !this.isOpen
      this.setRouteCheckmarks()
    },
    toggleRoute(id: string) {
      console.log('toggle route', id)
      this.$emit('toggleRoute', { route: id, isChecked: this.checkStates[id] })
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

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
}

.is-open {
  border: 1px solid var(--bgHover2);
}

.title-panel {
  display: flex;
  padding: 0px 0px 0px 0px;
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
  margin: auto 10px auto 0px;
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
  padding: 7px;
  font-size: 20px;
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
.route-checkbox:hover {
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
</style>
