import { test, expect } from '@playwright/test'

test('csv table loads simple data with 3 rows', async ({ page }) => {
  await page.goto('/e2e-tests/table')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('[data-testid="vue-good-table"]')
  const rows = page.locator('table tbody tr')
  await page.waitForTimeout(2000)
  await expect(rows).toHaveCount(3)
})
