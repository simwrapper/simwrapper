<template lang="pug">
.main
  .dropzone-container(
    @dragover="dragover"
    @dragleave="dragleave"
    @drop="drop"
    :style="isDragging && 'border-color: yellow;'"
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
      div.uploading(v-if="isUploading")
        p Files are uploading! Don't navigate away from this page.
      div(v-else-if="isDragging") Release file here to add
      div(v-else) Drag files here
        p or
          b &nbsp;click&nbsp;
          | to select files to upload

</template>

<script lang="ts">
export default {
  props: {
    isUploading: { type: Boolean, required: false },
  },

  data() {
    return {
      isDragging: false,
      // files: [] as any[],
      showMessage: false,
    }
  },
  // watch: {
  //   files() {
  //     console.log('files changed')
  //     this.$emit('files', this.files)
  //   },
  // },

  methods: {
    onChange() {
      const file = this.$refs.file as any
      let incomingFiles = Array.from(file.files) as any[]
      this.$emit('files', incomingFiles)
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
      // this.files.splice(i, 1)
    },
    uploadFiles() {},
  },
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.main {
  display: flex;
  flex-grow: 1;
  align-items: center;
  justify-content: right;
  text-align: center;
  margin-bottom: 1rem;
}

.dropzone-container {
  padding: 3rem;
  background: var(--bgPanel);
  border: 5px dashed var(--highlightActiveSection);
  border-radius: 16px;
  filter: $filterShadow;
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
  min-width: 16rem;
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

.uploading {
  font-style: italic;
  font-weight: bold;
  animation: glow 1s infinite alternate;
  font-size: 1rem;
  line-height: 1.1rem;
}

@keyframes glow {
  from {
    color: #c78509;
  }
  to {
    color: #11a932;
  }
}
</style>
