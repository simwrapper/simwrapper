import { test, expect } from '@playwright/test'

test('select link analyzer loads data properly', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('e2e-tests/select-link-analysis')

//   await page.getByText('radius').waitFor({ timeout: 90000 })

//   const inputs = page.locator('input')
//   await expect(inputs).toHaveCount(5)

  // wait for testdata to be populated
  await page.waitForFunction(() => {
    // @ts-ignore
    const testdata = window.__testdata__ as any
    return !!testdata
  })

  // check testdata
  //@ts-ignore
  const testdata = await page.evaluate(() => window.__testdata__)
  const dbData = testdata.conn
  expect(dbData).toBeDefined()
})
