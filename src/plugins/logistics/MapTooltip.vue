<template lang="pug">
.flex-col(v-if="tooltipType")

  //- ACTIVITY
  .tooltip(v-if="tooltipType == 1")
    table(style="max-width: 30rem; font-size: 0.8rem"): tbody
      tr
        td(style="text-align: right; padding-right: 0.5rem; padding-top: 0.2rem;") {{ activity }}:
        td(style="padding-top: 0.2rem") {{ hoverInfo.object.shipmentIds.join(', ') }}

  //- SERVICE
  .tooltip.flex-col(v-if="tooltipType == 2")
    b {{ hoverInfo.object?.$id }}
    h5(style="padding-top: 0.2rem") Capacity Demand: {{hoverInfo.object.$capacityDemand }}

  //- LEG
  .tooltip.flex-col(v-if="tooltipType == 3")
    b {{hoverInfo.object?.tour?.vehicleId}}
    p Leg # {{1 + hoverInfo.object?.count}}
    p Shipments on board: {{hoverInfo.object?.shipmentsOnBoard?.length}}
    p Total size: {{hoverInfo.object?.totalSize }}

  //- STOP
  .tooltip.flex-col(v-if="tooltipType == 4")
    table(style="font-size: 0.8rem"): tbody
      tr(v-for="a in Object.keys(stop.overview)" :key="a")
        td(style="text-align: right; padding-right: 0.5rem") {{a}}:
        td: b {{ stop.overview[a] }}
      tr(v-for="b in Object.keys(stop.numPickupsAndDeliveries == 1 ? hoverInfo.object.details : [])" :key="b")
        td(style="text-align: right; padding-right: 0.5rem; padding-top: 0.2rem") {{ b.slice(1) }}:
        td(style="padding-top: 0.2rem") {{ hoverInfo.object.details[a] }}

  //- TOUR
  .tooltip.flex-col(v-if="tooltipType == 5")
    b Vehicle Id: {{hoverInfo.object?.tour.vehicleId}}
    p Tour Id: {{hoverInfo.object?.tour.tourId}}

  //- HUB
  .tooltip.flex-col(v-if="tooltipType == 6")
      b Hub Id: {{hubInfo?.hubId}}
      p Total Shipments: {{hubInfo?.shipmentTotal}}

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
  TOUR = 5,
  HUB = 6,
}

export default defineComponent({
  name: 'MapTooltip',
  components: {},
  props: {
    hoverInfo: { type: Object as PropType<TooltipData>, required: true },
    totalShipmentsPerHub: { type: Array as PropType<any[]>, required: true },
  },

  data() {
    return {
      tooltipType: TooltipType.NONE,
      activity: '',
      stop: {} as any,
      hubInfo: {} as any,
    }
  },

  watch: {
    hoverInfo() {
      this.renderTooltip(this.hoverInfo)
    },
  },

  methods: {
    renderTooltip(hoverInfo: any) {
      this.tooltipType = TooltipType.NONE

      const { object } = hoverInfo
      if (!object) return null

      if (object?.type == 'pickup') return this.renderActivityTooltip(hoverInfo, 'pickup')
      if (object?.type == 'delivery') return this.renderActivityTooltip(hoverInfo, 'delivery')
      if (object?.type == 'leg') return this.renderTourTooltip(hoverInfo)
      if (object?.color) return this.renderLegTooltip(hoverInfo)
      if (object?.label == 'Depot' || (object?.locationX && object?.locationY))
        return this.renderHubInfo(hoverInfo)
      if (object?.tour) return this.renderStopTooltip(hoverInfo)
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

    renderTourTooltip(hoverInfo: any) {
      this.tooltipType = TooltipType.TOUR
    },

    renderHubInfo(hoverInfo: any) {
      this.tooltipType = TooltipType.HUB
      const { object, x, y } = hoverInfo

      this.hubInfo = this.totalShipmentsPerHub.find(obj => obj.hubId === object?.id)

      // Hub Id: {hubInfo?.hubId} <br />
      // Total Shipments: {hubInfo?.shipmentTotal} <br />
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
  background-color: var(--bgPanel);
  color: var(--text);
  padding: 0.5rem 0.5rem;
  position: 'absolute';
  font-size: 0.9rem;
  line-height: 1.3rem;
  filter: drop-shadow(2px 4px 6px #0004);
  top: 0;
  left: 0;
}
</style>
