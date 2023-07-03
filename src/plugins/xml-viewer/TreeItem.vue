<template lang="pug">
li
  .leaf-node(@click="toggle")
    .leaf-nav-title
      .toggle(v-if="children.length")
        i.fa(
          :class="{'fa-plus-square': !isOpen, 'fa-minus-square': isOpen}"
          style="font-size: 0.7rem; margin: 5px 0 auto -8px;"
        )
      b.leaf-label {{ elementId }}

    .leaf-text(v-if="text") &nbsp;&nbsp;{{ text }}

    .leaf-attribute(v-for="attribute in attributes")
      span &nbsp;&nbsp;{{ attribute[0] }}:&nbsp;
      b "{{ attribute[1] }}"

  ul.children(v-if="isFolder && isOpen")
    tree-item.item(
      v-for="(child, index) in children"
      :key="index"
      :item="child"
      :root="false"
      :expandAll="expandAll"
      :numberOfUnfoldLevel="numberOfUnfoldLevel"
      :level="level + 1"
      @navigate="$emit('navigate', $event)"
    )

</template>

<script lang="ts">
import Vue from 'vue'

export default Vue.component('tree-item', {
  props: {
    item: { type: Object, required: true },
    expandAll: { type: Boolean },
    level: { type: Number },
    numberOfUnfoldLevel: { type: Number },
  },
  data() {
    return {
      isOpen: this.expandAll, // this.item.level < 2, // default to all-open
      text: '',
      elementId: '',
      children: [] as any[],
      attributes: [] as any[],
    }
  },
  mounted() {
    const thing = { ...this.item } as any // could be anything really!
    this.attributes = this.getAttributes(thing)
    delete thing[':@']

    const keys = Object.keys(thing)
    if (keys.length !== 1) {
      console.log('WHAT', keys)
    }

    this.elementId = keys[0]
    this.children = thing[keys[0]] || []

    // figure out #text content
    if (this.children.length === 1 && this.children[0]['#text']) {
      this.text = this.children[0]['#text']
      this.children = []
    }

    if (this.level < this.numberOfUnfoldLevel + 1) {
      this.isOpen = true
    } else {
      this.isOpen = this.expandAll
    }
  },

  methods: {
    getAttributes(thing: any) {
      // XML parser returns attributes in a ':@' object
      const attr = thing[':@'] as any
      if (!attr) return []

      return Object.entries(attr).map(entry => {
        const [k, v] = entry
        const key = k.startsWith('$$') ? k.substring(2) : k
        return [key, v]
      })
    },

    toggle() {
      this.isOpen = !this.isOpen
    },
  },

  computed: {
    isFolder(): boolean {
      return this.children.length > 0
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

ul {
  list-style: none outside none;
  margin-bottom: 0px;
}

li {
  padding-left: 12px;
  line-height: 1.2rem;
}

.item {
  cursor: pointer;
}

.leaf-node {
  display: flex;
  // flex-direction: row;
  flex-wrap: wrap;
}

.leaf-label:hover {
  background-color: var(--bgHover);
}

.leaf-nav-title {
  display: flex;
  margin-right: 0px;
}

.leaf-text {
  font-weight: bold;
  font-style: italic;
  color: var(--linkHover);
}

.leaf-label {
  color: var(--link);
  margin-left: 0.2rem;
}

.toggle {
  margin-top: -1px;
  color: var(--textPale);
}

.toggle:hover {
  color: var(--textVeryPale);
}
</style>
