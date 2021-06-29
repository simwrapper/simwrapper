<template>
  <ul id="demo">
    <tree-item
      class="item"
      :item="treeData"
      @make-folder="makeFolder"
      @add-item="addItem"
    ></tree-item>
  </ul>
</template>

<script lang="ts">
import Vue from 'vue'
import TreeItem from './TreeItem.vue'

export default Vue.component('tree-view', {
  props: {
    initialData: {},
  },
  components: {
    TreeItem,
  },
  data: function() {
    return {
      treeData: this.initialData,
    }
  },
  methods: {
    makeFolder: function(item: any) {
      Vue.set(item, 'children', [])
      this.addItem(item)
    },
    addItem: function(item: any) {
      item.children.push({
        name: 'new stuff',
      })
    },
  },
})
</script>
