import { test, expect } from '@playwright/test'

// The tiles/ fixture has two cards, one per form that `tile.vue` accepts:
//   - "Tiles from CSV": headerless tile-metrics.csv, columns name,value,icon,url
//   - "Tiles from inline list": an inline list of key/value pairs

const openTiles = async (page: any) => {
  await page.goto('e2e-tests/tiles')
  await page.waitForSelector('.tile')
}

test('tile panel loads both dataset forms without errors', async ({ page }) => {
  await openTiles(page)

  const titles = page.locator('.dash-card-headers')
  await expect(titles).toHaveCount(2)
  await expect(titles.nth(0)).toHaveText(/Tiles from CSV/)
  await expect(titles.nth(1)).toHaveText(/Tiles from inline list/)

  await expect(page.locator('.tile')).toHaveCount(7)
  await expect(page.locator('.error-text')).toHaveCount(0)
})

test('csv tiles take their name and value from the file', async ({ page }) => {
  await openTiles(page)

  const csv = page.locator('.dash-card-frame').nth(0)
  await expect(csv.locator('.tile')).toHaveCount(4)
  await expect(csv.locator('.tile-title')).toHaveText([
    'Total trips',
    'Avg speed',
    'Stuck agents',
    'PT mode share',
  ])
  await expect(csv.locator('.tile-value')).toHaveText(['128456', '41.9', '12', '0.24'])
})

test('icons resolve to a local asset or fall through to font-awesome', async ({ page }) => {
  await openTiles(page)

  const csv = page.locator('.dash-card-frame').nth(0)
  // directions_bike + train are in the panel's localTileIcons list -> local SVG assets
  const local = csv.locator('img.tile-image')
  await expect(local).toHaveCount(2)
  await expect(local.nth(0)).toHaveAttribute('src', /directions_bike\.svg$/)
  await expect(local.nth(1)).toHaveAttribute('src', /train\.svg$/)
  // car + bus are not in that list, so they render as font-awesome svgs
  await expect(csv.locator('svg.tile-image')).toHaveCount(2)
})

test('only the tile with a url is clickable', async ({ page }) => {
  await openTiles(page)

  const csv = page.locator('.dash-card-frame').nth(0)
  const linked = csv.locator('a:not(.is-not-clickable)')
  await expect(linked).toHaveCount(1)
  await expect(linked).toHaveAttribute('href', 'https://www.matsim.org')
  await expect(csv.locator('a.is-not-clickable')).toHaveCount(3)
})

test('inline-list tiles render values with no icons', async ({ page }) => {
  await openTiles(page)

  const inline = page.locator('.dash-card-frame').nth(1)
  await expect(inline.locator('.tile')).toHaveCount(3)
  await expect(inline.locator('.tile-title')).toHaveText([
    'Persons',
    'Mobile persons [%]',
    'Trips per person',
  ])
  await expect(inline.locator('.tile-value')).toHaveText(['376639', '89.72', '3.4'])
  await expect(inline.locator('.tile-image')).toHaveCount(0)
})
