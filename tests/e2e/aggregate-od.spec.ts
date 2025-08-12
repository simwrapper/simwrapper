import { test, expect } from '@playwright/test'

test('aggregate-od loads berlin data', async ({ page }) => {
  test.setTimeout(60_000)
  await page.goto('/e2e-tests/agg-od')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('.scale-slider', { timeout: 60_000 })
  const sliders = page.locator('.scale-slider')
  await expect(sliders).toHaveCount(2)
  const errors = page.locator('.error-text')
  await expect(errors).toHaveCount(0)
})
