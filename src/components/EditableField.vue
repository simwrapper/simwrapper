<template lang="pug">
.editable-field
  span(@click="editing=true" v-show="!editing") {{value || '&nbsp;-&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;'}}
  span.editor(v-show="editing")
    input.finger(
      :value="value"
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
    value: String,
  },

  data: () => {
    return {
      editing: false,
    }
  },

  mounted() {},
  computed: {},
  methods: {
    lostFocus($event: any) {
      this.editing = false
      this.$emit('input', $event.target.value)
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
  background-color: #44448822;
}

.finger {
  cursor: text;
}

@media only screen and (max-width: 640px) {
}
</style>
