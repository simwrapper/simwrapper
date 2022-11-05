<template lang="pug">
.add-data


  .add
    .markdown(v-html="notes")
    .flex-row
      p.flex1: b Label
      b-input.flex5(placeholder="e.g. server1" maxlength="32" v-model="labelField")
    .flex-row
      p.flex1: b URL
      b-input.flex5(placeholder="http://localhost:8001" maxlength="512" v-model="urlField")
    .flex-row
      p.flex1: b Note
      b-input.flex5(placeholder="optional" maxlength="255" v-model="noteField")
    .flex-row
      p.flex1 &nbsp;
      b-button.is-warning(
        :disabled="!isValidURL"
        :type="isValidURL ? '' : 'is-outlined'"
        @click="addURL"
      ) Add Data URL

</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'
import MarkdownIt from 'markdown-it'

import globalStore from '@/store'

const mdAddNotes = `
Add a local shortcut for any resource that serves files directly over HTTP.
SimWrapper requires several server settings, including:

- Open access (no login)
- File and directory listings
-  CORS "Access-Control-Allow-Origin" header
`

@Component({ components: {}, props: {} })
export default class VueComponent extends Vue {
  private labelField = ''
  private urlField = ''
  private noteField = ''

  private mdParser = new MarkdownIt()
  private notes = ''

  private mounted() {
    this.notes = this.mdParser.render(mdAddNotes)
  }

  private get isValidURL() {
    if (!this.labelField) return false
    if (!this.urlField) return false
    if (!this.urlField.startsWith('http')) return false
    return true
  }

  @Watch('labelField') fixField() {
    this.labelField = this.labelField.toLowerCase().replaceAll(/[^a-z\-0-9@]*/g, '')
  }

  // @Watch('urlField') fixURLField() {
  //   this.urlField = this.urlField.replaceAll(/[^a-z%\-0-9@]*/g, '')
  // }

  private addURL() {
    this.fixField()
    console.log('Adding', this.labelField, this.urlField)

    const KEY = 'projectShortcuts'
    try {
      let existingRoot = localStorage.getItem(KEY) || ('{}' as any)

      let roots = JSON.parse(existingRoot)

      roots[this.labelField] = {
        name: `${this.labelField}`,
        slug: `${this.labelField}`,
        description: this.noteField,
        baseURL: this.urlField,
      }

      console.log('NEW ROOTS', roots)
      localStorage.setItem(KEY, JSON.stringify(roots))
      globalStore.commit('setURLShortcuts', roots)
    } catch (e) {
      // you failed
      console.error('' + e)
    }
  }
}
</script>

<style scoped lang="scss">
// @import '@/styles.scss';

.add {
  gap: 0.25rem;
  margin: 0.5rem 0 1rem 0;
  color: white;

  b-field {
    color: white;
  }
}

.flex-row {
  width: 100%;
  margin-bottom: 4px;
}
.flex1 {
  text-align: right;
  margin: auto 0.5rem;
}

.markdown {
  margin-bottom: 1rem;
  line-height: 1.3rem;
}

b-button {
  text-align: right;
}

@media only screen and (max-width: 640px) {
}
</style>
