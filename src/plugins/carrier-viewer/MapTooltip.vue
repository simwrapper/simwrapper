<template lang="pug">
.flex-col(v-if="tooltipType")
  .tooltip(v-if="tooltipType == 1")
    table(style="max-width: 30rem; font-size: 0.8rem"): tbody
      tr
        td(style="text-align: right; padding-right: 0.5rem; padding-top: 0.2rem;") {{ activity }}:
        td(style="padding-top: 0.2rem") {{ hoverInfo.object.shipmentIds.join(', ') }}

  .tooltip.flex-col(v-if="tooltipType == 2")
    b {{ hoverInfo.object?.$id }}
    h5(style="padding-top: 0.2rem") Capacity Demand: {{hoverInfo.object.$capacityDemand }}

  .tooltip.flex-col(v-if="tooltipType == 3")
    b {{hoverInfo.object?.tour?.vehicleId}}
    p Leg # {{1 + hoverInfo.object?.count}}
    p Shipments on board: {{hoverInfo.object?.shipmentsOnBoard?.length}}
    p Total size: {{hoverInfo.object?.totalSize }}

  .tooltip.flex-col(v-if="tooltipType == 4")
    table(style="font-size: 0.8rem"): tbody
      tr(v-for="a in Object.keys(stop.overview)" :key="a")
        td(style="text-align: right; padding-right: 0.5rem") {{a}}:
        td: b {{ stop.overview[a] }}
      tr(v-for="b in Object.keys(stop.numPickupsAndDeliveries == 1 ? hoverInfo.object.details : [])" :key="b")
        td(style="text-align: right; padding-right: 0.5rem; padding-top: 0.2rem") {{ b.slice(1) }}:
        td(style="padding-top: 0.2rem") {{ hoverInfo.object.details[a] }}

</template>

<script lang="ts">
import { defineComponent, PropType } from 'vue'

interface TooltipData {
  x: number
  y: number
  object: { type: string }
}

enum TooltipType {
  NONE = 0,
  ACTIVITY = 1,
  SERVICE = 2,
  LEG = 3,
  STOP = 4,
}

export default defineComponent({
  name: 'MapTooltip',
  components: {},

  props: {
    hoverInfo: { type: Object as PropType<TooltipData>, required: true },
  },

  data() {
    return {
      tooltipType: TooltipType.NONE,
      activity: '',
      stop: {} as any,
    }
  },

  watch: {
    hoverInfo() {
      this.renderTooltip(this.hoverInfo)
    },
  },

  methods: {
    renderTooltip(hoverInfo: any) {
      console.log({ hoverInfo })
      this.tooltipType = TooltipType.NONE

      const { object } = hoverInfo
      if (!object) return null

      if (object?.type == 'pickup') return this.renderActivityTooltip(hoverInfo, 'pickup')
      if (object?.type == 'delivery') return this.renderActivityTooltip(hoverInfo, 'delivery')
      if (object?.type == 'service') return this.renderServicesTooltip(hoverInfo, 'service')
      if (object?.color) return this.renderLegTooltip(hoverInfo)
      if (object?.type == 'depot') return null
      return this.renderStopTooltip(hoverInfo)
    },

    renderActivityTooltip(hoverInfo: TooltipData, activity: string) {
      this.tooltipType = TooltipType.ACTIVITY
      this.activity = activity
    },

    renderServicesTooltip(hoverInfo: any, activity: string) {
      this.tooltipType = TooltipType.SERVICE
    },

    renderLegTooltip(hoverInfo: any) {
      this.tooltipType = TooltipType.LEG
    },

    renderStopTooltip(hoverInfo: any) {
      this.tooltipType = TooltipType.SERVICE
      const { object, x, y } = hoverInfo

      // collect some info
      const visits = object.visits.length
      const pickups = object.visits.reduce(
        (prev: number, visit: any) => prev + visit.pickup.length,
        0
      )
      const deliveries = object.visits.reduce(
        (prev: number, visit: any) => prev + visit.delivery.length,
        0
      )

      this.stop = {
        numPickupsAndDeliveries: pickups + deliveries,
        overview: { visits, pickups, deliveries },
      }
    },
  },
})
</script>

<style lang="scss">
.tooltip {
  background-color: '#334455ee';
  box-shadow: '2.5px 2px 4px rgba(0,0,0,0.25)';
  color: '#eee';
  padding: '0.5rem 0.5rem';
  position: 'absolute';
  opacity: 0.9;
  // left: x + 20,
  // top: y + 20,
}
</style>
