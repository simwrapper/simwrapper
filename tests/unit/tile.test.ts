import { mount } from '@vue/test-utils'
import Tile from '../../src/dash-panels/tile.vue'
import DataManager from '../../src/js/DashboardDataManager'
// import DataManager from '@/js/DashboardDataManager'

describe('Tile.vue', () => {
  it('good test', async () => {
    // TODO: Hardcode!?!
    // @ts-ignore -> I don't know why...
    const wrapper = mount(Tile, {
      propsData: {
        fileSystemConfig: {
          baseURL: 'http://localhost:8000',
          description: 'Files on this computer, shared using "simwrapper serve" tool',
          name: 'local',
          slug: 'local',
          thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
        },
        subfolder: '/tiles-test',
        files: ['dashboard.yaml', 'simwrapper-config.yaml', 'warning.png'],
        config: {
          dataset: 'data/tiles_new_format.csv',
          height: 0.1,
          id: 'card-id-1',
          isLoaded: false,
          number: 1,
          title: 'Tiles Plug-in Example New Format',
          type: 'tile',
        },
        datamanager: new DataManager(),
      },
    })
    console.log(wrapper)

    wrapper.setData({
      dataSet: [['Fontawesome Icon 2', ' transport', ' chart-simple']],
    })

    wrapper.setProps({ imagesAreLoaded: true })

    // Warten bis Bilder geladen sind...
    await wrapper.vm.$nextTick()

    // wrapper.setData({ imagesAreLoaded: true })

    // Existiert die KOmponente überhaupt?!
    expect(wrapper.exists()).toBe(true)

    console.log(wrapper)

    // Klassennamen etc. überprüfen
    const tilesContainer = wrapper.find('.tiles-container')
    expect(tilesContainer.exists()).toBe(true) // Should be true later..

    // Überprüfe, ob Hintergrundfarben korrekt gesetzt werden
    const tiles = wrapper.findAll('.tile')
    // tiles.forEach((tile, index) => {
    //   const colorIndex = index % wrapper.vm.colors.length
    //   const backgroundColor = wrapper.vm.colors[colorIndex]
    //   expect(tile.attributes('style')).toContain(`background-color: ${backgroundColor}`)
    // })

    // Click handler fpr die Links
    // TODO: Sollen die bei jedem vorhanden sein? Eig. nicht...
    // In den Props korrekt festlegen

    // @ts-ignore -> I don't know why...
    // tiles.forEach(tile => {
    //   const anchorTag = tile.find('a')
    //   expect(anchorTag.attributes('href')).toBeUndefined()
    // })

    // TODO: Bilddateien!!!!

    const tileImages = wrapper.findAll('.tile-image')
    // tileImages.forEach((image, index) => {
    //   const base64Image = wrapper.vm.base64Images[index]
    //   if (base64Image) {
    //     expect(image.attributes('style')).toContain(`background: ${base64Image}`)
    //   }
    // })

    // Vergleich der dargestellten
    // und der übergebenebn Bilder
    // expect(tiles.length).toBe(wrapper.vm.dataSet.data.length)
    // expect(tileImages.length).toBe(wrapper.vm.dataSet.data.length)
  })

  // TODO:
  // zweiter Test mit fehlerhaften Eingaben
})
