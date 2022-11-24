<template lang="pug">
.panel

  .top-panel
    h4 Settings

  .middle-panel

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

    .option
      h5 {{ $t('dataSources') }}
      .source.flex-row(v-for="root in shortcuts" :key="root.slug")
        .desc.flex1
          p: b {{ root.slug }}
          p {{ root.description}}
        .delete(@click="deleteShortcut(root.slug)")

    .option
      h5 {{ $t('addDataSources') }}
      add-data-source


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
    },
    de: {
      translate: 'Die Übersetzungen sind unvollständig, werden aber immer besser...',
      theme: 'Thema',
      light: 'Hell',
      dark: 'Dunkel',
      language: 'Sprache',
      dataSources: 'Datenquellen',
    },
  },
}

import { defineComponent } from 'vue'

import globalStore from '@/store'
import AddDataSource from './AddDataSource.vue'

export default defineComponent({
  name: 'SettingsPanel',
  components: { AddDataSource },
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
    this.setupShortcuts()
  },
  watch: {
    'state.svnProjects'() {
      this.setupShortcuts()
    },
    'state.isDarkMode'() {
      console.log('ooop!', this.state.isDarkMode)
      this.theme = this.state.isDarkMode ? 'dark' : 'light'
    },
  },
  computed: {
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
    setupShortcuts() {
      try {
        const storedShortcuts = localStorage.getItem('projectShortcuts')
        if (storedShortcuts) {
          const roots = JSON.parse(storedShortcuts) as any
          this.shortcuts = Object.values(roots)
        }
      } catch (e) {
        console.error('ERROR MERGING URL SHORTCUTS:', '' + e)
      }
    },

    deleteShortcut(slug: string) {
      try {
        const storedShortcuts = localStorage.getItem('projectShortcuts')
        if (storedShortcuts) {
          const roots = JSON.parse(storedShortcuts) as any
          delete roots[slug]

          localStorage.setItem('projectShortcuts', JSON.stringify(roots))
          globalStore.commit('removeURLShortcut', slug)
          this.shortcuts = Object.values(roots)
        }
      } catch (e) {
        console.error('ERROR MERGING URL SHORTCUTS:', '' + e)
      }
    },

    setTheme(theme: string) {
      this.theme = theme
      console.log(this.theme)
      globalStore.commit('setTheme', theme)
    },

    setLanguage(lang: string) {
      this.$store.commit('setLocale', lang)
      this.$root.$i18n.locale = lang
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
  height: 100%;
  padding: 0.25rem 0;
  color: var(--text);
  font-size: 0.9rem;
}

h4 {
  background-color: #00000080;
  text-transform: uppercase;
  text-align: center;
  padding: 0.25rem 0.5rem;
  margin-bottom: 0.5rem;
  font-weight: bold;
  color: #ddd;
}

h5 {
  color: var(--textBold);
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
}

.button:hover {
  border: 1px solid white !important;
}

.option {
  margin-top: 2rem;

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
  padding: 0 0.5rem 0rem 0.5rem;
  overflow-y: auto;
  user-select: none;
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

@media only screen and (max-width: 640px) {
}
</style>
