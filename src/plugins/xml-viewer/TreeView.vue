<template lang="pug">
ul
  tree-item.item(
    :item="treeData || {}"
    :expandAll="expandAll"
    :level="level + 1"
    :numberOfUnfoldLevel="numberOfUnfoldLevel"
  )

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import TreeItem from './TreeItem.vue'

export default defineComponent({
  name: 'TreeView',
  props: {
    initialData: {},
    expandAll: { type: Boolean },
    level: { type: Number },
    numberOfUnfoldLevel: { type: Number },
  },
  components: {
    TreeItem,
  },
  data: function () {
    return {
      treeData: this.initialData,
    }
  },
  methods: {},
})
</script>

<style scoped></style>
