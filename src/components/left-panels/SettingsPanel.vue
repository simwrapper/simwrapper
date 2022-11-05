<template lang="pug">
.panel

  .top-panel
    h4 Settings

  .middle-panel

  .bottom-panel
    // theme ------------------
    .option
      h5 {{ $t('theme') }}
      b-button.button.is-white(@click="setTheme('light')"
        outlined
        :style="isLight") {{ $t('light') }}

      b-button.button.is-gray(@click="setTheme('dark')"
        outlined
        :style="isDark") {{ $t('dark') }}

    // language ---------------
    .option
      h5 {{ $t('language') }}
      b-button.button.is-white(@click="setLanguage('en')"
        outlined
        :style="isEN") EN

      b-button.button.is-gray(@click="setLanguage('de')"
        outlined
        :style="isDE") DE

      //- p {{ $t('translate') }}


</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      translate: 'Note: German translations are incomplete, but steadily improving',
      theme: 'Theme',
      light: 'Light',
      dark: 'Dark',
      language: 'Language',
    },
    de: {
      translate: 'Die Übersetzungen sind unvollständig, werden aber immer besser...',
      theme: 'Thema',
      light: 'Hell',
      dark: 'Dunkel',
      language: 'Sprache',
    },
  },
}

import { Vue, Component, Prop, Watch } from 'vue-property-decorator'

import globalStore from '@/store'

@Component({ i18n, components: {} })
class MyComponent extends Vue {
  private state = globalStore.state

  private theme = ''

  private mounted() {
    this.theme = this.state.isDarkMode ? 'dark' : 'light'
  }

  private get isLight() {
    return this.theme == 'light'
      ? {
          backgroundColor: '#ffdd57',
          color: '#222',
          borderColor: '#aaa',
        }
      : {
          backgroundColor: 'unset',
          color: '#888',
          borderColor: '#aaa',
        }
  }

  private get isDark() {
    return this.theme == 'dark'
      ? {
          backgroundColor: '#7957d5',
          color: 'white',
          borderColor: '#aaa',
        }
      : {
          backgroundColor: 'unset',
          color: '#888',
          borderColor: '#aaa',
        }
  }

  private get isEN() {
    return this.state.locale == 'en'
      ? {
          backgroundColor: '#ffdd57',
          color: '#222',
          borderColor: '#aaa',
        }
      : {
          backgroundColor: 'unset',
          color: '#888',
          borderColor: '#aaa',
        }
  }

  private get isDE() {
    return this.state.locale == 'de'
      ? {
          backgroundColor: '#ffdd57',
          color: '#222',
          borderColor: '#aaa',
        }
      : {
          backgroundColor: 'unset',
          color: '#888',
          borderColor: '#aaa',
        }
  }

  private setTheme(theme: string) {
    this.theme = theme
    console.log(this.theme)
    globalStore.commit('setTheme', theme)
  }

  private setLanguage(lang: string) {
    this.$store.commit('setLocale', lang)
    this.$root.$i18n.locale = lang
  }
}
export default MyComponent
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.panel {
  user-select: none;
  display: flex;
  flex-direction: column;
  height: 100%;
  padding: 0.25rem 0;
  color: var(--text);
}

h4 {
  background-color: #00000040;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.5rem;
}

h5 {
  margin-top: 0rem;
  margin-bottom: 0.25rem;
}

.top-panel {
  display: flex;
  flex-direction: column;
  margin: 0.25rem 0.5rem 1rem 0.5rem;
}

.bottom-panel {
  margin: auto auto 2rem auto;
}

.settings-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 0rem 0rem;
  overflow-y: auto;
}

.message-area h3 {
  margin-top: 1rem;
  font-size: 1.2rem;
}

::-webkit-scrollbar-corner {
  background: rgba(0, 0, 0, 0);
}

.button {
  margin-right: 0.25rem;
  width: 60px;
}

.button:hover {
  border: 1px solid white !important;
}

.option {
  margin-top: 1.5rem;

  h5 {
    text-transform: uppercase;
  }

  p {
    margin-top: 0.5rem;
    line-height: 1.2rem;
  }
}

.middle-panel {
  flex: 1;
  display: flex;
  width: 100%;
  flex-direction: column;
  margin-bottom: 0.5rem;
  padding: 0 0.75rem 0rem 0.75rem;
  overflow-y: auto;
  user-select: none;
}

@media only screen and (max-width: 640px) {
}
</style>
