import { test, expect } from '@playwright/test'

test('links-gl loads with geojson network', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('e2e-tests/emissions/viz-gl-links-1.yaml')
  await page.waitForSelector('.panel-items', { timeout: 90_000 })

  const dataSelector = page.locator('.selector-column-picker')
  await expect(dataSelector).toHaveText(/CO2_TOTAL/)
})

// test('links-gl loads with MATSIM XML network', async ({ page }) => {
//   test.setTimeout(120_000)
//   await page.goto('/e2e-tests/emissions/viz-gl-links-2.yaml')
//   await page.waitForSelector('.panel-items', { timeout: 120_000 })

//   const dataSelector = page.locator('.selector-column-picker')
//   await expect(dataSelector).toHaveText(/12:00:00/)
// })

test('links-gl loads with AVRO network', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('e2e-tests/emissions/viz-gl-links-3.yaml')
  await page.waitForSelector('.panel-items', { timeout: 90_000 })

  const dataSelector = page.locator('.selector-column-picker')
  await expect(dataSelector).toHaveText(/12:00:00/)
})
