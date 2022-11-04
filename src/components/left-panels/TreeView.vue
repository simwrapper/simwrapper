<template lang="pug">
ul
  tree-item.item(:item="treeData" @navigate="onNavigate")

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
  data: function () {
    return {
      treeData: this.initialData,
    }
  },
  methods: {
    onNavigate: function (event: any) {
      this.$emit('navigate', {
        component: 'TabbedDashboardView',
        props: { root: event.props.root, xsubfolder: event.props.xsubfolder },
      })
    },
    makeFolder: function (item: any) {
      Vue.set(item, 'children', [])
      this.addItem(item)
    },
    addItem: function (item: any) {
      item.children.push({
        name: 'new stuff',
      })
    },
  },
})
</script>

<style scoped></style>
