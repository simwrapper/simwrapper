<template lang="pug">
.time-slider-component(v-if="hasNonZeroTimeRange" :id="`id-${id}`")
  .label-area
    p.p1 {{ state.labels[0] }}
    p.p2(v-show="state.labels[1] !== undefined") &nbsp;-&nbsp;{{ state.labels[1] }}

  .slider-area
    button.button.play-button(size="is-small" type="is-link"
      @click="updateAnimation"
      ) {{ isAnimating ? '|&nbsp;|' : '>' }}

    .time-slider-dragger(ref="slider" @mousemove="dragging")
      .active-region(:style="calculateActiveMargins"
        @mousedown="dragStart" @mouseup.stop="dragEnd" @mousemove.stop="dragging"
      )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

const GRAB_HANDLE_WIDTH = 6

enum DRAGTYPE {
  SLIDE,
  START,
  END,
}

export default defineComponent({
  name: 'TimeSliderV2',
  props: {
    // labels: Array as PropType<string[]>,
    range: { type: Array as PropType<number[]>, required: true },
    // activeTimeExtent: Array as PropType<number[]>,
    // isAnimating: Boolean,
    // useTimeBins: Boolean,
    timeBinSize: Number,
  },
  data: () => {
    return {
      state: {
        componentWidth: 0,
        dragStartX: 0,
        dragType: DRAGTYPE.SLIDE,
        isDragging: false,
        isSetupComplete: false,
        // always 0.0-1.0 :
        leftPosition: 0,
        rightPosition: 1,
        // the datasetRange is the extent of the time values in the dataset, e.g. 0-86400
        datasetRange: [0, 86400],
        labels: ['', ''],
        animationElapsedTime: 0,
        startTime: 0,
        timeFilter: [0, 3599],
        // timeRange: [Infinity, -Infinity],
        animator: null as any,
        timeLabels: [0, 1] as any[],
      },
      id: 'id-' + Math.floor(1e12 * Math.random()),
      resizer: null as ResizeObserver | null,
      ANIMATE_SPEED: 10,
      isAnimating: false,
    }
  },
  computed: {
    fullDatasetTimeSpan(): number {
      return this.state.datasetRange[1] - this.state.datasetRange[0]
    },

    extentLeftToRight(): number {
      return this.state.rightPosition - this.state.leftPosition
    },

    hasNonZeroTimeRange(): boolean {
      // return false if the start and finish of the range are identical
      return !!this.fullDatasetTimeSpan
    },
    calculateActiveMargins(): any {
      const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH
      const marginLeft = Math.floor(usableWidth * this.state.leftPosition)
      const marginRight = Math.floor(usableWidth * (1.0 - this.state.rightPosition))

      // console.log({ usableWidth, marginLeft, marginRight })

      return {
        marginLeft: `${marginLeft}px`,
        marginRight: `${marginRight}px`,
      }
    },
  },
  mounted() {
    this.getDimensions()
    this.setupInitialValues()
    this.setupResizer()

    window.addEventListener('mouseup', this.dragEnd)
    window.addEventListener('mousemove', this.dragging)

    console.log('The TimeSliderV2 has mounted')
  },

  beforeDestroy() {
    window.removeEventListener('mouseup', this.dragEnd)
    window.removeEventListener('mousemove', this.dragging)

    if (this.state.animator) window.cancelAnimationFrame(this.state.animator)
  },
  watch: {
    'state.timeFilter'() {
      // console.log(this.state.timeFilter)
      this.updateExtent()
    },
    labels() {
      this.updateLabels()
    },
    'state.leftPosition'() {
      this.emitValues()
    },
    'state.rightPosition'() {
      this.emitValues()
    },
    // isAnimating() {
    //   this.updateAnimation()
    // },
  },

  methods: {
    // TODO...
    updateAnimation() {
      console.log('updateAnimation')
      this.isAnimating = !this.isAnimating
      if (this.isAnimating) {
        this.state.animationElapsedTime = this.state.timeFilter[0] - this.range[0]
        this.state.startTime = Date.now() - this.state.animationElapsedTime / this.ANIMATE_SPEED
        this.animate()
      }
    },

    animate() {
      if (!this.isAnimating) return
      // console.log('animate')

      this.state.animationElapsedTime = this.ANIMATE_SPEED * (Date.now() - this.state.startTime)

      if (this.timeBinSize != undefined) {
        const modulo = this.state.animationElapsedTime % this.timeBinSize
        // console.log(modulo)

        if (Math.abs(modulo) != 0) this.state.animationElapsedTime -= modulo
      }

      // console.log(this.state.animationElapsedTime)
      const animationClockTime = this.state.animationElapsedTime + this.range[0]

      if (animationClockTime > this.range[1]) {
        this.state.startTime = Date.now()
        this.state.animationElapsedTime = 0 // this.timeRange[0]
      }

      // console.log(this.state, animationClockTime)
      const span = this.state.timeFilter[1] - this.state.timeFilter[0]
      // console.log(this.state.timeFilter[1] - this.state.timeFilter[0])

      this.state.timeFilter = [animationClockTime, animationClockTime + span]

      // this.timesliderModuloValue = animationClockTime % 7200

      this.state.animator = window.requestAnimationFrame(this.animate)
    },

    setupResizer() {
      try {
        this.resizer = new ResizeObserver(this.getDimensions)
        const sliderElement = document.getElementById(`id-${this.id}`) as HTMLElement
        this.resizer.observe(sliderElement)
      } catch (e) {
        console.error('' + e)
      }
    },

    setupInitialValues() {
      try {
        if (this.range) this.state.datasetRange = this.range

        if (this.fullDatasetTimeSpan === 0) {
          this.state.leftPosition = 0
          this.state.rightPosition = 1
        } else {
          this.updateExtent()
        }
      } catch (e) {
        console.error('' + e)
        // divide by zero, oh well
      } finally {
        this.state.isSetupComplete = true
      }
    },

    updateExtent() {
      if (!this.state.timeFilter) return

      // console.log('updateExtent()')
      // console.log(this.state.timeFilter)
      // console.log(this.state.datasetRange)
      // console.log(this.fullDatasetTimeSpan)

      this.state.leftPosition =
        (this.state.timeFilter[0] - this.state.datasetRange[0]) / this.fullDatasetTimeSpan
      this.state.rightPosition =
        (this.state.timeFilter[1] - this.state.datasetRange[0]) / this.fullDatasetTimeSpan

      // console.log(this.state.leftPosition)
      // console.log(this.state.rightPosition)
    },

    updateLabels() {
      if (this.state.timeLabels) this.state.labels = this.state.timeLabels
    },

    // TODO: Only when bucket changes
    emitValues() {
      if (!this.state.isSetupComplete) return

      // console.log(this.state.datasetRange[0])
      // console.log(this.state.leftPosition)
      // console.log(this.state.rightPosition)
      // console.log(this.useTimeBins)

      const start = this.state.datasetRange[0] + this.state.leftPosition * this.fullDatasetTimeSpan
      const end = this.state.datasetRange[0] + this.state.rightPosition * this.fullDatasetTimeSpan
      // console.log(start, end)
      // console.log(start % this.state.datasetRange[0])

      this.state.animationElapsedTime = start
      this.state.timeFilter = [start, end]

      this.state.timeLabels = [
        this.convertSecondsToClockTimeMinutes(start),
        this.convertSecondsToClockTimeMinutes(end),
      ]

      // console.log(start, end)

      this.$emit('timeExtent', [start, end])

      // this.$emit('timeExtent', [start, end])

      // this.$emit('timeExtent', [0, 7200])
    },

    convertSecondsToClockTimeMinutes(index: number) {
      const h = Math.floor(index / 3600)
      const m = Math.floor((index - h * 3600) / 60)
      const s = index - h * 3600 - m * 60

      const hms = { h: `${h}`, m: `${m}`.padStart(2, '0'), s: `${s}`.padStart(2, '0') }

      return `${hms.h}:${hms.m}`
    },

    getDimensions() {
      //@ts-ignore - ref doesn't know about clientWidth
      this.state.componentWidth = this.$refs.slider?.clientWidth || 0
    },

    dragStart(e: MouseEvent) {
      this.$emit('drag')
      this.state.isDragging = true
      this.state.dragStartX = e.clientX

      const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH
      const marginLeft = Math.floor(usableWidth * this.state.leftPosition)
      const marginRight = Math.floor(usableWidth * (1.0 - this.state.rightPosition))

      const durationWidth =
        this.state.componentWidth - marginRight - marginLeft - 2 * GRAB_HANDLE_WIDTH

      // console.log({ usableWidth, durationWidth, marginLeft, marginRight })

      if (e.offsetX >= 0 && e.offsetX < durationWidth) this.state.dragType = DRAGTYPE.SLIDE
      else if (e.offsetX < 0) this.state.dragType = DRAGTYPE.START
      else if (e.offsetX > durationWidth) this.state.dragType = DRAGTYPE.END
    },

    dragging(e: MouseEvent) {
      if (!this.state.isDragging) return

      const deltaX = e.clientX - this.state.dragStartX
      const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH

      // are we moving the time duration window
      if (DRAGTYPE.SLIDE == this.state.dragType) {
        const currentExtent = this.extentLeftToRight
        let newLeft = (usableWidth * this.state.leftPosition + deltaX) / usableWidth
        let newRight = newLeft + currentExtent

        // don't scroll past the left edge
        if (newLeft < 0) {
          newLeft = 0
          newRight = currentExtent
        }

        // don't scroll past the right edge
        if (newRight > 1) {
          newRight = 1
          newLeft = newRight - currentExtent
        }

        this.state.leftPosition = newLeft
        this.state.rightPosition = newRight

        this.state.dragStartX = e.clientX
        return
      }

      // are we moving the start-time
      if (DRAGTYPE.START == this.state.dragType) {
        const newLeft = usableWidth * this.state.leftPosition + deltaX
        this.state.leftPosition = Math.max(0, newLeft / usableWidth)
        if (this.state.leftPosition > this.state.rightPosition) {
          this.state.rightPosition = this.state.leftPosition
        }
        this.state.dragStartX = e.clientX
        return
      }

      // are we moving the end-time
      if (DRAGTYPE.END == this.state.dragType) {
        const newRight = usableWidth * this.state.rightPosition + deltaX
        this.state.rightPosition = Math.min(1, newRight / usableWidth)
        if (this.state.leftPosition > this.state.rightPosition) {
          this.state.leftPosition = this.state.rightPosition
        }
        this.state.dragStartX = e.clientX
        return
      }
    },

    dragEnd(e: any) {
      this.state.isDragging = false
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.time-slider-component {
  display: flex;
  flex-direction: column;
}

.slider-area {
  background-color: var(--bgPanel);
  padding: 1rem 1rem;
  display: flex;
  flex-direction: row;
}

.time-slider-dragger {
  user-select: none;
  height: 1.5rem;
  background-color: #66669933;
  border-radius: 4px;
  max-width: 100%;
  flex: 1;
  overflow: hidden;
}

.active-region {
  cursor: ew-resize;
  color: white;
  background-color: var(--sliderThumb);
  height: 100%;
  border-radius: 4px;
  border-left: 6px solid var(--linkHover);
  border-right: 6px solid var(--linkHover);
  font-size: 1rem;
  line-height: 0.6rem;
}

.label-area {
  margin: 0 0;
  font-size: 1.3rem;
  font-weight: bold;
  display: flex;
  flex-direction: row;
  margin-right: auto;
}

.p1 {
  padding: 0 0;
  padding-left: 1rem;
  background-color: var(--bgPanel);
}

.p2 {
  padding: 0 0;
  padding-right: 1rem;
  background-color: var(--bgPanel);
}

.play-button {
  width: 2.4rem;
  height: 1.5rem;
  margin-right: 1rem;
  font-weight: bold;
  font-size: 0.8rem;
  line-height: 0.8rem;
  padding: 0 0;
}
</style>
