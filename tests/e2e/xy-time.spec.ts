import { test, expect } from '@playwright/test'

test('xy time loads small emission data', async ({ page }) => {
  await page.goto('e2e-tests/xy-time/emissions_grid_per_day.xyt.csv.gz')
  await page.waitForSelector('.legend-box')

  const legendRows = page.locator('.row-label')
  await expect(legendRows).toHaveCount(7)
})
