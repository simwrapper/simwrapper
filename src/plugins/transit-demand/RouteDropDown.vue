<template lang="pug">
.route-dropdown.flex-col

  .title-panel.flex-row(@click="toggleOpen")
      .rightside.flex-row
          a.card-header-icon
            b-icon(:icon="isOpen ? 'menu-down' : 'menu-up'")
          .mode-color-strip

      .leftside.flex-row.flex1
        b-checkbox(v-model="isChecked" size="is-small")
        .text-area.flex-col
          .line-title {{ line.id }}
          .metrics.flex-row
            .stat hi
            //- .stat {{ line.stats.departures }} dep
            //- .stat(v-if="cfDemand1") {{ line.stats.pax }} pax
            //- .stat(v-if="cfDemand1") {{ line.stats.cap }} cap

  .card-details.flex-col(v-if="isOpen")
    .route(v-for="route in line.transitRoutes" :key="route.id")
      .route-title {{ route.id}}

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
  name: 'RouteDropdown',
  components: {},
  props: {
    line: Object,
    isChecked: Boolean,
    color: String,
  },

  data() {
    return {
      isOpen: false,
    }
  },

  mounted() {
    console.log(this.line)
  },
  computed: {},
  methods: {
    toggleOpen() {
      console.log('here')
      this.isOpen = !this.isOpen
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.route-dropdown {
  user-select: none;
  margin: 3px 4px 3px 0px;
  background-color: var(--bgPanel2);
  z-index: 5;
}

.title-panel {
  display: flex;
  flex-direction: row-reverse;
  padding: 0px 0px 0px 8px;
}

.line-title {
  font-weight: bold;
  font-size: 1.1rem;
  padding-top: 2px;
}

.mode-color-strip {
  width: 2px;
  background-color: red;
}

.metrics {
  gap: 5px;
  line-height: 0.8rem;
}

.card-details {
  background-color: var(--bgCardFrame2);
}
</style>
