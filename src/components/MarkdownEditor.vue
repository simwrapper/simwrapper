<template lang="pug">
#editor
  .actions
    button.button.is-light.is-small(v-if="!isEditing" @click="clickedEdit") {{ value ? "&nbsp;Edit&nbsp;" : "+Add Notes" }}
    button.button.is-small.is-text(v-if="isEditing" @click="clickedCancel") Cancel
    button.button.is-link.is-small(v-if="isEditing" @click="clickedSave") Save
  .content
    textarea(
      @input="update"
      :value="editorContent"
      :class="{'is-hidden': !isEditing, 'bye': isLeaving}")

    .preview(v-html="compiledMarkdown")

    hr(v-if="value || editorContent")

</template>

<script lang="ts">
import marked from 'marked'
import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

const vueInstance = Vue.extend({
  components: {},
  data() {
    return {
      editorContent: '',
      previous: '',
      isEditing: false,
      isLeaving: false,
    }
  },
})

@Component
export default class MarkdownEditor extends vueInstance {
  @Prop({ required: true })
  private value!: string

  @Watch('$route')
  private onRouteChanged(to: any, from: any) {
    // this gets called if we navigate from one user page to another;
    // e.g. from the search box.

    this.isEditing = false
    this.previous = ''
    this.editorContent = this.value
  }

  private created() {
    this.editorContent = this.value
  }

  private update(e: any) {
    this.editorContent = e.target.value
  }

  private clickedEdit(this: any) {
    this.previous = this.value
    if (!this.value) this.editorContent = '## Notes\n\nAdd notes to this page using **markdown text**.\n'
    else this.editorContent = this.value

    this.isEditing = !this.isEditing
  }

  private clickedCancel(this: any) {
    this.editorContent = ''
    this.fadeAway()
  }

  private clickedSave(this: any) {
    this.$emit('save', this.editorContent)
    this.fadeAway()
  }

  private fadeAway() {
    this.isLeaving = true
    setTimeout(() => {
      this.isEditing = !this.isEditing
      this.isLeaving = false
    }, 300)
  }
  private get compiledMarkdown() {
    return marked(this.editorContent || this.value, { gfm: true })
  }
}
</script>

<style scoped>
#editor {
  color: #333;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding-top: 1rem;
}

textarea,
#editor div {
  vertical-align: top;
}

.actions {
  display: flex;
  flex-direction: row;
  margin-left: auto;
  margin-top: -2.5rem;
  margin-bottom: 0.25rem;
}

textarea {
  flex: 1;
  border: none;
  border-right: 1px solid #ccc;
  resize: none;
  outline: none;
  background-color: #f6f6f6;
  font-size: 0.8rem;
  font-family: 'Monaco', courier, monospace;
  padding: 0.5rem;
  margin-bottom: 1rem;
  min-height: 20rem;
  border: 1px solid #4499cc;
  animation: 0.3s ease 0s 1 slideInFromLeft;
}

.content {
  display: flex;
  flex-direction: column;
  width: 100%;
  margin-bottom: 0.5rem;
  margin-right: 0.5rem;
}

.is-hidden {
  display: none;
}

.bye {
  animation: 0.3s ease 0s 1 slideOutToLeft;
}

@keyframes slideInFromLeft {
  from {
    transform: translateX(-100%);
    opacity: 0;
  }
  to {
    transform: translateX(0);
    opacity: 1;
  }
}

@keyframes slideOutToLeft {
  from {
    transform: translateX(0);
    opacity: 1;
  }
  to {
    transform: translateX(-100%);
    opacity: 0;
  }
}

code {
  color: #f66;
}

.preview {
  margin-top: 1rem;
  flex: 1;
}

.button {
  margin-bottom: 0.25rem;
  margin-left: 0.5rem;
}
</style>
