import { test, expect } from '@playwright/test'

test('dashboard images load', async ({ page }) => {
  await page.goto('e2e-tests/cottbus')
  await page.waitForSelector('.medium-zoom')

  const images = page.locator('.medium-zoom')
  await expect(images).toHaveCount(3)
})
