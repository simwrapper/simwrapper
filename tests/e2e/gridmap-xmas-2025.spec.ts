import { test, expect } from '@playwright/test'

test('gridmap loads accessibility page', async ({ page }) => {
  await page.goto('e2e-tests/gridmap')
  await page.getByText('radius').waitFor({ state: 'attached' })

  // page loads
  let selects = page.locator('select')
  await expect(selects).toHaveCount(4)

  // wait for testdata to be populated
  await page.waitForFunction(() => {
    // @ts-ignore
    const testdata = window.__testdata__ as any
    return !!testdata
  })

  // ensure settings panel is responsive
  let testdata = await page.evaluate(() => window.__testdata__)
  let colors = testdata.mapData[0].colorData
  expect(colors).toHaveLength(12768)
  expect(colors[0]).toBe(5)
  expect(colors[1]).toBe(48)
  expect(colors[2]).toBe(97)

  await page.getByLabel('flip').check()
  testdata = await page.evaluate(() => window.__testdata__)
  colors = testdata.mapData[0].colorData
  expect(colors).toHaveLength(12768)
  expect(colors[0]).toBe(103)
  expect(colors[1]).toBe(0)
  expect(colors[2]).toBe(31)
  let sum = colors.reduce((a, b) => a + b, 0)
  expect(sum).toBe(682615)

  // load pt_accessibility
  await page.getByLabel('Diff').uncheck()
  await page.getByLabel('flip').check()
  const dropdown = await page.getByLabel('1st column')
  await dropdown.selectOption('pt_accessibility')
  await page.waitForTimeout(1000)
  testdata = await page.evaluate(() => window.__testdata__)
  colors = testdata.mapData[0].colorData as any[]
  sum = colors.reduce((a, b) => a + b, 0)
  expect(sum).toBe(745388)
})
