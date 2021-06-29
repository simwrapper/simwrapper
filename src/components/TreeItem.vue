<template>
  <li>
    <!-- <div :class="{ bold: isFolder }" @click="toggle" @dblclick="makeFolder"> -->
    <div :root="item.root.url" :xsubfolder="item.path" @click="toggle">
      {{ item.name }}
      <!-- <span v-if="isFolder">[{{ isOpen ? '-' : '+' }}]</span> -->
    </div>
    <ul v-show="isOpen" v-if="isFolder">
      <tree-item
        class="item"
        v-for="(child, index) in item.children"
        :key="index"
        :item="child"
        @make-folder="$emit('make-folder', $event)"
        @add-item="$emit('add-item', $event)"
      ></tree-item>
      <!-- <li class="add" @click="$emit('add-item', item)">+</li> -->
    </ul>
  </li>
</template>

<script>
import Vue from 'vue'

export default Vue.component('tree-item', {
  props: {
    item: Object,
  },
  data: function() {
    return {
      isOpen: true, // default to all-open
    }
  },
  computed: {
    isFolder: function() {
      return this.item.children && this.item.children.length
    },
  },
  methods: {
    toggle: function(target) {
      const { root, xsubfolder } = target.target.attributes
      console.log({ root: root.value, xsubfolder: xsubfolder.value })
      this.$emit('navigate', {
        component: 'FolderBrowser',
        props: { root, xsubfolder },
      })
    },

    // if (this.isFolder) {
    //   this.isOpen = !this.isOpen
    // }
    // },
    makeFolder: function() {
      if (!this.isFolder) {
        this.$emit('make-folder', this.item)
        this.isOpen = true
      }
    },
  },
})
</script>
<style scoped>
ul {
  list-style: none outside none;
}
li {
  margin-left: 0.6rem;
  line-height: 1.15rem;
}
</style>
