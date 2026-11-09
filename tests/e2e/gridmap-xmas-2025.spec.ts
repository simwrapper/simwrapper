import { test, expect } from '@playwright/test'

test('gridmap loads accessibility page', async ({ page }) => {
  await page.goto('e2e-tests/gridmap')
  await page.getByText('radius').waitFor({ state: 'attached' })

  // page loads: opacity column, 1st/2nd column, color ramp, threshold "gray out"
  let selects = page.locator('select')
  await expect(selects).toHaveCount(5)

  // wait for testdata to be populated
  await page.waitForFunction(() => {
    // @ts-ignore
    const testdata = window.__testdata__ as any
    return !!testdata
  })

  // ensure settings panel is responsive. colorData is RGBA: 4256 cells x 4
  let testdata = await page.evaluate(() => window.__testdata__)
  let colors = testdata.mapData[0].colorData
  expect(colors).toHaveLength(17024)
  expect(colors[0]).toBe(5)
  expect(colors[1]).toBe(48)
  expect(colors[2]).toBe(97)
  expect(colors[3]).toBe(255)

  // recoloring happens in a web worker, so wait for the new colors to arrive
  const colorSum = () =>
    page.evaluate(() =>
      // @ts-ignore
      Array.from(window.__testdata__.mapData[0].colorData as number[]).reduce((a, b) => a + b, 0)
    )

  // sums include an alpha of 255 for each of the 4256 cells
  await page.getByLabel('flip').check()
  await expect.poll(colorSum).toBe(1767895)
  testdata = await page.evaluate(() => window.__testdata__)
  colors = testdata.mapData[0].colorData
  expect(colors).toHaveLength(17024)
  expect(colors[0]).toBe(103)
  expect(colors[1]).toBe(0)
  expect(colors[2]).toBe(31)
  let sum = colors.reduce((a, b) => a + b, 0)
  expect(sum).toBe(1767895)

  // load pt_accessibility
  // by role: in diff mode the threshold slider is titled 'Diff' too
  await page.getByRole('checkbox', { name: 'Diff' }).uncheck()
  await page.getByLabel('flip').check()
  const dropdown = await page.getByLabel('1st column')
  await dropdown.selectOption('pt_accessibility')
  await expect.poll(colorSum).toBe(1830668)

  // threshold: the slider is titled after the column, and cells at or below it turn gray
  const shading = () =>
    page.evaluate(() => {
      // @ts-ignore
      const data = window.__testdata__
      const { values, colorData, length } = data.mapData[0]
      const unscaled = Array.from(values as number[]).map(v => v / data.scaledFactor)
      const min = Math.min(...unscaled)
      const max = Math.max(...unscaled)
      let gray = 0
      for (let i = 0; i < length; i++) {
        const c = Array.from(colorData.slice(i * 4, i * 4 + 4)).join(',')
        if (c === '128,128,128,32') gray++
      }
      return {
        gray,
        length,
        min,
        max,
        values: Array.from(values as number[]),
        scaledFactor: data.scaledFactor,
      }
    })

  const threshold = page.getByLabel('pt_accessibility', { exact: true })
  await expect(threshold).toBeVisible()

  // slider starts all the way left: nothing shaded
  expect((await shading()).gray).toBe(0)

  const { min, max, values, scaledFactor, length } = await shading()
  const middle = Number(((min + max) / 2).toFixed(2))
  const expected = values.filter(v => v <= middle * scaledFactor).length
  expect(expected).toBeGreaterThan(0)

  await threshold.fill(String(middle))
  await expect.poll(async () => (await shading()).gray).toBe(expected)

  // all the way right: everything shaded, with no snap back to full color at the end
  await threshold.fill(String(max))
  await expect.poll(async () => (await shading()).gray).toBe(length)

  // and back to the left: nothing shaded again
  await threshold.fill(String(min))
  await expect.poll(async () => (await shading()).gray).toBe(0)

  // flip to "greater than": a fully colored map stays fully colored, from the other end.
  // blur first, like clicking the dropdown would: lil-gui won't redraw a focused input
  await threshold.blur()
  await page.getByLabel('Gray out').selectOption({ label: 'greater than' })
  await expect(threshold).toHaveValue(max.toFixed(2))
  expect((await shading()).gray).toBe(0)

  await threshold.fill(String(middle))
  const expectedAbove = values.filter(v => v >= middle * scaledFactor).length
  await expect.poll(async () => (await shading()).gray).toBe(expectedAbove)

  // flipping with a limit set keeps the limit and grays the other side
  await threshold.blur()
  await page.getByLabel('Gray out').selectOption({ label: 'less than' })
  await expect.poll(async () => (await shading()).gray).toBe(expected)
  await page.getByLabel('Gray out').selectOption({ label: 'greater than' })

  // all the way left now grays everything
  await threshold.fill(String(min))
  await expect.poll(async () => (await shading()).gray).toBe(length)
})
