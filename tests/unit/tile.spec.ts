import { mount } from '@vue/test-utils'
import Tile from '@/dash-panels/tile.vue' // Pfad zur Tile-Komponente

describe('Tile Component', () => {
  // Überprüfen, ob die Komponente korrekt gerendert wird
  it('renders correctly', async () => {
    const wrapper = mount(Tile, {
      props: {
        fileSystemConfig: {},
        subfolder: 'path/to/subfolder',
        files: [],
        config: {},
        datamanager: {},
      },
    })

    // Überprüfen, ob die Komponente existiert
    expect(wrapper.exists()).toBe(true)
  })

  // Überprüfen, ob das Laden von Bildern korrekt funktioniert
  it('loads images correctly', async () => {
    const wrapper = mount(Tile, {
      props: {
        fileSystemConfig: {},
        subfolder: 'path/to/subfolder',
        files: [],
        config: {},
        datamanager: {},
      },
    })

    await wrapper.vm.$nextTick()

    // TODO: Werden die Bilder geladen?
  })
})
