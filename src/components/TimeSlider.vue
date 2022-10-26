<template lang="pug">
.time-slider-component(ref="slider" @mousemove="dragging")
  .active-region(:style="calculateActiveMargins"
    @mousedown="dragStart" @mouseup.stop="dragEnd" @mousemove.stop="dragging"
  )
    p.pleft {{ state.labels[0] }}
    p.pright {{ state.labels[1] }}

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
  user-select: none;
  height: 2.5rem;
  background-color: #8888ff44;
  border-radius: 5px;
}

.active-region {
  cursor: pointer; // ew-resize;
  color: white;
  background-color: #37547d;
  height: 100%;
  border-radius: 5px;
  border-left: 6px solid white;
  border-right: 6px solid white;
  font-size: 0.9rem;
  line-height: 0.9rem;
  padding: 2px 3px;
  // font-weight: bold;
}

.pright {
  margin-top: 5px;
  text-align: right;
}
</style>
