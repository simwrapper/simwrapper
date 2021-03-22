<template lang="pug">
.outer(:class="{collapsed}")
  .body(v-if="direction==='left'" :style="{order: 2, transform: collapsed ? `translateX(-${width}px` : `none`}")
    slot.content(:style="{width: `${width}px`}")

  .body(v-else :style="{order: 1, transform: collapsed ? `translateX(${width}px` : `none`}")
    slot.content(:style="{width: `${width}px`}")

  .xbutton(@click="handleClick" :class="{collapsed}"
           :style="{order: direction === 'left' ? 1 : 2}")

      .rotate(:style="{transform: `rotate(${collapsed ? 180 : 360}deg)`}") {{ direction === 'left' ? "&lt;" : "&gt;" }}

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

@Component
export default class VueComponent extends Vue {
  @Prop({ required: true })
  private width!: number

  @Prop({ required: false })
  private initialCollapsed!: boolean

  @Prop({ required: true })
  private direction!: string

  @Prop({ required: true })
  private darkMode!: boolean

  private collapsed = this.initialCollapsed === undefined ? false : this.initialCollapsed

  private handleClick() {
    this.collapsed = !this.collapsed
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.outer {
  display: flex;
  justify-items: center;
  flex-direction: row;
  pointer-events: auto;
  box-shadow: 0px 2px 10px #22222266;
}

.outer.collapsed {
  box-shadow: none;
}

.body {
  overflow: hidden;
  transition: transform 0.15s ease-out;
  background-color: var(--bgPanel);
  font-size: 0.8rem;
}

.xbutton {
  z-index: 2;
  display: flex;
  border: none;
  cursor: pointer;
  align-items: center;
  font-size: 22px;
  background-color: var(--bgCream3);
  outline: none;
  color: #aac;
  transition: background-color 0.15s, color 0.15s, border-radius 0.15s;
  -webkit-touch-callout: none;
  -webkit-user-select: none;
  -khtml-user-select: none;
  -moz-user-select: none;
  -ms-user-select: none;
  user-select: none;
}

.xbutton.collapsed {
  border-radius: 4px;
  box-shadow: 0px 2px 10px #22222266;
}

.xbutton:hover {
  background-color: var(--bgCream4);
  color: var(--link);
}

.rotate {
  flex: 1;
  margin: auto 0.35rem;
  transform-origin: center;
  transition: transform 0.15s ease-out;
}

@media only screen and (max-width: 640px) {
}
</style>
