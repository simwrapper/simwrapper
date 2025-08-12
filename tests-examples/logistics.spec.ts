import { test, expect } from '@playwright/test'

test('logistics example loads', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto('/e2e-tests/logistics/output_lsps.xml.gz')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('.b-radio', { timeout: 120_000 })

  await expect(page.locator('.carrier-title')).toHaveCount(4)
  const rows = page.locator('.carrier-title')
  await expect(rows.nth(0)).toHaveText('Edeka_directCarrier')
})
