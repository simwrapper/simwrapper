import { test, expect } from '@playwright/test'

test('select link analyzer loads data properly', async ({ page }) => {
  test.setTimeout(90_000)
  await page.goto('e2e-tests/select-link-analysis')

  await page.getByText('INFO PANEL').waitFor({ timeout: 20000 })

  await page.waitForFunction(() => {
    // @ts-ignore
    return !!window.__testdata__
  })

  const testdata = await page.evaluate(() => window.__testdata__)
  expect(testdata.conn).toBeDefined()

  const traversalCount = await page.evaluate(async () => {
    // @ts-ignore
    const conn = window.__testdata__.conn
    const result = await conn.query(`SELECT COUNT(*) AS cnt FROM 'link-traversals-sorted.parquet'`)
    return Number(result.toArray()[0].cnt)
  })
  expect(traversalCount).toBe(112926)

  // const format = await page.evaluate(() => window.__testdata__.getChosenFormat?.())

  const traversals = await page.evaluate(
    async ({ linkId, hour }) => {
      // @ts-ignore
      return await window.__testdata__.selectLink(linkId, hour)
    },
    { linkId: '9565404#1', hour: 8 }
  )

  expect(Object.keys(traversals).length).toBe(90)

  const traversalsB = await page.evaluate(
    async ({ linkId, hour }) => {
      // @ts-ignore
      return await window.__testdata__.selectLink(linkId, hour)
    },
    { linkId: '498283974', hour: 8 }
  )

  expect(Object.keys(traversalsB).length).toBe(44)
})
