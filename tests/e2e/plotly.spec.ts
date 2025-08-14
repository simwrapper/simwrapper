import { test, expect } from '@playwright/test'

test('plotly bar charts load', async ({ page }) => {
  await page.goto('e2e-tests/plotly')
  await page.waitForSelector('.dash-card-headers')

  const titles = page.locator('.dash-card-headers')
  await expect(titles).toHaveCount(2)
  await expect(titles.nth(0)).toHaveText(/My Farm Animals/)

  const legend = page.locator('.legendtext')
  await expect(legend.nth(0)).toHaveText('trace 0')
  await expect(legend.nth(1)).toHaveText('trace 1')
})
