import { test, expect } from '@playwright/test'

// The "Panels" tab of the charts dashboard has one card per built-in dash-panel
// chart type, all driven by travel_time_comparison_by_hour.csv (10 data rows).

const openPanelsTab = async (page: any) => {
  await page.goto('e2e-tests/charts')
  await page.locator('text="Panels"').last().click()
  await page.waitForSelector('.dash-card-headers')
}

test('all dash-panel chart types load without errors', async ({ page }) => {
  await openPanelsTab(page)

  const titles = page.locator('.dash-card-headers')
  await expect(titles).toHaveCount(5)
  await expect(titles.nth(0)).toHaveText(/Bar panel/)
  await expect(titles.nth(1)).toHaveText(/Area panel/)
  await expect(titles.nth(2)).toHaveText(/Line panel/)
  await expect(titles.nth(3)).toHaveText(/Scatter panel/)
  await expect(titles.nth(4)).toHaveText(/Bubble panel/)

  // every card drew a plotly chart, and none of them reported an error
  await expect(page.locator('.plotly-plot')).toHaveCount(5)
  await expect(page.locator('.error-text')).toHaveCount(0)
})

test('bar panel draws a trace per configured column', async ({ page }) => {
  await openPanelsTab(page)

  const bar = page.locator('.plotly-plot').nth(0)
  await expect(bar.locator('.legendtext').nth(0)).toHaveText('mean')
  await expect(bar.locator('.legendtext').nth(1)).toHaveText('simulated')
  // 2 columns x 10 rows of data
  await expect(bar.locator('.barlayer .point')).toHaveCount(20)
})

test('area panel stacks its columns', async ({ page }) => {
  await openPanelsTab(page)

  const area = page.locator('.plotly-plot').nth(1)
  // plotly reverses legend order for stacked traces, so don't depend on it
  await expect(area.locator('.legendtext')).toHaveText(['simulated', 'mean'])
  await expect(area.locator('.scatterlayer .trace')).toHaveCount(2)
})

test('line panel draws one line per column', async ({ page }) => {
  await openPanelsTab(page)

  const line = page.locator('.plotly-plot').nth(2)
  await expect(line.locator('.legendtext').nth(0)).toHaveText('mean')
  await expect(line.locator('.legendtext').nth(1)).toHaveText('simulated')
  await expect(line.locator('.scatterlayer .trace')).toHaveCount(2)
})

test('scatter panel draws markers for each column', async ({ page }) => {
  await openPanelsTab(page)

  const scatter = page.locator('.plotly-plot').nth(3)
  await expect(scatter.locator('.scatterlayer .trace')).toHaveCount(2)
  // 2 columns x 10 rows of markers
  await expect(scatter.locator('.scatterlayer .points path')).toHaveCount(20)
})

test('bubble panel draws one sized marker per row', async ({ page }) => {
  await openPanelsTab(page)

  const bubble = page.locator('.plotly-plot').nth(4)
  await expect(bubble.locator('.scatterlayer .trace')).toHaveCount(1)
  await expect(bubble.locator('.scatterlayer .points path')).toHaveCount(10)
})

test('axis titles from YAML are applied', async ({ page }) => {
  await openPanelsTab(page)

  const bar = page.locator('.plotly-plot').nth(0)
  await expect(bar.locator('.xtitle')).toHaveText('Hour')
  await expect(bar.locator('.ytitle')).toHaveText('Speed [km/h]')
})
