<template lang="pug">
.time-slider-component
  .label-area
    p.p1 {{ state.labels[0] }}
    p.p2(v-show="state.labels[1] !== undefined") &nbsp;-&nbsp;{{ state.labels[1] }}

  .slider-area
    button.button.play-button(size="is-small" type="is-link"
      @click="$emit('toggleAnimation')"
      ) {{ isAnimating ? '||' : '>' }}

    .time-slider-dragger(ref="slider" @mousemove="dragging")
      .active-region(:style="calculateActiveMargins"
        @mousedown="dragStart" @mouseup.stop="dragEnd" @mousemove.stop="dragging"
      )

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

const GRAB_HANDLE_WIDTH = 6

enum DRAGTYPE {
  SLIDE,
  START,
  END,
}

@Component({ components: {} })
export default class VueComponent extends Vue {
  @Prop({ required: false }) labels!: string[]
  @Prop({ required: false }) range!: number[]
  @Prop({ required: false }) values!: number[]
  @Prop({ required: false }) isAnimating!: boolean

  private state = {
    componentWidth: 0,
    dragStartX: 0,
    dragType: DRAGTYPE.SLIDE,
    isDragging: false,
    isSetupComplete: false,
    normValueLeft: 0, // always normalized
    normValueRight: 1, // always normalized
    valueWidth: 1,
    range: [0, 1],
    labels: ['', ''],
  }

  private mounted() {
    this.getDimensions()
    this.setupInitialValues()
    window.addEventListener('mouseup', this.dragEnd)
    window.addEventListener('mousemove', this.dragging)
    window.addEventListener('resize', this.getDimensions)
  }

  private beforeDestroy() {
    window.removeEventListener('mouseup', this.dragEnd)
    window.removeEventListener('mousemove', this.dragging)
    window.removeEventListener('resize', this.getDimensions)
  }

  private setupInitialValues() {
    try {
      if (this.range) this.state.range = this.range

      if (this.values) {
        const totalRange = this.state.range[1] - this.state.range[0]
        this.state.normValueLeft = (this.values[0] - this.state.range[0]) / totalRange
        this.state.normValueRight = (this.values[1] - this.state.range[0]) / totalRange
        this.state.valueWidth = this.state.normValueRight - this.state.normValueLeft
      }
    } catch (e) {
      // divide by zero, oh well
    } finally {
      this.state.isSetupComplete = true
    }
  }

  @Watch('values') updateValues() {
    const totalRange = this.state.range[1] - this.state.range[0]
    this.state.normValueLeft = (this.values[0] - this.state.range[0]) / totalRange
    this.state.normValueRight = (this.values[1] - this.state.range[0]) / totalRange
    this.state.valueWidth = this.state.normValueRight - this.state.normValueLeft
  }

  @Watch('labels') updateLabels() {
    this.state.labels = this.labels
  }

  @Watch('state.normValueLeft')
  @Watch('state.normValueRight')
  private emitValues() {
    if (!this.state.isSetupComplete) return

    const totalRange = this.state.range[1] - this.state.range[0]
    const start = Math.round(this.state.normValueLeft * totalRange)
    const end = Math.round(this.state.normValueRight * totalRange)
    this.$emit('values', [start, end])
  }

  private getDimensions() {
    //@ts-ignore - ref doesn't know about clientWidth
    this.state.componentWidth = this.$refs.slider?.clientWidth || 0
  }

  private get calculateActiveMargins() {
    const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH
    const marginLeft = Math.floor(usableWidth * this.state.normValueLeft)
    const marginRight = Math.floor(usableWidth * (1.0 - this.state.normValueRight))

    // console.log({ usableWidth, marginLeft, marginRight })

    return {
      marginLeft: `${marginLeft}px`,
      marginRight: `${marginRight}px`,
    }
  }

  private dragStart(e: MouseEvent) {
    this.$emit('drag')
    this.state.isDragging = true
    this.state.dragStartX = e.clientX

    const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH
    const marginLeft = Math.floor(usableWidth * this.state.normValueLeft)
    const marginRight = Math.floor(usableWidth * (1.0 - this.state.normValueRight))

    const durationWidth =
      this.state.componentWidth - marginRight - marginLeft - 2 * GRAB_HANDLE_WIDTH

    console.log({ usableWidth, durationWidth, marginLeft, marginRight })

    if (e.offsetX >= 0 && e.offsetX < durationWidth) this.state.dragType = DRAGTYPE.SLIDE
    else if (e.offsetX < 0) this.state.dragType = DRAGTYPE.START
    else if (e.offsetX > durationWidth) this.state.dragType = DRAGTYPE.END
  }

  private dragging(e: MouseEvent) {
    if (!this.state.isDragging) return

    const deltaX = e.clientX - this.state.dragStartX
    const usableWidth = this.state.componentWidth - 2 * GRAB_HANDLE_WIDTH

    // are we moving the time duration window
    if (DRAGTYPE.SLIDE == this.state.dragType) {
      const newLeft = usableWidth * this.state.normValueLeft + deltaX

      this.state.normValueLeft = Math.max(0, newLeft / usableWidth)
      this.state.normValueRight = this.state.normValueLeft + this.state.valueWidth

      if (this.state.normValueRight > 1) {
        this.state.normValueRight = 1
        this.state.normValueLeft = this.state.normValueRight - this.state.valueWidth
      }

      this.state.dragStartX = e.clientX
      return
    }

    // are we moving the start-time
    if (DRAGTYPE.START == this.state.dragType) {
      const newLeft = usableWidth * this.state.normValueLeft + deltaX
      this.state.normValueLeft = Math.max(0, newLeft / usableWidth)
      if (this.state.normValueLeft > this.state.normValueRight) {
        this.state.normValueRight = this.state.normValueLeft
      }
      this.state.valueWidth = this.state.normValueRight - this.state.normValueLeft
      this.state.dragStartX = e.clientX
      return
    }

    // are we moving the end-time
    if (DRAGTYPE.END == this.state.dragType) {
      const newRight = usableWidth * this.state.normValueRight + deltaX
      this.state.normValueRight = Math.min(1, newRight / usableWidth)
      if (this.state.normValueLeft > this.state.normValueRight) {
        this.state.normValueLeft = this.state.normValueRight
      }
      this.state.valueWidth = this.state.normValueRight - this.state.normValueLeft
      this.state.dragStartX = e.clientX
      return
    }
  }

  private dragEnd(e: any) {
    this.state.isDragging = false
  }
}
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
  padding: 0 0;
}
</style>
