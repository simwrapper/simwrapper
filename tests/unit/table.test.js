import { mount } from '@vue/test-utils'
import { vi, beforeEach } from 'vitest'
import '../../src/shims-vue.d'

// import blobUtil from 'blob-util'

import Table from '../../src/dash-panels/table.vue'
import { DashboardDataManager } from '../../src/js/DashboardDataManager'

// const htmlListing = `<!DOCTYPE HTML>
// <html lang="en">
// <head>
// <meta charset="utf-8">
// <title>Directory listing for /table-style/data/</title>
// </head>
// <body>
// <h1>Directory listing for /table-style/data/</h1>
// <hr>
// <ul>
// <li><a href=".DS_Store">.DS_Store</a></li>
// <li><a href="tiles.csv">tiles.csv</a></li>
// <li><a href="tiles_new_format.csv">tiles_new_format.csv</a></li>
// <li><a href="vsp_logo.png">vsp_logo.png</a></li>
// </ul>
// <hr>
// </body>
// </html>`

// global.fetch = vi.fn().mockResolvedValue({
//   status: 200,
//   text: () =>
//     new Promise(resolve => {
//       resolve(htmlListing)
//     }),
// })

/**
 * Mock _fetchData
 *
 * parameters:
 *
 * config (object):
 *
 * ataset: "data/tiles_new_format.csv"
 * height: 0.1
 * id: "card-id-1"
 * isLoaded: false
 * number: 1
 * title: "Default Stlye"
 * type: "csv"
 *
 * options (object):
 *
 * highPrecision: true
 *
 * 'Return/Resolve'
 *
 * resolve(mockReturnData);
 */

const mockReturnData = {
  Name: {
    name: 'Name',
    type: 1,
    values: [
      'Total conventional fleet km',
      'Total conventional passenger km',
      'Empty ratio',
      'Total KEXI Rides',
      'Avg. rides per vehicle',
      'Rides per veh-km',
      'Rides per operating hour',
    ],
  },
  Value: {
    name: 'Value',
    type: 1,
    values: [' 572,203', ' 550,111', ' 0,26', 122, '\t40,667', ' 0,213', ' 2,392'],
  },
}

vi.mock('../../src/js/DashboardDataManager', () => {
  const DashboardDataManager = vi.fn()
  DashboardDataManager.prototype._fetchDataset = vi.fn(
    () =>
      new Promise() <
      DataTable >
      (resolve => {
        resolve(mockReturnData)
      })
  )
  DashboardDataManager.prototype.getDataset = vi.fn(() => mockReturnData)
  return { DashboardDataManager }
})

describe('Table.vue', () => {
  // beforeEach(() => {
  //   const _fetchDataset = vi.fn(
  //       () =>
  //         new Promise() <
  //         DataTable >
  //         (resolve => {
  //           console.log('MOCKING!!!')
  //           resolve(mockReturnData)
  //         })
  // })

  test('mount component', async () => {
    const wrapper = mount(Table, {
      propsData: {
        cardId: 'card-id-2',
        cardTitle: 'Topsheet Stlye',
        config: {
          dataset: 'data/tiles_new_format.csv',
          height: 0.1,
          id: 'card-id-2',
          isLoaded: false,
          number: 2,
          style: 'topsheet',
          title: 'Topsheet Stlye',
          type: 'csv',
        },
        files: ['dashboard.yaml', 'simwrapper-config.yaml', 'warning.png'],
        subfolder: 'table-style',
        datamanager: new DashboardDataManager('local', '/'),
        fileSystemConfig: {
          baseURL: 'http://localhost:8000',
          description: 'Files on this computer, shared using "simwrapper serve" tool',
          name: 'local',
          slug: 'local',
          thumbnail: '/simwrapper/images/thumb-localfiles.jpg',
        },
      },
    })

    // Wait until all images are loaded
    // await wrapper.vm.$nextTick()

    // Examples: How to set some data...
    // wrapper.setData({
    //   dataSet: [['Fontawesome Icon 2', ' transport', ' chart-simple']],
    // })
    // wrapper.setData({ imagesAreLoaded: true })

    // Does the component exists?
    expect(wrapper.exists()).toBe(true)

    expect(wrapper.vm.hideHeader).toBe(false) // SHOULD BE False!
    expect(wrapper.vm.isFullsize).toBe(false) // SHOULD BE FAlse!
    // expect(wrapper.vm.dataColumnNames).toBe(['date']) // SHOULD BE TRUE!
    // expect(wrapper.vm.percentColumnNames).toBe(['percent']) // SHOULD BE TRUE!

    // Check if all classes exists...
    const tableContainer = wrapper.find('.vgt-inner-wrap')
    expect(tableContainer.exists()).toBe(true)
    const tableWrapContainer = tableContainer.find('.vgt-fixed-header')
    expect(tableWrapContainer.exists()).toBe(true)
  })
})
