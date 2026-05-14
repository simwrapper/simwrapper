import { test, expect } from '@playwright/test'

test('zstd transit network', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('e2e-tests/cottbus/output_transitSchedule.xml.zst')
  await page.waitForSelector('.stat', { timeout: 60_000 })
  const lineStats = page.locator('.stat')
  await expect(lineStats).toHaveCount(16)
})

test('zstd networks: load berlin v5.5 network', async ({ page }) => {
  test.setTimeout(90_000)

  await page.goto('e2e-tests/networks/viz-map-zstd-network.yaml')
  await page.waitForSelector('.legend-section', { timeout: 90_000 })

  const legend = page.locator('.legend-section p')
  await expect(legend).toHaveCount(1)
})

test('zstd logistics example loads', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('e2e-tests/logistics/output_lsps.xml.zst')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('.b-radio', { timeout: 120_000 })

  await expect(page.locator('.carrier-title')).toHaveCount(4)
  const rows = page.locator('.carrier-title')
  await expect(rows.nth(0)).toHaveText('Edeka_directCarrier')
})
