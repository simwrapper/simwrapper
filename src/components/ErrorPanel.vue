<template lang="pug">
.panel

  .top-panel
    h4 Problems on this page

    .warnings
      .message-area(v-if="!state.statusErrors.length && !state.statusWarnings.length")
        p.no-error No errors or warnings for this page.

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
    button.button.clear-button.is-warning(v-if="state.statusErrors.length && showWarnings || state.statusWarnings.length && showWarnings" @click="clearAllButtons()") Clear all messages

    .commands
      button.button(v-if="state.statusErrors.length" :class="{'is-dark' : state.isDarkMode}" style="background-color: red; color: white; border-color: red" @click="onWarning" :title="$t('lang')"): i.fa.fa-exclamation-triangle
      button.button(v-if="!state.statusErrors.length && state.statusWarnings.length" :class="{'is-dark' : state.isDarkMode}" style="background-color: yellow; border-color: yellow" @click="onWarning" :title="$t('lang')"): i.fa.fa-exclamation-triangle
      button.button(v-if="!state.statusErrors.length && !state.statusWarnings.length" :class="{'is-dark' : state.isDarkMode}" @click="onWarning" :title="$t('lang')"): i.fa.fa-exclamation-triangle

    p(style="margin: 0.25rem 0.25rem 0.25rem 0.5rem") {{ state.runFolderCount ? `Folders scanned: ${state.runFolderCount}` : '' }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: { sync: 'Sync folders', theme: 'Light/Dark', lang: 'EN/DE', split: 'Split view' },
    de: { sync: 'Sync', theme: 'Hell/Dunkel', lang: 'DE/EN', split: 'Aufteilen' },
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import globalStore from '@/store'
import TreeView from '@/components/TreeView.vue'

const BASE_URL = import.meta.env.BASE_URL

interface Folder {
  root: string
  path: string
  name: string
  children: Folder[]
  level: number
}

@Component({
  i18n,
  components: { TreeView },
})
class MyComponent extends Vue {
  private state = globalStore.state

  private baseURL = BASE_URL

  private showWarnings = true
  private showDescription = false
  private descriptionIndexListWarning: number[] = []
  private descriptionIndexListError: number[] = []
  private isError = false

  private mounted() {}

  @Watch('$route.path') test() {
    this.clearAllButtons()
  }

  private clearAllButtons() {
    this.$store.commit('clearAllErrors')
    this.showWarnings = false
  }

  private onWarning() {
    this.showWarnings = !this.showWarnings
  }

  private toggleShowDescription(i: number, isError: boolean) {
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
  }
}
export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.panel {
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 0.25rem;
}

h4 {
  background-color: #00000040;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.5rem;
}

.top-panel {
  display: flex;
  flex-direction: column;
  overflow-y: auto;
  flex: 1;
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
  margin: 0 auto 0 0.25rem;
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

.no-error {
  text-indent: 0;
  margin-left: -20px;
}

.clear-button {
  width: 100%;
  margin-bottom: 0.5rem;
  margin-left: 0rem;
}

::-webkit-scrollbar-corner {
  background: rgba(0, 0, 0, 0);
}

@media only screen and (max-width: 640px) {
  .content {
    padding: 2rem 1rem 8rem 1rem;
    flex-direction: column-reverse;
  }

  .headline {
    padding: 0rem 0rem 1rem 0rem;
    font-size: 1.5rem;
    line-height: 1.8rem;
  }
}
</style>
