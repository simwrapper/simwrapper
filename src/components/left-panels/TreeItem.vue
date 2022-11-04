<template lang="pug">
li
  .leaf-node(v-if="item && item.level > 0")
    .toggle(v-if="item.children.length")
      i.fa(
        :class="{'fa-plus-square': !isOpen, 'fa-minus-square': isOpen}"
        @click="toggle"
        style="font-size: 0.7rem; margin: 5px 0 auto -8px;"
      )
    .leaf-label(:root="item.root" :xsubfolder="item.path" @click="activate") {{ item.name }}

  ul.children(v-show="isOpen" v-if="isFolder")
    tree-item.item(
      v-for="(child, index) in item.children"
      :key="index"
      :item="child"
      :root="false"
      @navigate="$emit('navigate', $event)"
    )

</template>

<script lang="ts">
import Vue from 'vue'

export default Vue.component('tree-item', {
  props: {
    item: {} as any,
  },
  data: function () {
    return {
      isOpen: true, // this.item.level < 2, // default to all-open
    }
  },
  computed: {
    isFolder: function () {
      const item = this.item as any
      return item.children && item.children.length
    },
  },
  methods: {
    activate: function (element: any) {
      const { root, xsubfolder } = element.target.attributes
      this.$emit('navigate', {
        component: 'FolderBrowser',
        props: { root: root.value, xsubfolder: xsubfolder.value },
      })
    },
    toggle: function (element: any) {
      this.isOpen = !this.isOpen
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

ul {
  list-style: none outside none;
  margin-bottom: 0.25rem;
}

li {
  margin-left: 0.6rem;
  line-height: 1.1rem;
}

.item {
  margin-right: auto;
  cursor: pointer;
}

.leaf-node {
  display: flex;
  flex-direction: row;
  margin-right: auto;
}

.leaf-label:hover {
  // background-color: #1292ce; // var(--bgHover);
  background-color: var(--bgTreeItem);
}

.leaf-label {
  margin-top: 0.05rem;
  margin-left: 0.2rem;
}

.toggle {
  margin-top: -0.1rem;
  color: #b3b3b3; // var(--textVeryPale);
}

.toggle:hover {
  color: white; // var(--textPale);
}
</style>
