import { test, expect } from '@playwright/test'

test('berlin grocery carriers loads', async ({ page }) => {
  await page.goto('e2e-tests/carriers/output_carriers.xml.gz')

  // await page is loaded: control panel with datasets is visible
  await page.waitForSelector('[data-testid="carrier-list"]')
  await expect(page.locator('.carrier-title')).toHaveCount(45)

  const rows = page.locator('.carrier-title')
  await expect(rows.nth(0)).toHaveText('aldi_DISCOUNTER_FRISCHE')
})
