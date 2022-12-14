<template lang="pug">
.panel

  .top-panel
    h4(:style="headerTextColor") Issues

    .warnings
      .no-error(v-if="!state.statusErrors.length && !state.statusWarnings.length")
        p.check ☑️
        p No issues for this page.

      .message-area(v-else)
        h3(v-if="state.statusErrors.length") Errors: {{state.statusErrors.length}}
        .single-message(v-for="err,i in state.statusErrors")
          li(v-html="err.msg" @click="toggleShowDescription(i, true)")
          .description(v-if="descriptionIndexListError.includes(i)")
            p(v-html="err.desc")
        h3(v-if="state.statusWarnings.length") Warnings: {{state.statusWarnings.length}}
        .single-message(v-for="err,i in state.statusWarnings")
          li(v-html="err.msg" @click="toggleShowDescription(i, false)")
          .description(v-if="descriptionIndexListWarning.includes(i)")
            p(v-html="err.desc")


  .bottom-panel
    b-button.clear-button(
      v-if="state.statusErrors.length || state.statusWarnings.length"
      expanded
      @click="clearAllButtons()"
    ) Clear all messages

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { sync: 'Sync folders', theme: 'Light/Dark', lang: 'EN/DE', split: 'Split view' },
    de: { sync: 'Sync', theme: 'Hell/Dunkel', lang: 'DE/EN', split: 'Aufteilen' },
  },
}

import { defineComponent } from 'vue'

import globalStore from '@/store'

export default defineComponent({
  name: 'ErrorPanel',
  i18n,
  data: () => {
    return {
      state: globalStore.state,
      showDescription: false,
      descriptionIndexListWarning: [] as number[],
      descriptionIndexListError: [] as number[],
      isError: false,
    }
  },
  watch: {
    '$route.path'() {
      this.clearAllButtons()
    },
  },
  computed: {
    headerTextColor() {
      let color = {}
      if (this.state.statusWarnings.length) color = { color: '#fe8' }
      if (this.state.statusErrors.length) color = { color: '#f66' }
      return color
    },
  },
  methods: {
    clearAllButtons() {
      this.$store.commit('clearAllErrors')

      // if error panel is actually open and visible, switch to file panel
      this.$emit('activate', { name: 'Files', class: 'BrowserPanel', onlyIfVisible: true })
    },

    toggleShowDescription(i: number, isError: boolean) {
      this.isError = isError
      if (isError) {
        if (this.descriptionIndexListError.includes(i)) {
          var index = this.descriptionIndexListError.indexOf(i)
          this.descriptionIndexListError.splice(index, 1)
        } else {
          this.descriptionIndexListError.push(i)
        }
      } else {
        if (this.descriptionIndexListWarning.includes(i)) {
          var index = this.descriptionIndexListWarning.indexOf(i)
          this.descriptionIndexListWarning.splice(index, 1)
        } else {
          this.descriptionIndexListWarning.push(i)
        }
      }
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.panel {
  user-select: none;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.25rem 0;
  color: var(--text);
}

h4 {
  background-color: #00000080;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #ddd;
}

.top-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  margin: 0.25rem 0.5rem 0.5rem 0.5rem;
}

.bottom-panel {
  margin-top: auto;
  padding: 0 0.5rem 0.25rem 0.5rem;
}

a {
  font-size: 1.1rem;
}

.top {
  margin-top: 1rem;
}

.commands {
  display: flex;
  flex-direction: row;
  // margin-right: -0.5rem;
}

.commands .button {
  flex: 1;
  color: #a19ebb;
  margin-right: 0.25rem;
  padding: 0 0;
}

.commands .button:hover {
  color: var(--link);
}

.warnings {
  display: flex;
  flex-direction: column;
  padding: 0rem 0rem;
  margin: 0 0 0 0.25rem;
  text-align: left;
  font-size: 0.9rem;
}

.message-area {
  text-indent: -20px;
  margin-left: 20px;
}

.message-area h3 {
  margin-top: 1rem;
  font-size: 1.2rem;
}

.single-message {
  list-style-position: outside;
  cursor: pointer;
}

.description {
  width: 100%;
  height: min-content;
  background-color: rgb(95, 123, 167);
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
  padding: 0 0.25rem;
  text-indent: 0;
  margin-left: 0px;
}

.no-error p {
  user-select: none;
  text-align: center;
}

.check {
  margin-top: 2rem;
  margin-bottom: 0.5rem;
  font-size: 2rem;
}

::-webkit-scrollbar-corner {
  background: rgba(0, 0, 0, 0);
}

@media only screen and (max-width: 640px) {
}
</style>
