<template lang="pug">
.panel

    //- .close(@click.stop="$emit('close')")
    //-   i.fa.fa-times

    // theme ------------------
    .option
      h5 {{ $t('theme') }}
      b-button.button.is-small.is-white(@click="setTheme('light')"
        outlined
        :style="isLight") {{ $t('light') }}

      b-button.button.is-small.is-gray(@click="setTheme('dark')"
        outlined
        :style="isDark") {{ $t('dark') }}

    // language ---------------
    .option
      h5 {{ $t('language') }}
      b-button.button.is-small.is-white(@click="setLanguage('en')"
        outlined
        :style="isEN") EN

      b-button.button.is-small.is-gray(@click="setLanguage('de')"
        outlined
        :style="isDE") DE

    // gamepad axes
    .option
      h5 {{ $t('gamepad') }}
      b-button.button.is-small.is-white(@click="setGamepad(1)"
        outlined
        :style="isNormal") {{ $t('gamepad-normal') }}

      b-button.button.is-small.is-gray(@click="setGamepad(-1)"
        outlined
        :style="isInverted") {{ $t('gamepad-inverted') }}

    // account / auth ---------------
    //- .option
    //-   h5 {{ $t('authentication') }}
    //-   b-button.button.is-small.is-white(@click="clearTokens()"
    //-     outlined
    //-     :style="yellow") {{ $t('clearToken') }}

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
      dataSources: 'Data Sources',
      addDataSources: 'Add Data Source',
      authentication: 'Accounts',
      clearToken: 'Logout',
      gamepad: 'Gamepad',
      'gamepad-normal': 'Normal',
      'gamepad-inverted': 'Inverted',
    },
    de: {
      translate: 'Die Übersetzungen sind unvollständig, werden aber immer besser...',
      theme: 'Thema',
      light: 'Hell',
      dark: 'Dunkel',
      language: 'Sprache',
      dataSources: 'Datenquellen',
      authentication: 'Accounts',
      clearToken: 'Logout',
      gamepad: 'Gamepad',
      'gamepad-normal': 'Normal',
      'gamepad-inverted': 'Inverted',
    },
  },
}

import { defineComponent } from 'vue'

import globalStore from '@/store'
import fileSystems from '@/js/HTTPFileSystem'
import HTTPFileSystem from '@/js/HTTPFileSystem'

export default defineComponent({
  name: 'SettingsPanel',
  i18n,
  data: () => {
    return {
      state: globalStore.state,
      theme: '',
      shortcuts: [] as any[],
    }
  },
  mounted() {
    this.theme = this.state.isDarkMode ? 'dark' : 'light'
  },
  watch: {
    'state.isDarkMode'() {
      this.theme = this.state.isDarkMode ? 'dark' : 'light'
    },
  },
  computed: {
    yellow(): any {
      return {
        backgroundColor: '#ff6657',
        color: '#222',
        borderColor: '#aaa',
      }
    },

    isLight(): any {
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
    },

    isDark(): any {
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
    },

    isNormal(): any {
      return this.state.gamepad == 1
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
    },

    isInverted(): any {
      return this.state.gamepad == -1
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
    },

    isEN(): any {
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
    },

    isDE(): any {
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
    },
  },
  methods: {
    setTheme(theme: string) {
      this.theme = theme
      globalStore.commit('setTheme', theme)
      setTimeout(() => this.$emit('close'), 700)
    },

    setLanguage(lang: string) {
      this.$store.commit('setLocale', lang)
      this.$root.$i18n.locale = lang
      setTimeout(() => this.$emit('close'), 700)
    },

    setGamepad(value: number) {
      this.$store.commit('setGamepad', value)
      setTimeout(() => this.$emit('close'), 700)
    },

    clearTokens() {
      for (const fileSystem of globalStore.state.svnProjects) {
        if (fileSystem.needPassword) {
          localStorage.removeItem(`auth-token-${fileSystem.slug}`)
          const fs = new HTTPFileSystem(fileSystem, globalStore)
          fs.clearCache()
        }
      }
      setTimeout(() => {
        this.$emit('close')
        this.$router.replace('/')
      }, 500)
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.panel {
  user-select: none;
  display: flex;
  flex-direction: column;
  // width: 12rem;
}

h4 {
  background-color: #00000080;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.5rem;
  font-weight: bold;
}

h5 {
  font-weight: bold;
  margin-top: 0rem;
  margin-bottom: 0.25rem;
}

.top-panel {
  display: flex;
  flex-direction: column;
  margin: 0.25rem 0.5rem 0rem 0.5rem;
}

.bottom-panel {
  margin: 1rem 0.5rem;
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
  margin-bottom: 1rem;
}

.button:hover {
  border: 1px solid white !important;
}

.option {
  h5 {
    text-transform: uppercase;
  }

  p {
    margin-top: 0.5rem;
    line-height: 1.2rem;
  }
}

.slide-right {
  padding-left: 1rem;
}

.source {
  // margin-left: 1rem;
  margin-bottom: 3px;
  background-color: var(--bgCream4);
}

.source .desc p {
  margin: 0 0;
  padding: 1px 4px;
}

.delete {
  margin: 2px 2px;
  opacity: 0.4;
}

.delete:hover {
  opacity: 1;
  background-color: red;
}

.close {
  position: absolute;
  top: 2px;
  right: 2px;
  float: right;
  text-align: right;
  padding: 0 4px;
  font-size: 0.8rem;
  opacity: 0.4;
}

.close:hover {
  cursor: pointer;
  background-color: #444;
  opacity: 1;
}
</style>
