<template lang="pug">
.modal
  .modal-background
  .modal-card
    header.modal-card-head
      p.modal-card-title {{ title }}
      button.delete(aria-label="close" @click="clicked('close')")

    section.modal-card-body
      .content
        AnimationHelpText

    footer.modal-card-foot
      button(v-if="buttons.length == 1" class="button is-link" @click="clicked(buttons[0])") {{ buttons[0] }}
      button(v-for="msg in buttons.slice(1)" :key="msg" class="button" @click="clicked(msg)") {{ msg }}
</template>

<script lang="ts">
import { Vue, Component, Watch, Prop } from 'vue-property-decorator'

import AnimationHelpText from '@/assets/animation-helptext.md'

@Component({ components: { AnimationHelpText }, props: {} })
export default class VueComponent extends Vue {
  @Prop({ required: true }) private title!: string
  @Prop({ required: true }) private md!: string
  @Prop({ required: true }) private buttons!: string[]

  private html: string = ''

  private mounted() {}

  private clicked(msg: string) {
    this.$emit('click', msg)
  }
}
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.modal {
  margin-top: 3rem;
}

@media only screen and (max-width: 640px) {
}
</style>
