import { test, expect } from '@playwright/test'

test('load simple Vega bar chart', async ({ page }) => {
  await page.goto('/e2e-tests/vega-charts')
  await page.waitForSelector('.chart-wrapper')

  const chart = page.locator('.chart-wrapper')
  await expect(chart).toBeVisible()
  const errors = page.locator('.error-text')
  await expect(errors).toHaveCount(0)
})
