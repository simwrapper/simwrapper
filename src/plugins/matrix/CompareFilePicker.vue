<template lang="pug">
.compare-picker
  .c-title Select matrix file for comparison
  .c-info Choose matrix file from this folder or navigate to find the file:
  .c-selection {{ curFolder }}
  .c-inner.flex1
    .c-items.flex-column.flex1(v-if="!dirEntry")
      p Loading...
    .c-items.flex-column.flex1(v-else)
      .dir(
        @click="clickItem('🔼 UP', 'up')"
        :class="{'is-selected': selection == '🔼 UP'}"
      ) 🔼 UP
      .dir(v-for="dir in dirEntry.dirs" :key="dir"
        @click="clickItem(dir, 'dir')"
        :class="{'is-selected': selection == dir}"
      ) 🗂️ {{ dir }}/
      .ffile(v-for="f in dirEntry.files" :key="f"
        @click="clickItem(f, 'file')"
        :class="{'is-selected': selection == f}"
      ) {{ f }}
  .c-button-bar.flex-row
    b-button.is-small(@click="$emit('choose')") CANCEL
    b-button.is-small(type="is-success"
      @click="choose"
      :disabled="!isFileSelected"
    ) SELECT FILE

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
      numClicks: 0,
      isFileSelected: false,
    }
  },

  async mounted() {
    const stuff = await this.fileApi.getDirectory(this.subfolder)
    this.dirEntry = stuff
    this.selection = this.subfolder
    this.curFolder = this.subfolder
  },

  computed: {},

  watch: {
    filenameShapes() {
      this.$emit('shapes', this.filenameShapes)
    },
  },
  methods: {
    clickItem(text: string, type: string) {
      // console.log(type, text)
      this.numClicks++

      if (this.numClicks === 1) {
        this.selection = text
        this.isFileSelected = type == 'file'
        // console.log('One click', this.selection)
        setTimeout(async () => {
          if (this.numClicks == 2) {
            // console.log('Double click')
            switch (type) {
              case 'up':
                this.curFolder = this.curFolder.split('/').slice(0, -1).join('/')
                this.dirEntry = null
                this.selection = ''
                await this.$nextTick()
                this.dirEntry = await this.fileApi.getDirectory(this.curFolder)
                break
              case 'dir':
                this.curFolder = this.curFolder += '/' + text
                this.dirEntry = null
                this.selection = ''
                await this.$nextTick()
                this.dirEntry = await this.fileApi.getDirectory(this.curFolder)
                break
              case 'file':
                this.choose()
                break
              default:
                break
            }
          }
          this.numClicks = 0 // reset the first click
        }, 250) // wait a bit
      }
    },
    choose() {
      const comparator = {
        root: this.fileApi.getSlug(),
        subfolder: this.curFolder,
        filename: this.selection,
      }
      this.$emit('choose', comparator)
    },
  },
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
  inset: 1rem 1rem 1rem 18.7rem;
  display: flex;
  flex-direction: column;
  background-color: var(--bg);
  border: 1px solid $appTag; // #bbbbcc88;
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
  padding: 6px 4px 2px 5px;
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
  padding: 0px 6px;
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
}
.ffile:hover {
  color: var(--linkHover);
}

.is-selected {
  background-color: var(--bgTreeItem) !important;
  color: var(--textBold);
}
.is-selected:hover {
  color: var(--textBold);
}
</style>
