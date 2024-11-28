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
    range: { type: Array as PropType<number[]>, required: true },
    allTimes: [] as any[],
  },
  data: () => {
    return {
      state: {
        componentWidth: 0,
        dragStartX: 0,
        dragType: DRAGTYPE.SLIDE,
        isDragging: false,
        isSetupComplete: false,
        leftPosition: 0,
        rightPosition: 1,
        datasetRange: [0, 86400],
        labels: ['', ''],
        animationElapsedTime: 0,
        startTime: 0,
        timeFilter: [0, 3599],
        animator: null as any,
        timeLabels: [0, 1] as any[],
        currentTime: 0 as number,
      },
      id: 'id-' + Math.floor(1e12 * Math.random()),
      resizer: null as ResizeObserver | null,
      ANIMATE_SPEED: 5,
      isAnimating: false,
    }
  },
  computed: {
    // Calculate the total time span of the dataset.
    fullDatasetTimeSpan(): number {
      return this.state.datasetRange[1] - this.state.datasetRange[0] + this.allTimes[0]
    },

    // Calculate the extent from the left to the right position of the slider.
    extentLeftToRight(): number {
      return this.state.rightPosition - this.state.leftPosition
    },

    // Check if the time range is non-zero by comparing start and finish points.
    hasNonZeroTimeRange(): boolean {
      // Return false if the start and finish of the range are identical.
      return !!this.fullDatasetTimeSpan
    },

    // Calculate the margins for the active region of the slider.
    calculateActiveMargins(): any {
      const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH
      const marginLeft = Math.floor(usableWidth * this.state.leftPosition)
      const marginRight = Math.floor(usableWidth * (1.0 - this.state.rightPosition))

      return {
        marginLeft: `${marginLeft}px`,
        marginRight: `${marginRight}px`,
      }
    },
  },

  mounted() {
    // Add zero values to the beginning of the 'allTimes' array to set the time values correctly.
    this.allTimes.unshift(0)
    this.range[0] = 0

    // Initialize component dimensions, initial values, and set up the resizer.
    this.getDimensions()
    this.setupInitialValues()
    this.setupResizer()

    // Add event listeners for mouseup and mousemove when the component is mounted.
    window.addEventListener('mouseup', this.dragEnd)
    window.addEventListener('mousemove', this.dragging)
  },

  beforeDestroy() {
    this.resizer?.disconnect()
    // Remove event listeners for mouseup and mousemove before the component is destroyed.
    window.removeEventListener('mouseup', this.dragEnd)
    window.removeEventListener('mousemove', this.dragging)

    // Cancel the animation frame if it's active to prevent memory leaks.
    if (this.state.animator) window.cancelAnimationFrame(this.state.animator)
  },

  watch: {
    // Watch for changes in 'state.currentTime' and trigger 'updateExtent' when it changes.
    'state.currentTime'() {
      this.updateExtent()
    },

    // Watch for changes in 'labels' and trigger 'updateLabels'.
    labels() {
      this.updateLabels()
    },

    // Watch for changes in 'state.leftPosition' and 'state.rightPosition', and call 'emitValues' to emit updated values.
    'state.leftPosition'() {
      this.emitValues()
    },
    'state.rightPosition'() {
      this.emitValues()
    },

    // 'isAnimating'() {
    //   this.updateAnimation();
    // },
  },

  methods: {
    /**
     * Toggles the animation state and initiates or stops the animation loop accordingly.
     */
    updateAnimation() {
      this.isAnimating = !this.isAnimating

      if (this.isAnimating) {
        // Calculate animation elapsed time and start time to control the animation.
        this.state.animationElapsedTime = this.state.timeFilter[0] - this.range[0]
        this.state.startTime = Date.now() - this.state.animationElapsedTime / this.ANIMATE_SPEED

        // Initiate the animation loop.
        this.animate()
      }
    },

    /**
     * Finds the index of the lower value in the sorted array 'this.allTimes' between which the given parameter lies.
     *
     * @param parameter - The value to search for to find the index in the 'this.allTimes' array.
     * @returns The index of the lower value in the 'this.allTimes' array between which the given parameter lies.
     *          If the parameter is smaller than the first entry in the array, -1 is returned.
     */
    findIndexLessThanOrEqualTo(parameter: number): number {
      let left = 0
      let right = this.allTimes.length - 1
      let result = 0

      while (left <= right) {
        const mid = Math.floor((left + right) / 2)

        if (this.allTimes[mid] === parameter) {
          return mid
        }

        if (this.allTimes[mid] <= parameter) {
          result = mid
          left = mid + 1
        } else {
          right = mid - 1
        }
      }
      return result
    },

    /**
     * Controls the animation loop to update the current time and time filter.
     * This method calculates the animation progress and updates the relevant state variables.
     */
    animate() {
      if (!this.isAnimating) return

      // Calculate animation elapsed time based on elapsed real-time and animation speed.
      this.state.animationElapsedTime = this.ANIMATE_SPEED * (Date.now() - this.state.startTime)

      // Calculate the current animation clock time.
      const animationClockTime = this.state.animationElapsedTime + this.range[0]

      // Update the current time based on the animation clock time.
      this.state.currentTime = this.findIndexLessThanOrEqualTo(animationClockTime)

      // Check if animation has reached the end of the range.
      if (animationClockTime > this.range[1] + this.allTimes[0]) {
        // Restart the animation if it exceeds the range.
        this.state.startTime = Date.now()
        this.state.animationElapsedTime = 0
      }

      // Update the time filter based on the current time.
      this.state.timeFilter = [
        this.allTimes[this.state.currentTime],
        this.allTimes[this.state.currentTime + 1] == undefined
          ? 0
          : this.allTimes[this.state.currentTime + 1],
      ]

      // Request the next animation frame to continue the loop.
      this.state.animator = window.requestAnimationFrame(this.animate)
    },

    /**
     * Sets up a ResizeObserver to monitor changes in component dimensions.
     * This method attempts to create a ResizeObserver and attach it to the component's DOM element.
     */
    setupResizer() {
      try {
        // Create a ResizeObserver instance and observe the component's DOM element.
        this.resizer = new ResizeObserver(this.getDimensions)
        const sliderElement = document.getElementById(`id-${this.id}`) as HTMLElement
        this.resizer.observe(sliderElement)
      } catch (e) {
        console.error('' + e)
      }
    },

    /**
     * Calculates and sets the initial values for the component's state.
     * This method initializes dataset range, time filter, and slider positions.
     */
    setupInitialValues() {
      try {
        // If 'range' is provided, set dataset range and initial time filter.
        if (this.range) {
          this.state.datasetRange = this.range
          this.state.timeFilter = [this.allTimes[0], this.allTimes[1]]
        }

        // Check if the full dataset time span is zero.
        if (this.fullDatasetTimeSpan === 0) {
          this.state.leftPosition = 0
          this.state.rightPosition = 1
        } else {
          // Calculate and update slider positions based on the dataset range.
          this.updateExtent()
        }
      } catch (e) {
        console.error('' + e)
        // Handle potential division by zero.
      } finally {
        // Mark the setup as complete.
        this.state.isSetupComplete = true
      }
    },

    /**
     * Updates the slider positions and time labels based on the current time filter.
     * This method recalculates and sets the left and right slider positions as well as time labels.
     */
    updateExtent() {
      if (!this.state.timeFilter) return

      // Calculate the left and right slider positions based on the current time filter.
      this.state.leftPosition =
        (1 / this.fullDatasetTimeSpan) * (this.allTimes[this.state.currentTime] - this.allTimes[0])
      this.state.rightPosition =
        (1 / this.fullDatasetTimeSpan) *
        (this.allTimes[this.state.currentTime + 1] == undefined
          ? this.allTimes[this.state.currentTime] + this.allTimes[0]
          : this.allTimes[this.state.currentTime + 1] - this.allTimes[0])

      // Calculate and set time labels.
      this.state.timeLabels = [
        this.convertSecondsToClockTimeMinutes(this.allTimes[this.state.currentTime]),
        this.convertSecondsToClockTimeMinutes(
          this.allTimes[this.state.currentTime + 1] == undefined
            ? this.allTimes[this.state.currentTime] + this.allTimes[0]
            : this.allTimes[this.state.currentTime + 1]
        ),
      ]

      // Update labels and complete the update.
      this.updateLabels()
    },

    /**
     * Updates component labels with time labels if available in the state.
     */
    updateLabels() {
      // If time labels are available in the state, update component labels.
      if (this.state.timeLabels) this.state.labels = this.state.timeLabels
    },

    /**
     * Emits time extent values to the parent component when setup is complete.
     * This method emits the current time filter values to the parent component.
     */
    emitValues() {
      // Check if setup is complete before emitting time extent values.
      if (!this.state.isSetupComplete) return

      // Emit the current time filter values to the parent component.
      this.$emit('timeExtent', this.state.timeFilter)
    },

    /**
     * Converts a time value in seconds to a clock-style time format in hours and minutes.
     *
     * @param index - The time value in seconds to be converted.
     * @returns A formatted string in the 'hh:mm' clock time format.
     */
    convertSecondsToClockTimeMinutes(index: number) {
      const h = Math.floor(index / 3600)
      const m = Math.floor((index - h * 3600) / 60)

      // Calculate seconds separately.
      const s = index - h * 3600 - m * 60

      // Create an object to represent hours, minutes, and seconds.
      const hms = { h: `${h}`, m: `${m}`.padStart(2, '0'), s: `${s}`.padStart(2, '0') }

      // Return the formatted clock time string.
      return `${hms.h}:${hms.m}`
    },

    // Calculates the width of the element
    getDimensions() {
      //@ts-ignore - ref doesn't know about clientWidth
      this.state.componentWidth = this.$refs.slider?.clientWidth || 0
    },

    /**
     * Initiates a dragging operation when a mouse click event occurs.
     *
     * @param e - The MouseEvent object containing event details.
     * @emits drag - Emits a 'drag' event to notify parent components of the drag operation.
     */
    dragStart(e: MouseEvent) {
      // Set the 'isDragging' flag to true to indicate a drag operation.
      this.state.isDragging = true

      // Store the initial mouse position when dragging starts.
      this.state.dragStartX = e.clientX

      // Calculate various dimensions and update the drag type based on mouse position.
      const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH
      const marginLeft = Math.floor(usableWidth * this.state.leftPosition)
      const marginRight = Math.floor(usableWidth * (1.0 - this.state.rightPosition))

      // Calculate the width of the time duration area within the slider.
      const durationWidth =
        this.state.componentWidth - marginRight - marginLeft - 2 * GRAB_HANDLE_WIDTH

      // Determine the drag type based on the mouse position within the duration area.
      if (e.offsetX >= 0 && e.offsetX < durationWidth) this.state.dragType = DRAGTYPE.SLIDE
      else if (e.offsetX < 0) this.state.dragType = DRAGTYPE.START
      else if (e.offsetX > durationWidth) this.state.dragType = DRAGTYPE.END
    },

    /**
     * Handles dragging operations based on mouse movement during dragging.
     *
     * @param e - The MouseEvent object containing event details.
     */
    dragging(e: MouseEvent) {
      if (!this.state.isDragging) return

      // Calculate the horizontal movement distance (deltaX) of the mouse.
      const deltaX = e.clientX - this.state.dragStartX
      const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH

      // Check the type of drag operation and update positions accordingly.
      if (DRAGTYPE.SLIDE == this.state.dragType) {
        const currentExtent = this.extentLeftToRight
        let newLeft = (usableWidth * this.state.leftPosition + deltaX) / usableWidth
        let newRight = newLeft + currentExtent

        // Ensure the draggable window does not exceed the slider's boundaries.
        if (newLeft < 0) {
          newLeft = 0
          newRight = currentExtent
        }

        if (newRight > 1) {
          newRight = 1
          newLeft = newRight - currentExtent
        }

        this.state.leftPosition = newLeft
        this.state.rightPosition = newRight

        this.updateLabels()
        this.updateData()

        this.state.dragStartX = e.clientX
        return
      }
    },

    /**
     * Handles the end of a dragging operation, resetting the dragging state.
     *
     * @param e - The event object associated with the drag end event.
     */
    dragEnd(e: MouseEvent) {
      const newStartTime = this.findIndexLessThanOrEqualTo(
        this.state.leftPosition * this.fullDatasetTimeSpan + this.allTimes[0]
      )

      this.state.leftPosition =
        (1 / this.fullDatasetTimeSpan) * (this.allTimes[newStartTime] - this.allTimes[0])
      this.state.rightPosition =
        (1 / this.fullDatasetTimeSpan) *
        (this.allTimes[newStartTime + 1] == undefined
          ? this.allTimes[newStartTime] + this.allTimes[0]
          : this.allTimes[newStartTime + 1] - this.allTimes[0])

      this.state.timeFilter = [
        this.allTimes[newStartTime] - this.allTimes[0],
        this.allTimes[newStartTime + 1] == undefined
          ? this.allTimes[newStartTime] + this.allTimes[0]
          : this.allTimes[newStartTime + 1] - this.allTimes[0],
      ]

      this.state.isDragging = false
    },

    updateData() {
      const newStartTime = this.findIndexLessThanOrEqualTo(
        this.state.leftPosition * this.fullDatasetTimeSpan + this.allTimes[0]
      )

      const newEndTime =
        this.findIndexLessThanOrEqualTo(
          this.state.leftPosition * this.fullDatasetTimeSpan + this.allTimes[0]
        ) + 1

      // Calculate and set time labels.
      this.state.timeLabels = [
        this.convertSecondsToClockTimeMinutes(this.allTimes[newStartTime]),
        this.convertSecondsToClockTimeMinutes(this.allTimes[newEndTime]),
      ]

      this.state.timeFilter = [this.allTimes[newStartTime], this.allTimes[newEndTime]]
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
