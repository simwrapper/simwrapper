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
import Vue from 'vue'
import TreeItem from './TreeItem.vue'
import { faLevelDown } from '@fortawesome/free-solid-svg-icons'

export default Vue.component('tree-view', {
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
