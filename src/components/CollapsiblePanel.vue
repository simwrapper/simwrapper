<template lang="pug">
.outer(:class="{collapsed}")

  //- main content:

  .body.left(v-if="direction==='left'"
    :style="{transform: collapsed ? `translateX(-50%) scale(0,1)` : `none`}")

    slot.content()

  .body(v-else
    :style="{order: 1, transform: collapsed ? `translateX(50%) scale(0,1)` : `none`}")

    slot.content()

  //- show/hide swipey panel:

  .xbutton(v-if="locked" :style="{order: direction === 'left' ? 1 : 2}")
    .rotate(style="width: 0.8rem")

  .xbutton(v-else @click="handleClick" :class="{collapsed}"
           :style="{order: direction === 'left' ? 1 : 2}")
    .rotate(:style="{transform: `rotate(${collapsed ? 180 : 360}deg)`}") {{ direction === 'left' ? "&lt;" : "&gt;" }}

</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'CollapsiblePanel',
  props: {
    initialCollapsed: Boolean,
    direction: String,
    locked: Boolean,
  },
  data: () => {
    return {
      collapsed: false,
    }
  },
  mounted() {
    this.collapsed = !!this.initialCollapsed
  },
  methods: {
    handleClick() {
      this.collapsed = !this.collapsed
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.outer {
  z-index: 0;
  display: flex;
  justify-items: center;
  flex-direction: row;
  pointer-events: auto;
  filter: drop-shadow(0px 2px 4px #22222233);
}

.outer.collapsed {
  box-shadow: none;
  border: none;
}

.body {
  overflow: hidden;
  transition: transform 0.15s ease-out;
  background-color: var(--bgPanel);
  font-size: 0.8rem;
}

.xbutton {
  z-index: 1;
  display: flex;
  border: none;
  cursor: pointer;
  align-items: center;
  font-size: 1.2rem;
  background-color: var(--bgHideButton);
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
}

.xbutton:hover {
  background-color: var(--bgPanel3);
  color: var(--link);
}

.rotate {
  flex: 1;
  margin: auto 0.35rem;
  transform-origin: center;
  transition: transform 0.15s ease-out;
}

.left {
  order: 2;
  // background-color: var(--bgTag);
}

@media only screen and (max-width: 640px) {
}
</style>
