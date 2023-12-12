<template lang="pug">
.main
  .dropzone-container(
    @dragover="dragover"
    @dragleave="dragleave"
    @drop="drop"
    :style="isDragging && 'border-color: cyan;'"
  )
    input.hidden-input(
      type="file"
      multiple
      name="file"
      id="fileInput"
      class="hidden-input"
      @change="onChange"
      ref="file"
      accept="*"
    )
    label.file-label(for="fileInput")
      div(v-if="isDragging") Release file here to add
      div(v-else) Drop files here or
        b &nbsp;click&nbsp;
        | here to upload
    .preview-container.mt-4(v-if="files.length")
      .preview-card(v-for="file in files" :key="file.name")
        p {{  file.name }}
        button.ml-2(type="button"
          @click="remove(files.indexOf(file))"
          title="Remove file"
        )
          b &nbsp;
            i.fa.fa-times
</template>

<script lang="ts">
export default {
  props: {
    server: { type: Object, required: true },
  },

  data() {
    return {
      isDragging: false,
      files: [] as any[],
      showMessage: false,
    }
  },
  watch: {
    files() {
      console.log('files changed')
      this.$emit('files', this.files)
    },
  },

  methods: {
    onChange() {
      const self = this
      const file = this.$refs.file as any
      let incomingFiles = Array.from(file.files) as any[]
      const fileExists = self.files.some(r =>
        incomingFiles.some(file => file.name === r.name && file.size === r.size)
      )
      if (fileExists) {
        self.showMessage = true
        alert('New upload contains files that already exist')
      } else {
        self.files.push(...incomingFiles)
      }
    },
    dragover(e: any) {
      e.preventDefault()
      this.isDragging = true
    },
    dragleave() {
      this.isDragging = false
    },
    drop(e: any) {
      e.preventDefault()
      const file = this.$refs.file as any
      file.files = e.dataTransfer.files
      this.onChange()
      this.isDragging = false
    },
    remove(i: number) {
      this.files.splice(i, 1)
    },
    uploadFiles() {},
  },
}
</script>

<style scoped lang="scss">
.main {
  display: flex;
  flex-grow: 1;
  align-items: center;
  justify-content: center;
  text-align: center;
  margin-bottom: 1rem;
}

.dropzone-container {
  padding: 3rem;
  background: #f8f9de55;
  border: 5px dashed #0d7074;
}

.hidden-input {
  opacity: 0;
  overflow: hidden;
  position: absolute;
  width: 1px;
  height: 1px;
}

.file-label {
  font-size: 1rem;
  display: block;
  cursor: pointer;
  min-width: 20rem;
}

.preview-container {
  display: flex;
  margin-top: 2rem;
}

.preview-card {
  display: flex;
  border: 1px solid #a2a2a2;
  padding: 5px;
  margin-left: 5px;
}

.preview-img {
  width: 50px;
  height: 50px;
  border-radius: 5px;
  border: 1px solid #a2a2a2;
  background-color: #a2a2a2;
}

.ml-2:hover {
  cursor: pointer;
  color: #c44;
}
</style>
