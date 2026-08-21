import { test, expect } from '@playwright/test'

test('aequilibrae plugin loads and displays legend', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('e2e-tests/aequilibrae/')
  await page.waitForSelector('.legend-overlay', { timeout: 90_000 })

  const rows = page.locator('.item-label')
  await expect(rows.nth(1)).toHaveText('Centroid')
})
