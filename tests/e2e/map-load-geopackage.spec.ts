import { test, expect } from '@playwright/test'

test('map viewer loads geopackage', async ({ page }) => {
  await page.goto('e2e-tests/maps/geopackage/viz-map-geo.yaml')
  await page.waitForSelector('.legend-box')

  const rows = page.locator('.row-label')
  await expect(rows.nth(1)).toHaveText('Ackerstr.')
})
