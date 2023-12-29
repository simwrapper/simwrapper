<template lang="pug">
.configurator
  .content
    .section-panel
      .config-section(v-for="section,i in sections" :key="section.name"
        @click="switchSection(i)"
      )
        p(:class="{'active': activeSection==i}") {{  section.title  }}

    .details-panel(v-if="activeSection > -1")
      .buttons
        b-button() Cancel
        b-button(type="is-success" @click="update") Save

      .entry(v-for="item of sections[activeSection].entries")
        p {{ item.title }}
        b-input(type="text" v-model="item.value")

</template>

<script lang="ts">
const BASE_URL = import.meta.env.BASE_URL

const i18n = {
  messages: {
    en: {},
    de: {},
  },
}

import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import { XMLParser, XMLBuilder } from 'fast-xml-parser'
import YAML from 'yaml'

import globalStore from '@/store'
import configData from '@/assets/sim-runner/matsim-config-editor.yaml?raw'
import rawXml from '@/assets/sim-runner/berlin.config.xml?raw'

export default defineComponent({
  name: 'RunConfigurator',
  components: {},
  i18n,

  props: {
    id: { type: String, required: true },
    model: { type: String, required: false },
    xml: { type: Object, required: false },
  },

  data: () => {
    return {
      globalState: globalStore.state,
      sections: [] as any[],
      activeSection: -1,
      xmlConfig: {} as any,
    }
  },

  mounted() {
    this.$store.commit('setShowLeftBar', true)

    const yaml = YAML.parse(configData)
    console.log({ yaml })
    this.sections = yaml.sections

    this.setupXml()
    this.activeSection = 0
  },

  watch: {},
  computed: {
    isDark() {
      return this.$store.state.isDarkMode
    },
  },

  methods: {
    setupXml() {
      const parser = new XMLParser({
        ignoreAttributes: false,
        preserveOrder: false,
        attributeNamePrefix: '$',
        // isFirefox: _isFirefox,
        // isArray: undefined as any,
      })

      // parser.addEntity('SYSTEM', '\r') // &unknown;\rlast

      try {
        this.xmlConfig = parser.parse(rawXml)
      } catch (e) {
        console.error('WHAT', e)
        throw Error('' + e)
      }

      // now connect the parts to the bits
      for (const section of this.sections) {
        for (const entry of section.entries) {
          const [moduleName, elementName] = entry.xml.split('.')
          const module = this.xmlConfig.config.module.find((f: any) => f.$name == moduleName)
          if (elementName == 'param') {
            const param = module.param.find((f: any) => f.$name == entry.name)
            entry.value = param.$value
          }
        }
      }
    },

    update() {
      // now reconnect the bits to the parts
      for (const section of this.sections) {
        for (const entry of section.entries) {
          const [moduleName, elementName] = entry.xml.split('.')
          const module = this.xmlConfig.config.module.find((f: any) => f.$name == moduleName)
          if (elementName == 'param') {
            const param = module.param.find((f: any) => f.$name == entry.name)
            param.$value = entry.value
          }
        }
      }

      console.log(this.xmlConfig)

      const builder = new XMLBuilder({
        format: true,
        ignoreAttributes: false,
        attributeNamePrefix: '$',
        suppressUnpairedNode: true,
        suppressEmptyNode: true,
      })
      const xmlString = builder.build(this.xmlConfig)
      console.log(xmlString)
    },

    switchSection(i: number) {
      this.activeSection = i
    },
  },
})
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.content {
  display: flex;
  flex-direction: row;
}

.section-panel {
  background-color: yellow;
  padding: 1rem;
  width: 12rem;
}

.section-panel p {
  margin-bottom: 0.5rem;
}

.section-panel p:hover {
  cursor: pointer;
}

p.active {
  font-weight: bold;
}

.details-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1rem;
  background-color: #ffc;
}

.entry {
  display: flex;
}

.entry p {
  text-align: right;
  min-width: 15rem;
  padding: 0.5rem;
}

.entry b-input {
  flex: 1;
  width: 100%;
}

.buttons {
  margin-left: auto;
}
</style>
