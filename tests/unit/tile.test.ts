// Import necessary modules and components
import createFetchMock from 'vitest-fetch-mock' // Import fetch mocking library
import { vi } from 'vitest' // Import vi test runner
import { mount } from '@vue/test-utils' // Import Vue test utilities
import Tile from '../../src/dash-panels/tile.vue' // Import the Tile component to be tested
import DashboardDataManager from '../../src/js/DashboardDataManager' // Import DashboardDataManager

// Create a fetch mocker instance for mocking HTTP requests
const fetchMocker = createFetchMock(vi)
fetchMocker.enableMocks()

// Define mock response data for testing
const mockResponseData = {
  dataSet: {
    data: [
      ['custom Image', 'text', './vsp-logo.png'],
      ['custom Image (parent folder)', 1234, './vsp-logo.png'],
      ['image from assets Folder (Material UI)', 3517, './vsp-logo.png'],
      ['Fontawesome Icon 1', 75135, './vsp-logo.png'],
      ['Fontawesome Icon 2', 'transport', './vsp-logo.png'],
    ],
  },
}

// Begin describing the test suite for the Tile.vue component
describe('Tile.vue', () => {
  // Reset mock requests before each test
  beforeEach(() => {
    fetchMocker.resetMocks()
  })

  // Define a test case for loading data and images correctly
  it('loads data and images correctly', async () => {
    // Mock the HTTP response with mockResponseData
    fetchMocker.mockResponseOnce(JSON.stringify(mockResponseData), {
      headers: { 'Content-Type': 'application/json' },
    })

    // Mount the Tile component with required props
    const wrapper = mount(Tile, {
      propsData: {
        fileSystemConfig: {
          baseURL: 'http://localhost:8000',
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
        datamanager: new DashboardDataManager('local', '/'),
      },
    })

    // Wait for Vue to update the component
    await wrapper.vm.$nextTick()

    // Assertions

    // Check if the Tile component exists in the DOM
    expect(wrapper.exists()).toBe(true)

    // Find the tiles container element and check its existence
    const tilesContainer = wrapper.find('.tiles-container')
    expect(tilesContainer.exists()).toBe(true)

    // Find all tile elements and check their count
    const tiles = wrapper.findAll('.tile')
    expect(tiles.length).toBe(mockResponseData.dataSet.data.length)

    // Perform additional assertions

    // For example, check the text content of the first tile
    const tile1 = tiles[0]
    expect(tile1.find('.tile-title').text()).toBe('custom Image')
    expect(tile1.find('.tile-value').text()).toBe('text')

    // Check the text content of the second tile
    const tile2 = tiles[1]
    expect(tile2.find('.tile-title').text()).toBe('custom Image (parent folder)')
    expect(tile2.find('.tile-value').text()).toBe('1234')

    // Find all tile image elements and check their count
    const tileImages = wrapper.findAll('.tile-image')
    expect(tileImages.length).toBe(mockResponseData.dataSet.data.length)

    // Check that the imagesAreLoaded flag is true
    expect(wrapper.vm.imagesAreLoaded).toBe(true)
  })
  // Add more test cases as needed
})
