import { test, expect } from '@playwright/test'

test('aggregate-od loads berlin data', async ({ page }) => {
  await page.goto('/e2e-tests/agg-od')

  // wait for testdata to be populated
  await page.waitForFunction(() => {
    //@ts-ignore
    const testdata = window.__testdata__ as any
    return !!testdata
    // (
    //   testdata &&
    //   testdata.centroids?.length &&
    //   testdata.spiderLinks?.length &&
    //   testdata.geojson?.length
    // )
  })

  // check testdata
  //@ts-ignore
  const testdata = await page.evaluate(() => window.__testdata__)
  expect(testdata.centroids.length).toBe(23)
  expect(testdata.geojson.length).toBe(23)
  expect(testdata.spiderLinks.length).toBe(390)
})
