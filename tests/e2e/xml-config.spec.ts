import { test, expect } from '@playwright/test'

test('load cottbus XML Config', async ({ page }) => {
  test.setTimeout(120_000)
  await page.goto('e2e-tests/cottbus/output_config.xml.gz')

  const leaves = page.locator('.leaf-node') as any
  await page.waitForSelector('.leaf-node', { timeout: 120_000 })
  await expect(leaves).toHaveCount(25, { timeout: 120_000 })
  await expect(leaves.nth(0)).toHaveText('config')
})
