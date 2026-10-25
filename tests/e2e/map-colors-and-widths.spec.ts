// Map diff-mode colors, checked end-to-end: YAML config -> ShapeFile.vue -> ColorsAndWidths.ts.
//
// Uses the e2e-tests/maps/sf test data: dashboard-1-relative.yaml (av_trip_origins.*,
// av_trips2.csv) and the viz-map-colors-test.yaml fixture (colors-test-*.csv).
// The per-feature colors are read back out of each map's Vue component and
// compared with the palette bucket each feature should land in.

import { test, expect, Page } from '@playwright/test'

// RdBu, reversed, 9 steps -- with the diverging center replaced by pale gray
const RDBU = [
  '#b2182b',
  '#d6604d',
  '#f4a582',
  '#fddbc7',
  '#e4e4e4',
  '#d1e5f0',
  '#92c5de',
  '#4393c3',
  '#2166ac',
]
const NO_DATA = -1 // not a palette color: the gray used for features with no data

interface MapColors {
  title: string
  ids: string[]
  bucket: number[] // palette index of each feature's fill color
  values: number[]
}

// Walk the Vue component tree for map components and read their fill colors
async function readMapColors(page: Page): Promise<MapColors[]> {
  return page.evaluate(palette => {
    const maps: any[] = []
    const walk = (vnode: any) => {
      if (!vnode) return
      const c = vnode.component
      if (c) {
        if (c.proxy && 'dataFillColors' in c.proxy && c.proxy.boundaries) maps.push(c.proxy)
        walk(c.subTree)
      }
      if (Array.isArray(vnode.children)) vnode.children.forEach(walk)
      if (vnode.suspense) walk(vnode.suspense.activeBranch)
    }
    walk((document.querySelector('#app') as any).__vue_app__._instance.subTree)

    const toHex = (c: number[]) => '#' + c.map(v => v.toString(16).padStart(2, '0')).join('')
    return maps.map(p => {
      const featureTable = p.datasets[Object.keys(p.datasets)[0]]
      const rgb = p.dataFillColors || []
      const ids = Array.from(featureTable.GEOID10.values) as string[]
      return {
        title: p.vizDetails?.title,
        ids,
        bucket: ids.map((_, i) => palette.indexOf(toHex(Array.from(rgb.slice(3 * i, 3 * i + 3))))),
        values: Array.from(p.dataCalculatedValues || []) as number[],
      }
    })
  }, RDBU)
}

async function waitForMapColors(page: Page, numMaps: number) {
  let maps: MapColors[] = []
  await expect
    .poll(
      async () => {
        maps = await readMapColors(page)
        return maps.filter(m => m.values.length && m.bucket.some(b => b !== NO_DATA)).length
      },
      { timeout: 60_000 }
    )
    .toBe(numMaps)
  return maps
}

const countBuckets = (buckets: number[]) => RDBU.map((_, i) => buckets.filter(b => b === i).length)

const legendLabels = (page: Page, mapIndex: number) =>
  page.locator('.legend-box').nth(mapIndex).locator('.row-label')

test.describe('SF dashboard: difference and relative difference maps', () => {
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('e2e-tests/maps/sf/')
    await expect(page.locator('.legend-box')).toHaveCount(2, { timeout: 60_000 })
  })

  test('legends: center bucket is -1..1, breakpoints spread to the biggest diff', async ({
    page,
  }) => {
    await expect(legendLabels(page, 0)).toHaveText([
      '< -22711',
      '-22711 — -15141',
      '-15141 — -7570',
      '-7570 — -1',
      '-1 — 1',
      '1 — 7570',
      '7570 — 15141',
      '15141 — 22711',
      '> 22711',
    ])
    await expect(legendLabels(page, 1)).toHaveText([
      '< -37',
      '-37 — -25',
      '-25 — -12',
      '-12 — -1',
      '-1 — 1',
      '1 — 12',
      '12 — 25',
      '25 — 37',
      '> 37',
    ])
  })

  test('every feature lands in the right color bucket', async ({ page }) => {
    const [diff, relative] = await waitForMapColors(page, 2)

    expect(diff.title).toBe('Diffs - total')
    expect(countBuckets(diff.bucket)).toEqual([1, 0, 0, 172, 16, 371, 13, 6, 1])

    expect(relative.title).toBe('Relative change - total')
    expect(countBuckets(relative.bucket)).toEqual([0, 0, 73, 95, 21, 85, 100, 105, 101])

    // downtown tract: biggest absolute drop, but only -17.4% relative
    const downtown = diff.ids.indexOf('06075061500')
    expect(diff.values[downtown]).toBeCloseTo(-30281.7, 0)
    expect(diff.bucket[downtown]).toBe(0)
    expect(relative.values[downtown]).toBeCloseTo(-17.4, 1)
    expect(relative.bucket[downtown]).toBe(2)
  })

  test('absolute and relative diffs never disagree in sign', async ({ page }) => {
    const [diff, relative] = await waitForMapColors(page, 2)
    const side = (b: number) => Math.sign(b - 4) // below, at, or above the center color

    const disagree = diff.bucket.filter((b, i) => side(b) * side(relative.bucket[i]) === -1).length
    expect(disagree).toBe(0)
  })
})

test.describe('relative diffs with small changes and zero base values', () => {
  // Test fixture in e2e-tests/maps/sf: viz-map-colors-test.yaml, which diffs
  // colors-test-now.csv against colors-test-base.csv (relative, RdBu, 9 steps).
  // The two CSVs hold exactly the base and now values below; keep them in sync.
  //
  // tract id, base, now --> expected % change and color bucket
  const ROWS: [string, number, number, number, number][] = [
    ['06081601601', 100, 97, -3, 0],
    ['06081601300', 100, 98, -2, 2],
    ['06081601200', 100, 99.5, -0.5, 4],
    ['06081601000', 100, 100, 0, 4],
    ['06081600900', 100, 100.5, 0.5, 4],
    ['06081600500', 100, 102, 2, 7],
    ['06081600300', 100, 103, 3, 8],
    ['06081600100', 0, 50, Infinity, 8], // increase from zero: darkest color
    ['06081600401', 0, 0, NaN, NO_DATA], // nothing in either: no data
  ]
  test.beforeEach(async ({ page }) => {
    test.setTimeout(90_000)
    await page.goto('e2e-tests/maps/sf/viz-map-colors-test.yaml')
    await expect(page.locator('.legend-box')).toHaveCount(1, { timeout: 60_000 })
  })

  test('legend breakpoints stay in order around the -1..1 center', async ({ page }) => {
    await expect(legendLabels(page, 0)).toHaveText([
      '< -2.5',
      '-2.5 — -2',
      '-2 — -1.5',
      '-1.5 — -1',
      '-1 — 1',
      '1 — 1.5',
      '1.5 — 2',
      '2 — 2.5',
      '> 2.5',
    ])
  })

  test('features get the expected colors', async ({ page }) => {
    const [map] = await waitForMapColors(page, 1)

    for (const [id, , , percent, bucket] of ROWS) {
      const i = map.ids.indexOf(id)
      expect(i, id).toBeGreaterThanOrEqual(0)
      if (Number.isNaN(percent)) expect(map.values[i], id).toBeNaN()
      else if (Number.isFinite(percent)) expect(map.values[i], id).toBeCloseTo(percent, 3)
      else expect(map.values[i], id).toBe(percent)
      expect(map.bucket[i], id).toBe(bucket)
    }

    // tracts that aren't in either CSV have no data
    const listed = new Set(ROWS.map(r => r[0]))
    const unlisted = map.ids.filter(id => !listed.has(id))
    expect(unlisted.every(id => map.bucket[map.ids.indexOf(id)] === NO_DATA)).toBe(true)
  })
})
