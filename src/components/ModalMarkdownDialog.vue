<template lang="pug">
.xmodal
  .modal-background
  .modal-card
    header.modal-card-head
      p.modal-card-title {{ title }}
      button.delete(aria-label="close" @click="clicked(0)")

    section.modal-card-body
      .content(v-html="md")

    footer.modal-card-foot
      b-button.xbutton(v-if="buttons.length == 1" class="button is-link" @click="clicked(buttons[0])") {{ buttons[0] }}
      b-button.xbutton(v-for="msg,i in buttons" :key="msg"
        :class="{'is-danger': i == 0, 'is-outlined': i==0}"
        :style="{'margin-right': i == 0 ? 'auto' : '0.5rem'}"
        :autofocus="i==buttons.length-1 ? true : undefined"
        @click="clicked(i)"
      ) {{ msg }}
</template>

<script lang="ts">
import { defineComponent } from 'vue'

export default defineComponent({
  name: 'ModalMarkdownDialog',
  // components: { AnimationHelpText },
  props: {
    title: String,
    md: String,
    buttons: Array,
  },
  data: () => {
    return {
      html: '',
    }
  },
  methods: {
    clicked(msg: any) {
      this.$emit('click', msg)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.xmodal {
  margin: 3rem auto 0 0;
  // background-color: #00000020;
  // height: 100%;
  font-size: 1.1rem;
}

.xbutton {
  text-transform: uppercase;
  padding: 0 2rem;
}

.modal-background {
  z-index: 100;
}
.modal-card {
  z-index: 200;
}
.modal-card-head {
  padding: 0.25rem 0.5rem 0.5rem 1.5rem;
  box-shadow: none;
  background-color: $panelTitle;
  border-radius: 3px 3px 0 0;
}
.modal-card-foot {
  padding-top: 0px;
  border-radius: 0 0 3px 3px;
  background-color: white;
  border: none;
}
.modal-card-title {
  color: #fff;
  font-size: 1rem;
  font-weight: bold;
}
</style>
