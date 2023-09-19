import { mount } from '@vue/test-utils'
import { vi } from 'vitest'
import '../../src/shims-vue.d'

import blobUtil from 'blob-util'

import Tile from '../../src/dash-panels/tile.vue'
import DashboardDataManager from '../../src/js/DashboardDataManager'

const csvText = `custom Image; 1234; vsp_logo.png; https://vsp.berlin
custom Image (parent folder); text; ../warning.png
image from assets Folder (Material UI); 3517; emoji_transportation
Fontawesome Icon 1; 75135; virus-covid
Fontawesome Icon 2; transport; departure_board`

// app icon
const blob = blobUtil.base64StringToBlob(
  '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'
)

// const csvTextObject = {
//   comments: [],
//   data: [
//     ['custom Image', 1234, ' vsp_logo.png', 'https://vsp.berlin'],
//     ['custom Image (parent folder)', ' text', ' ../warning.png'],
//     ['image from assets Folder (Material UI)', 3517, ' emoji_transportation'],
//     ['Fontawesome Icon 1', 75135, ' virus-covid'],
//     ['Fontawesome Icon 2', ' transport', ' departure_board'],
//   ],
//   errors: [],
//   meta: {
//     aborted: false,
//     cursor: 260,
//     delimiter: ';',
//     linebreak: '\r\n',
//     truncated: false,
//   },
// }

global.fetch = vi.fn().mockResolvedValue({
  status: 200,
  text: () =>
    new Promise(resolve => {
      resolve(csvText)
    }),
  blob: () =>
    new Promise(resolve => {
      resolve(blob)
    }),
})

// const loadImages = vi.fn().mockResolvedValue(0)

// const loadFile = vi.fn().mockResolvedValue(csvTextObject)

describe('Tile.vue', () => {
  test('good test', async () => {
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
        cardId: 'cardId',
        cardTitle: 'cardId',
        config: {
          dataset: 'data/tiles_new_format.csv',
          height: 0.1,
          id: 'card-id-1',
          isLoaded: false,
          number: 1,
          title: 'Tiles Plug-in Example New Format',
          type: 'tile',
        },
        datamanager: new DashboardDataManager('local', '/'),
      },
    })

    // Examples: How to set some data...
    wrapper.setData({
      dataSet: [['Fontawesome Icon 2', ' transport', ' chart-simple']],
    })
    wrapper.setData({ imagesAreLoaded: true })

    // Wait until all images are loaded
    await wrapper.vm.$nextTick()

    console.log(wrapper.text())

    // Does the component exists?
    expect(wrapper.exists()).toBe(true)

    // After loading the images 'imagesAreLoaded' should be `true`
    expect(wrapper.vm.imagesAreLoaded).toBe(true) // SHOULD BE TRUE!

    // The wrapper should have the class 'tiles-container'
    // expect(wrapper.classes('tiles-container')).toBe(true) // SHOULD BE TRUE
    // Existiert die KOmponente überhaupt?!
    // expect(wrapper.exists()).toBe(true)

    // console.log('wrapper.vm...')
    // console.log(wrapper.vm.$el)
    // console.log('...wrapper.vm')

    // Klassennamen etc. überprüfen
    const tilesContainer = wrapper.find('.tiles-container')
    expect(tilesContainer.exists()).toBe(true) // Should be true later..
    // console.log('Wrapper:')
    // console.log(wrapper.vm.$children)
    // console.log('...Wrapper')

    // Überprüfe, ob Hintergrundfarben korrekt gesetzt werden
    // const tiles = wrapper.findAll('.tile')
    // console.log('Tiles: ', tiles.wrappers)
    // expect(tiles.exists()).toBe(true)

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

    // const tileImages = wrapper.findAll('.tile-image')
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
