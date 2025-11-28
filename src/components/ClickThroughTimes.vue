<template lang="pug">
.click-through-times-component
  .label-area
    .label {{state.label}}
    .buttons-row
      button.button.play-button(size="is-small" type="is-link"
        @click="getPreviousHour") {{'<'}}
      button.button.play-button2(id="btn-next-time" size="is-small" type="is-link"
        @click="getNextHour") {{ '>' }}


</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
  name: 'clickThroughTimes',
  props: {
    range: { type: Array as PropType<number[]>, required: true },
    allTimes: [] as any[],
  },
  data: () => {
    return {
      state: {
        datasetRange: [0, 86400],
        label: '',
        timeFilter: [0, 3599],
        timeLabel: [0] as any[],
        currentTime: 0 as number,
        allTimesIndex: 0 as number,
      },
      id: 'id-' + Math.floor(1e12 * Math.random()),
    }
  },
  computed: {
    // Calculate the total time span of the dataset.
    fullDatasetTimeSpan(): number {
      console.log(this.state.datasetRange)
      return this.state.datasetRange[1] - this.state.datasetRange[0]
    },

    // Check if the time range is non-zero by comparing start and finish points.
    hasNonZeroTimeRange(): boolean {
      // Return false if the start and finish of the range are identical.
      return !!this.fullDatasetTimeSpan
    },
  },

  mounted() {
    // Initialize component dimensions, initial values, and set up the resizer.
    this.setupInitialValues()
  },

  watch: {
    // Watch for changes in 'state.currentTime' and trigger 'updateExtent' when it changes.
    'state.allTimesIndex'() {
      this.emitValues()
    },
  },

  methods: {
    /**
     * Calculates and sets the initial values for the component's state.
     * This method initializes dataset range, time filter, and slider positions.
     */
    setupInitialValues() {
      this.state.label = this.convertSecondsToClockTimeMinutes(this.$props.allTimes[0])
      this.state.timeFilter = this.allTimes[this.state.allTimesIndex]
      this.emitValues()
    },

    getPreviousHour() {
      if (this.state.allTimesIndex > 0) {
        this.state.allTimesIndex--
        this.state.label = this.convertSecondsToClockTimeMinutes(
          this.$props.allTimes[this.state.allTimesIndex]
        )
      } else {
        this.state.label = this.convertSecondsToClockTimeMinutes(this.$props.allTimes[0])
      }
      this.state.timeFilter = this.allTimes[this.state.allTimesIndex]
    },

    getNextHour() {
      if (this.state.allTimesIndex < this.$props.allTimes.length - 1) {
        this.state.allTimesIndex++
        this.state.label = this.convertSecondsToClockTimeMinutes(
          this.$props.allTimes[this.state.allTimesIndex]
        )
      } else {
        this.state.label = this.convertSecondsToClockTimeMinutes(
          this.$props.allTimes[this.state.allTimesIndex]
        )
      }
      this.state.timeFilter = this.allTimes[this.state.allTimesIndex]
    },

    /**
     * Emits time extent values to the parent component when setup is complete.
     * This method emits the current time filter values to the parent component.
     */
    emitValues() {
      // Check if setup is complete before emitting time extent values.
      //   if (!this.state.isSetupComplete) return

      // Emit the current time filter values to the parent component.
      this.$emit('timeUpdate', {
        extent: this.state.timeFilter,
        index: this.state.allTimesIndex,
      })
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

    updateData() {
      // Calculate and set time labels.
      this.state.timeLabel = [this.convertSecondsToClockTimeMinutes(this.allTimes[0])]
      this.state.timeFilter = [this.allTimes[0]]
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.click-through-times-component {
  display: flex;
  flex-direction: column;
}

.slider-area {
  background-color: var(--bgPanel);
  padding: 1rem 1rem;
  display: flex;
  flex-direction: row;
}

.label-area {
  display: flex;
  flex-direction: column;
  font-size: 1.3rem;
  font-weight: bold;
  margin-right: auto;
  background-color: var(--bgPanel);
}

.label {
  margin-bottom: 0.5rem;
  text-align: center;
  color: var(--text);
  /* Space between label and buttons */
}

.buttons-row {
  display: flex;
  flex-direction: row;
  gap: 0.5rem;
  margin-bottom: 1rem;
}

.play-button {
  width: 2.4rem;
  height: 1.5rem;
  margin-left: 1rem;
  font-weight: bold;
  font-size: 0.8rem;
  line-height: 0.8rem;
  padding: 0 0;
  flex: 1;
}

.play-button2 {
  width: 2.4rem;
  height: 1.5rem;
  margin-right: 1rem;
  font-weight: bold;
  font-size: 0.8rem;
  line-height: 0.8rem;
  padding: 0 0;
  flex: 1;
}
</style>
