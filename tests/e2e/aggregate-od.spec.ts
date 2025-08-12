import { test, expect } from '@playwright/test'

test('aggregate-od loads berlin data', async ({ page }) => {
  await page.goto('/e2e-tests/agg-od')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('[data-testid="scale-slider"]')
  await expect(page.locator('[data-testid="scale-slider"]')).toBeVisible()
})
