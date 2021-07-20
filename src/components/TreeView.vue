<template lang="pug">
  ul
    tree-item.item(:item="treeData" :root="true" @navigate="onNavigate")

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
    onNavigate: function(event: any) {
      const newPath = `/${event.props.root}/${event.props.xsubfolder}`
      try {
        this.$router.push(newPath)
      } catch (e) {
        // duplicate nav is ignored
      }
    },
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
<style scoped>
ul {
  margin-left: 0.3rem;
}
</style>
