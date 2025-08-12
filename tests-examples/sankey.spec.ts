import { test, expect } from '@playwright/test'

test('plotly bar charts load', async ({ page }) => {
  await page.goto('/e2e-tests/sankey')
  await page.waitForSelector('path')

  const paths = page.locator('path')
  await expect(paths).toHaveCount(20)

  const nodeTitles = page.locator('.node-title')
  await expect(nodeTitles).toHaveCount(16)
  await expect(nodeTitles.nth(0)).toHaveText('bike')
})
