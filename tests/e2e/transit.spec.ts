import { test, expect } from '@playwright/test'

test('load cottbus transit network', async ({ page }) => {
  await page.goto('/e2e-tests/transit/cottbus/viz-pt-demand-1.yaml')
  await page.waitForSelector('.stat')

  const lineStats = page.locator('.stat')
  await expect(lineStats).toHaveCount(16)
  await expect(lineStats.nth(0)).toHaveText('53 deps')
})
