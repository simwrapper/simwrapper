<template lang="pug">
    .time-slider(
      @mousemove.stop="dividerDragging"
      @mouseup="dividerDragEnd"
    )
    
      #hourlybar
        .bars
          .week(v-for="hourTotal,i in hourlyTotals.headwayPerHour" :style="{'height': `${getWeekHeight(hourTotal)}%`, 'background-color': activeHour==i ? '#7957d5' : '#e24986'}" @click="showHour(i)")
            .weektooltiptext {{ i + ":00" }}
    
        .labels(v-if="labels")
          .date-label(v-for="label in labels"
            :style="{left: `${label.leftPct}%`, right: `${label.rightPct}%`, color: isDarkMode ? '#C6C1B9' : '#363636'}"
          ) {{ label.text }}
    
    </template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

interface Label {
  leftPct: number
  text: string
}

export default defineComponent({
  name: 'TimeSlider',
  components: {},

  props: {
    numHours: Number,
    hourlyTotals: {
      type: Object, // Define it as a `Float32Array` (typed array)
      default: () => new Float32Array(0), // Return a default `Float32Array`
    },
    initial: {
      type: Array as () => number[],
      default: () => [],
    },
    labels: {
      type: Array as () => Label[],
      default: () => [],
    },
    isDarkMode: Boolean
  },

  data: () => {
    return {
      leftside: 0,
      rightside: 0,
      isDraggingDivider: 0,
      isDragHappening: false,
      dragStartWidth: 100,
      thumbLeft: 100,
      thumbWidth: 0,
      pctStart: 0,
      pctEnd: 1,
      selectedhour: 0,
      maxFlows: 1,
      side: '',
      activeHour: 0,
      useInitial: true,
    }
  },
  computed: {},
  watch: {
    hourlyTotals: function (newHourlyTotals, oldHourlyTotals) {
      this.updateHours()
    if (this.numHours) {
      this.getWeekHeight(this.numHours)
      this.activeHour = (this.numHours / 2)
    }else {
      this.activeHour = 0
    }
    this.showHour(this.activeHour)
    }
  },

  mounted() {
    this.rightside = this.numHours || 0
    this.updateHours()
    if (this.numHours) {
      this.activeHour = (this.numHours / 2)
    }else {
      this.activeHour = 0
    }
    this.showHour(this.activeHour)


    // initial extent
    const hourlybar = document.getElementById('hourlybar') as HTMLElement
    const totalWidth = hourlybar.clientWidth
    this.thumbLeft = Math.floor(this.initial[0] * totalWidth)
    this.thumbWidth = Math.ceil(totalWidth)

    const resizeObserver = new ResizeObserver(_ => {
      const hourlybar = document.getElementById('hourlybar') as HTMLElement
      const totalWidth = hourlybar.clientWidth

      let start = this.useInitial ? this.initial[0] : this.pctStart
      let end = this.useInitial ? this.initial[1] : this.pctEnd
      this.useInitial = false

      this.thumbLeft = Math.floor(start * totalWidth)
      this.thumbWidth = Math.ceil(totalWidth)
    })
    const timeSlider = document.getElementById('hourlybar')
    if (timeSlider) resizeObserver.observe(timeSlider)
  },

  methods: {
    updateHours() {
      this.maxFlows = Math.max(...this.hourlyTotals.headwayPerHour)
    },

    getWeekHeight(hourTotal: number) {
      const minHeight = 10; // Set a minimum height for bars in pixels
      const height = Math.max(minHeight, Math.floor((100 * hourTotal) / this.maxFlows))      
      return height
    },

    dividerDragStart(e: MouseEvent, side: string) {
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.thumbLeft
      this.side = side
    },

    dividerDragEnd(_: MouseEvent) {
      this.isDraggingDivider = 0
      this.side = ''
    },

    showHour(label: number) {
      this.selectedhour = label
      this.activeHour = label
      this.$emit('hourSelected', this.selectedhour)

    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      if (this.side == 'left') return this.adjustLeftSide(e)
      if (this.side == 'right') return this.adjustRightSide(e)

      const hourlybar = document.getElementById('hourlybar') as HTMLElement
      const totalWidth = hourlybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider
      this.thumbLeft = Math.max(0, this.dragStartWidth + deltaX)
      this.thumbLeft = Math.min(this.thumbLeft, totalWidth - this.thumbWidth)

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      // console.log(this.pctStart, this.pctEnd)
    },

    adjustLeftSide(e: MouseEvent) {
      const hourlybar = document.getElementById('hourlybar') as HTMLElement
      const totalWidth = hourlybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider // this.dragStartWidth - e.clientX

      const testLeft = this.thumbLeft + deltaX
      if (testLeft < 0) return
      if (testLeft >= this.thumbLeft + this.thumbWidth - 16) return

      this.isDraggingDivider += deltaX
      this.thumbLeft += deltaX
      this.thumbWidth -= deltaX

      this.thumbLeft = Math.max(0, this.thumbLeft)

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      console.log(this.pctStart, this.pctEnd)
      this.$emit('range', { start: this.pctStart, end: this.pctEnd })
    },

    adjustRightSide(e: MouseEvent) {
      const hourlybar = document.getElementById('hourlybar') as HTMLElement
      const totalWidth = hourlybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider // this.dragStartWidth - e.clientX

      const testWidth = this.thumbWidth + deltaX
      if (testWidth < 16) return
      if (this.thumbLeft + testWidth > totalWidth) return

      this.thumbWidth += deltaX
      this.isDraggingDivider = e.clientX

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      this.$emit('range', { start: this.pctStart, end: this.pctEnd })
    },

    sizerDragStart(e: MouseEvent) {
      console.log('dragStart', e)
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.thumbLeft
    },

    sizerDragEnd(_: MouseEvent) {
      this.isDraggingDivider = 0
    },

    sizerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return

      console.log('sizer', this.isDraggingDivider, e.clientX, this.thumbLeft, this.thumbWidth)

      const hourlybar = document.getElementById('hourlybar') as HTMLElement
      const totalWidth = hourlybar.clientWidth

      const deltaX = e.clientX - this.isDraggingDivider
      console.log({ deltaX })
      let diff = deltaX
      // Math.max(0, this.dragStartWidth + deltaX)
      // diff = Math.min(this.thumbLeft, totalWidth - this.thumbWidth)
      console.log(diff)

      console.log('oldwidth', this.thumbWidth, 'newwidth', this.thumbWidth - diff)
      console.log('oldleft', this.thumbLeft, 'newleft', this.thumbLeft + diff)
      this.thumbWidth -= diff
      this.thumbLeft += diff

      // calculate extent of thumbscroll
      this.pctStart = this.thumbLeft / totalWidth
      this.pctEnd = (this.thumbLeft + this.thumbWidth) / totalWidth

      this.$emit('range', { start: this.pctStart, end: this.pctEnd })
    },

    filterByDate() { },
  },
})
</script>

<style scoped lang="scss">
.time-slider {
  position: relative;
  /* background-color: white; */
  display: flex;
  flex-direction: row;
  /* border: 2px solid #4972e2; */
  opacity: 0.9;
  height: 5rem;
  user-select: none;
}

#hourlybar {
  position: absolute;
  top: 0;
  width: 100%;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  flex-direction: column;
  z-index: 3;
  padding: 4px 4px;
}

.labels {
  font-size: 0.7rem;
  display: flex;
  flex-direction: row;
  line-height: 0.7rem;
  color:#fff;
  position: relative;
  width: 100%;
  height: 0.6rem;
  top: 2px;
}

.bars {
  display: flex;
  flex-direction: row;
  flex: 1;
}

.week {
  flex: 1;
  background-color: #e24986;
  margin-top: auto;
  margin-right: 1px;
  margin-top: auto;
  padding-bottom: 1px;
  pointer-events: auto;
}

#dragthumb {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  background-color: #8ad2f9;
  z-index: 5;
  color: black;
  opacity: 0.6;
  display: flex;
  flex-direction: row;
  border-radius: 5px;
}

#dragthumb:active,
#dragthumb:hover {
  background-color: #0cf;
  cursor: grab;
  transition: background-color 0.2s, border-color 0.2s;
  opacity: 0.7;
}

#dragleftie,
#dragrightie {
  margin: 0 auto 0 0;
  width: 4px;
  background-color: #218f3a;
  opacity: 0;
  z-index: 10;
}

#dragthumb:hover #dragleftie,
#dragthumb:hover #dragrightie {
  transition: opacity 0.2s;
  opacity: 1;
  cursor: ew-resize;
}

#dragleftie {
  border-top-left-radius: 5px;
  border-bottom-left-radius: 5px;
}

#dragrightie {
  margin: 0 0 0 auto;
  border-top-right-radius: 5px;
  border-bottom-right-radius: 5px;
}

.date-label {
  position: absolute;
  top: 0;
  bottom: 0;
  height: 2rem;
}

.week:hover {
  background-color:#4972e2!important;
}

.week .weektooltiptext {
  visibility: hidden;
  width: fit-content;
  background-color: black;
  color: #fff;
  text-align: center;
  border-radius: 6px;
  padding: 5px 5px;

  /* Position the tooltip */
  position: absolute;
  z-index: 1;
}

.week:hover .weektooltiptext {
  visibility: visible;
}
</style>