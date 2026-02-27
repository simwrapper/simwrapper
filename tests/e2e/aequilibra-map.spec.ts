import { test, expect } from '@playwright/test'

test('aequilibrae plugin loads and displays legend', async ({ page }) => {
  await page.goto('e2e-tests/aequilibrae/')
  await page.waitForSelector('.legend-overlay')

  const rows = page.locator('.item-label')
  await expect(rows.nth(1)).toHaveText('Centroid')
})
