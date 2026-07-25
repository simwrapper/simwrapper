<template lang="pug">
.editable-field
  span(@click="activateEditor" v-show="!editing") {{modelValue || '&nbsp;-&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}}
  span.editor(v-if="editing"
  )
    input.finger(
      :value="modelValue"
      :ref="id"
      @blur="lostFocus($event)"
      @keydown.enter="editing=false"
      type="text"
      class="form-control"
    )
</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

export default defineComponent({
  name: 'EditableField',
  components: {},
  props: {
    modelValue: String,
  },

  data: () => {
    return {
      editing: false,
      id: `ref-${Math.random()}`,
    }
  },

  mounted() {},
  computed: {},
  methods: {
    activateEditor() {
      this.editing = true
      this.$nextTick(() => {
        const input = this.$refs[this.id] as HTMLElement
        input.focus()
      })
    },

    lostFocus($event: any) {
      this.editing = false
      this.$emit('update:modelValue', $event.target.value)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.editable-field {
  cursor: pointer;
  min-width: 5rem;
}

.editor {
  margin-left: -2px;
  padding: 2px 2px;
  background-color: white;
}

.finger {
  cursor: text;
}

@media only screen and (max-width: 640px) {
}
</style>
