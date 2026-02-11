import { test, expect } from '@playwright/test'

test('load cottbus XML Config', async ({ page }) => {
  await page.goto('e2e-tests/cottbus/output_config.xml.gz')

  const leaves = page.locator('.leaf-node') as any
  await expect(leaves.nth(0)).toBeVisible()
  await expect(leaves).toHaveCount(25)
  await expect(leaves.nth(0)).toHaveText('config')
})
