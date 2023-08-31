import { mount } from '@vue/test-utils'
import Tile from '@/dash-panels/tile.vue'

describe('Tile.vue', () => {
  it('renders correctly', async () => {
    const wrapper = mount(Tile)

    wrapper.setProps({
      fileSystemConfig: { type: Object, required: true },
      subfolder: { type: String, required: true },
      files: { type: Array, required: true },
      config: {},
      datamanager: { type: Object, required: true },
    })

    wrapper.setData({ imagesAreLoaded: true })

    expect(wrapper.find('.content').exists()).toBe(true)
    expect(wrapper.findAll('.tile').length).toBe(0) // Should be 0
  })
})
