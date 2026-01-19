import { test, expect } from '@playwright/test'

test('gridmap loads lausitz noise data with proper colors', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('e2e-tests/lausitz')

  await page.getByText('radius').waitFor({ timeout: 90000 })

  const inputs = page.locator('input')
  await expect(inputs).toHaveCount(5)

  // wait for testdata to be populated
  await page.waitForFunction(() => {
    // @ts-ignore
    const testdata = window.__testdata__ as any
    return !!testdata
  })

  // check testdata
  //@ts-ignore
  const testdata = await page.evaluate(() => window.__testdata__)
  const colors = testdata.mapData[0].colorData
  expect(colors).toHaveLength(997920)
  expect(colors[0]).toBe(17)
  expect(colors[1]).toBe(117)
  expect(colors[2]).toBe(179)
})
