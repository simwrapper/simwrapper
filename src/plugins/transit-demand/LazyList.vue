<template lang="pug">
virtual-list.my-list(
  :data-sources="visibleLines"
  :data-key="`id`"
  :data-component="listComponent"
  :keeps="48"
  :estimate-size="48"
  :extra-props="listProps"
)

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import RouteDropDown from './RouteDropDown.vue'
import VirtualList from 'vue-virtual-scroll-list'

export default defineComponent({
  name: 'RouteDropdown',
  components: { RouteDropDown, VirtualList },
  props: {
    highlightedTransitLines: { type: Array, required: true },
    listProps: { type: Object, required: true },
  },

  data() {
    return {
      listComponent: RouteDropDown,
    }
  },

  // mounted() {
  //   console.log(this.highlightedTransitLines.length)
  // },

  watch: {
    'listProps.activeTransitLines'() {
      // console.log('active list changed')
    },
  },

  computed: {
    visibleLines() {
      return this.highlightedTransitLines
        .map((f: any, i: number) => {
          f.offset = i
          return f
        })
        .filter((f: any) => f.show)
    },
  },

  // watch: {},
  // methods: {},
})
</script>

<style scoped lang="scss">
.my-list {
  overflow-y: auto;
}
</style>
