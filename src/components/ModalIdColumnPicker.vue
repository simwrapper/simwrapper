<template lang="pug">
.join-picker
  .picker-panel
    p.header: b Select ID Column
    p.subheader Which property contains the unique ID for each feature?
    .split-panel
      .column
          p: b {{ data1.title }}
          .options-box
            p(v-for="(row,i) in columns" :key="'@'+i"
              :class="{'selected': i===selected1}"
              @click="selected1=i"
            ) {{ row }}

    .buttons
      .button-holder
        button.button(@click="clickedCancel") Cancel
        button.button.is-primary(@click="clickedJoin") Select

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

interface DataSet {
  title: string
  columns: string[]
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'

// Reasonable guesses as to the ID column in the shapefile
const ID_GUESSES = ['id', 'ID', 'TAZ', 'AB']

export default defineComponent({
  name: 'ModalJoinColumnPicker',
  i18n,
  props: {
    data1: { type: Object as PropType<DataSet>, required: true },
  },

  data() {
    return {
      selected1: 0,
    }
  },

  computed: {
    columns(): string[] {
      return [...this.data1.columns].sort()
    },
  },

  methods: {
    clickedJoin() {
      this.$emit('join', this.columns[this.selected1])
    },

    clickedCancel() {
      this.$emit('join', '')
    },
  },
  mounted() {
    // pick a plausible default for the ID column
    for (const guess of ID_GUESSES) {
      const found = this.columns.indexOf(guess)
      if (found > -1) {
        this.selected1 = found
        break
      }
    }
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.join-picker {
  background-color: #000022aa;
  z-index: 10000;
  position: fixed;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  width: 100vw;
  height: 100vh;
  user-select: none;
  color: #333;
}

.picker-panel {
  position: relative;
  top: 25%;
  background-color: #dcdce9;
  max-width: 30rem;
  margin: 0 auto;
  box-shadow: 0 2px 24px 5px #00000066;
  border-radius: 4px;
}

.split-panel {
  width: 100%;
  display: flex;
  flex-direction: row;
}

.column {
  padding: 0 0;
  margin: 0.5rem 0.75rem;
}

.options-box {
  border: 1px solid #bbb;
  background-color: white;
  max-height: 20rem;
  overflow-y: auto;
}

.options-box p {
  padding: 0 0.25rem;
}

.linky {
  margin-top: 3rem;
}

.header {
  background-color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 1.2rem;
}

p.selected {
  background-color: #e8ee67;
}

.subheader {
  padding: 0.25rem 0.75rem;
}

.button-holder {
  margin: 0.25rem 0.75rem 0.25rem auto;
}
</style>
