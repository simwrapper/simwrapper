<template lang="pug">
ul
  tree-item.item(
    :item="treeData || {}"
    :expandAll="expandAll"
  )

</template>

<script lang="ts">
import Vue from 'vue'
import TreeItem from './TreeItem.vue'

export default Vue.component('tree-view', {
  props: {
    initialData: {},
    expandAll: { type: Boolean },
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
