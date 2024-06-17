<template>
  <div class="fs-file-selector" :class="{ 'fs-drag-enter': isDragEnter }">
    <div class="fs-loader" v-show="isLoading">
      <slot name="loader"> Loading... </slot>
    </div>

    <div
      class="fs-droppable"
      ref="fsDroppable"
      :style="{ height: height + 'px' }"
      :class="{ isDragEnter: 'is-dragging' }"
      @dragenter.stop.prevent="startDrag()"
      @dragover.stop.prevent="startDrag()"
      @dragleave="isDragEnter = false"
      @drop.stop.prevent="handleDrop"
    >
      <input
        ref="fsFileInput"
        type="file"
        tabindex="-1"
        :multiple="multiple"
        :accept="acceptExtensions"
        @change="handleFilesChange"
      />
      <slot name="top"></slot>

      <div href="#" class="fs-btn-select" @click="$refs.fsFileInput.click()">
        <slot>Select</slot>
      </div>

      <slot name="bottom"></slot>
    </div>
  </div>
</template>

<script>
export default {
  name: 'FileSelector',

  props: {
    multiple: {
      type: Boolean,
      default: false,
    },

    isLoading: {
      type: Boolean,
      default: false,
    },

    acceptExtensions: {
      type: String,
      default: '',
    },

    maxFileSize: {
      // in bytes
      type: Number,
      default: NaN,
    },

    height: {
      type: Number,
      default: NaN,
    },

    validateFn: {
      type: Function,
      default: () => true,
    },
  },

  data() {
    return {
      isDragEnter: false,
    }
  },

  methods: {
    startDrag() {
      this.isDragEnter = true
    },

    handleFilesChange($event) {
      this.preprocessFiles($event.target.files)
    },

    handleDrop($event) {
      this.isDragEnter = false
      this.preprocessFiles($event.dataTransfer.files)
    },

    checkFileExtensions(files) {
      // get non-empty, unique extension items
      const extList = [...new Set(this.acceptExtensions.toLowerCase().split(',').filter(Boolean))]
      const list = Array.from(files)

      // check if the selected files are in supported extensions
      const invalidFileIndex = list.findIndex(file => {
        const ext = `.${file.name.toLowerCase().split('.').pop()}`

        return !extList.includes(ext)
      })

      // all exts are valid
      return invalidFileIndex === -1
    },

    checkFileSize(files) {
      if (Number.isNaN(this.maxFileSize)) {
        return true
      }

      const list = Array.from(files)

      // find invalid file size
      const invalidFileIndex = list.findIndex(file => file.size > this.maxFileSize)

      // all file size are valid
      return invalidFileIndex === -1
    },

    validate(files) {
      // file selection
      if (!this.multiple && files.length > 1) {
        return 'MULTIFILES_ERROR'
      }

      // extension
      if (!this.checkFileExtensions(files)) {
        return 'EXTENSION_ERROR'
      }

      // file size
      if (!this.checkFileSize(files)) {
        return 'FILE_SIZE_ERROR'
      }

      // custom validation
      return this.validateFn(files)
    },

    preprocessFiles(files) {
      const result = this.validate(files)
      this.$emit('validated', result, files)

      // validation
      if (result === true) {
        this.$emit('changed', files)
      }

      // clear selected files
      this.$refs.fsFileInput.value = ''
    },
  },
}
</script>

<style lang="scss" scoped>
.fs-file-selector {
  position: relative;

  .fs-loader {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    z-index: 1;

    display: flex;
    justify-content: center;
    align-items: center;
  }

  .fs-droppable {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    position: relative;
    padding-bottom: 1rem;

    input[type='file'] {
      visibility: hidden;
      position: absolute;
      width: 1px;
      height: 1px;
    }
  }

  &.fs-drag-enter {
    // to prevent dragleave event triggered while user dragging over child items
    .fs-droppable::before {
      content: '';
      position: absolute;
      top: 0;
      bottom: 0;
      width: 100%;
      height: 100%;
      z-index: 9999999;
      border: 5px dashed #2a5af8;
      border-radius: 10px;
    }
  }
}
</style>
