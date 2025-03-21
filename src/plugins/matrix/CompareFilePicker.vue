<template lang="pug">
.compare-picker
  .c-title Select matrix file for comparison
  .c-info Choose file, or drag a local file onto the map:
  .c-selection {{ selection }}
  .c-inner.flex1
    .c-items.flex-column.flex1(v-if="dirEntry")
      p.dir 🔼 UP
      p.dir(v-for="dir in dirEntry.dirs") 🗂️ f{{ dir }}/
      p.ffile(v-for="f in dirEntry.files") {{ f }}
    .c-items.flex-column.flex1(v-else)
      p Loading...
  .c-button-bar.flex-row
    b-button.is-small(@click="$emit('close')") CANCEL
    b-button.is-small(type="is-success" @click="$emit('ping')") SELECT FILE

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import { ComparisonMatrix, MapConfig } from './MatrixViewer.vue'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import { DirectoryEntry } from '@/Globals'

export default defineComponent({
  name: 'MatrixViewer',
  components: {},
  props: {
    isMap: Boolean,
    fileApi: { required: true, type: Object as PropType<HTTPFileSystem> },
    subfolder: { type: String, required: true },
    mapConfig: { type: Object as PropType<MapConfig> },
  },

  data() {
    return {
      filename: '',
      filenameShapes: '',
      curFolder: '',
      dirEntry: null as null | DirectoryEntry,
      selection: '',
    }
  },

  async mounted() {
    const stuff = await this.fileApi.getDirectory(this.subfolder)
    this.dirEntry = stuff
    this.selection = this.subfolder
  },

  computed: {},

  watch: {
    filenameShapes() {
      this.$emit('shapes', this.filenameShapes)
    },
  },
  methods: {},
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

$bgBeige: #636a67;
$bgLightGreen: #d2e4c9;
$bgLightCyan: #effaf6;
$bgDarkerCyan: #def3ec;

.compare-picker {
  user-select: none;
  position: absolute;
  inset: 2px 1rem 1rem 18.75rem;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
  border: 3px solid $appTag; // #bbbbcc88;
  filter: $filterShadow;
  width: 40rem;
  height: 25rem;
  z-index: 50000;
  border-radius: 3px;
}

.c-title {
  background-color: $panelTitle;
  color: white;
  padding: 4px;
  font-weight: bold;
}

.c-info {
  padding: 4px 4px 12px 8px;
}

.c-inner {
  font-size: 13px;
  position: relative;
}

.c-items {
  background-color: var(--bgPanel);
  flex: 1;
  position: absolute;
  inset: 2px 4px 4px 4px;
  padding: 4px;
  overflow-y: auto;
}

.c-selection {
  padding: 0px 8px;
  font-size: 13px;
  color: var(--link);
  font-weight: bold;
}

.c-button-bar {
  gap: 4px;
  margin-left: auto;
  padding: 0px 8px 4px 4px;
}

.dir {
  cursor: pointer;
  font-weight: bold;
  color: var(--link);
}

.dir:hover {
  color: var(--linkHover);
}

.ffile {
  cursor: pointer;
  background-color: var(--linkHover);
}
.ffile:hover {
  color: var(--linkHover);
}
</style>
