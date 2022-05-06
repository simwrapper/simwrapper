<template lang="pug">
.join-picker
  .picker-panel
    p.header: b Join datasets
    p.subheader Select the data columns containing matching IDs
    .split-panel
      .column
          p: b {{ data1.title }}
          .options-box
            p(v-for="(row,i) in data1.columns.sort()" :key="i"
              :class="{'selected': i===selected1}"
              @click="selected1=i"
            ) {{ row }}

      .linky
          p <->
      .column
          p: b {{ data2.title }}
          .options-box
            p(v-for="(row,i) in data2.columns.sort()" :key="i"
              :class="{'selected': i===selected2}"
              @click="selected2=i"
            ) {{ row }}

    .buttons
      .button-holder
        button.button(@click="clickedCancel") Cancel
        button.button.is-primary(@click="clickedJoin") Join

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

@Component({
  i18n,
  components: {} as any,
})
class MyComponent extends Vue {
  @Prop({ required: true }) private data1!: { title: string; columns: string[] }
  @Prop({ required: true }) private data2!: { title: string; columns: string[] }

  private selected1 = 0
  private selected2 = 0

  private clickedJoin() {
    this.$emit('join', [this.data1.columns[this.selected1], this.data2.columns[this.selected2]])
  }

  private clickedCancel() {
    this.$emit('join', [])
  }
}

export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.join-picker {
  background-color: #000022aa;
  z-index: 10000;
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  right: 0;
  user-select: none;
}

.picker-panel {
  position: relative;
  top: 25%;
  background-color: #dcdce9;
  max-width: 30rem;
  margin: 0 auto;
  box-shadow: 0 2px 24px 5px #00000066;
  border-radius: 4px;
}

.split-panel {
  width: 100%;
  display: flex;
  flex-direction: row;
}

.column {
  padding: 0 0;
  margin: 0.5rem 0.75rem;
}

.options-box {
  border: 1px solid #bbb;
  background-color: white;
  max-height: 12rem;
  overflow-y: auto;
}

.options-box p {
  padding: 0 0.25rem;
}

.linky {
  margin-top: 3rem;
}

.header {
  background-color: white;
  padding: 0.25rem 0.75rem;
  border-radius: 4px;
  font-size: 1.2rem;
}

p.selected {
  background-color: #e8ee67;
}

.subheader {
  padding: 0.25rem 0.75rem;
}

.button-holder {
  margin: 0.25rem 0.75rem 0.25rem auto;
}
</style>
