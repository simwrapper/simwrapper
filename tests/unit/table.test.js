import { mount, flushPromises } from '@vue/test-utils'
import { vi } from 'vitest'

import Table from '../../src/dash-panels/table.vue'

// What DashboardDataManager.getDataset() resolves to: { allRows: { column: DataTableColumn } }
const allRows = {
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

async function mountTable(config = {}) {
  const datamanager = {
    getDataset: vi.fn(async () => ({ allRows })),
    removeFilterListener: vi.fn(),
  }

  const wrapper = mount(Table, {
    props: {
      cardId: 'card-id-2',
      cardTitle: 'Table',
      config: {
        dataset: 'data/tiles_new_format.csv',
        height: 0.1,
        id: 'card-id-2',
        isLoaded: false,
        number: 2,
        title: 'Table',
        type: 'csv',
        ...config,
      },
      files: ['dashboard.yaml', 'simwrapper-config.yaml', 'warning.png'],
      subfolder: 'table-style',
      datamanager,
      fileSystemConfig: {
        baseURL: 'http://localhost:8000',
        description: 'Files on this computer, shared using "simwrapper serve" tool',
        name: 'local',
        slug: 'local',
      },
    },
  })

  // mounted() loads the dataset asynchronously before rendering the table
  await flushPromises()
  return { wrapper, datamanager }
}

// header cells also hold screen-reader text for the sort button; the label is the first span
const headerLabels = wrapper => wrapper.findAll('thead th > span:first-child').map(s => s.text())

describe('Table.vue', () => {
  test('loads the dataset and renders a paginated table', async () => {
    const { wrapper, datamanager } = await mountTable()

    expect(datamanager.getDataset).toHaveBeenCalledWith(
      expect.objectContaining({ dataset: 'data/tiles_new_format.csv' }),
      { highPrecision: true, subfolder: 'table-style' }
    )
    expect(wrapper.emitted('isLoaded')).toBeTruthy()

    expect(wrapper.find('.vgt-wrap').classes()).not.toContain('hide-header')
    expect(headerLabels(wrapper)).toEqual(['Name', 'Value'])

    // 7 rows, 5 per page
    const rows = wrapper.findAll('table.vgt-table tbody tr')
    expect(rows).toHaveLength(5)
    expect(rows[0].text()).toContain('Total conventional fleet km')
    expect(rows[0].text()).toContain('572,203')
  })

  test('topsheet style hides the header and goes full size', async () => {
    const { wrapper } = await mountTable({ style: 'topsheet' })

    expect(wrapper.vm.hideHeader).toBe(true)
    expect(wrapper.vm.isFullsize).toBe(true)
    expect(wrapper.find('.vgt-wrap').classes()).toEqual(
      expect.arrayContaining(['hide-header', 'topsheet'])
    )
  })

  test('hideHeader: false overrides the topsheet default', async () => {
    const { wrapper } = await mountTable({ style: 'topsheet', hideHeader: false })

    expect(wrapper.vm.hideHeader).toBe(false)
    expect(wrapper.find('.vgt-wrap').classes()).not.toContain('hide-header')
  })

  test('hide: removes columns case-insensitively', async () => {
    const { wrapper } = await mountTable({ hide: ['value'] })

    expect(headerLabels(wrapper)).toEqual(['Name'])
  })
})
