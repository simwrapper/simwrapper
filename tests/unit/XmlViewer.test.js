import { shallowMount } from '@vue/test-utils'
import { vi } from 'vitest'
// import '../../src/shims-vue.d'
import * as d3color from 'd3-color'

// import blobUtil from 'blob-util'

import XmlViewer from '@/plugins/xml-viewer/XmlViewer.vue'
// import DashboardDataManager from '../../src/js/DashboardDataManager'

describe('XmlViewer.vue', () => {
  test('correct test: xml', async () => {
    const wrapper = shallowMount(XmlViewer, {
      propsData: {
        config: {
          file: '*.output_config.xml',
          height: 6,
          id: 'card-id-4',
          isLoaded: false,
          number: 4,
          type: 'xml',
          unfoldLevel: 1,
          width: 2,
        },
        resize: {
          height: 360,
          width: 950,
        },
        root: 'fs1',
        subfolder: 'extension/dashboards/DashboardTests/drtDefaults',
        thumbnail: false,
        yamlConfig: undefined,
      },
    })

    console.log(wrapper)

    // Check if the component exists
    // expect(wrapper.exists()).toBe(true)

    // Check if the component is not empty
    const rootByCss = wrapper.findComponent('.content')
    // expect(rootByCss.vm.$options.name).toBe('XmlPanel')
  })
})
