import { test, expect } from '@playwright/test'

import fs from 'fs'

test('aggregate-od loads berlin data', async ({ page, browserName }) => {
  // console.log
  const logStream = fs.createWriteStream(`test-results/console-${browserName}.log`, { flags: 'a' })
  page.on('console', msg => {
    const message = `[${msg.type()}] ${msg.text()}\n`
    console.log(message.trim())
    logStream.write(message)
  })

  await page.goto('/e2e-tests/agg-od')
  await page.waitForTimeout(5000)
  await page.screenshot({ path: `test-results/screenshot1-${browserName}.png`, fullPage: true })

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
  await page.screenshot({ path: `test-results/screenshot2-${browserName}.png`, fullPage: true })

  // check testdata
  //@ts-ignore
  const testdata = await page.evaluate(() => window.__testdata__)
  expect(testdata.centroids.length).toBe(23)
  expect(testdata.geojson.length).toBe(23)
  expect(testdata.spiderLinks.length).toBe(390)
})
