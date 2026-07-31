import { test, expect, Page } from '@playwright/test'

/**
 * The `events` plugin (src/plugins/event-viewer) -- a MATSim event stream decompressed
 * and parsed by a Rust/WASM worker, drawn as moving vehicle icons on a deck.gl overlay.
 *
 * Fixture: e2e-tests/cottbus/output_events.xml.gz (small enough to stream in a few
 * seconds) plus output_network.xml.gz beside it. Lives outside git.
 *
 * The plugin auto-starts its animation in mounted(), so the deck layers rebuild every
 * frame with no interaction at all -- which is what makes trap #7 (a reactive deck
 * overlay) reproducible here rather than latent.
 */

const ROUTE = 'e2e-tests/cottbus/output_events.xml.gz'

/**
 * Headless GPU chatter, Vite shimming node builtins, maplibre complaining about sprite
 * images its own style asset references but does not ship, and the WASM module's
 * deprecated exception-handling opcodes (firefox only).
 */
const isNoise = (t: string) =>
  /GPU stall|webgl|externalized for browser|could not be loaded|exception handling/i.test(t)

function watchConsole(page: Page) {
  const noise: string[] = []
  page.on('console', m => {
    const t = m.text()
    if (isNoise(t)) return
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${m.type()}] ${t}`)
  })
  page.on('pageerror', e => noise.push('PAGEERROR ' + e.message))
  return noise
}

const streamFinished = (page: Page) =>
  page.waitForEvent('console', {
    timeout: 90_000,
    predicate: msg => msg.text().includes('STREAM FINISHED'),
  })

test('cottbus event animation loads', async ({ page }) => {
  test.setTimeout(120_000)

  await page.goto(ROUTE)
  await page.waitForSelector('.map-layer')
  await streamFinished(page)

  // The worker payload is Comlink-structured-cloned; if it carries a Vue reactive Proxy
  // the whole stream dies with DataCloneError and nothing ever arrives. Trap #1.
  const data = await page.evaluate(() => (window as any).__testdata__)
  expect(data.chunks).toBeGreaterThan(0)
  expect(data.totalTrips).toBeGreaterThan(1000)
  // a full simulated day of link traversals, so the span is hours, not seconds
  expect(data.timeRange[1] - data.timeRange[0]).toBeGreaterThan(3600)
})

/**
 * Regression test for trap #7: deck.gl freezes its layer props, and reading a frozen
 * property back through a Vue reactive proxy violates the proxy invariant and throws.
 * The overlay lives in data(), so without markRaw() every layer built by the `layers`
 * computed is reached through a proxy.
 *
 * It throws during deck's layer *matching* phase, i.e. only on the second render pass --
 * a plain load-and-screenshot exits clean. Here the animation loop supplies those passes,
 * so letting the clock run for a few seconds is the test.
 */
test('the running animation keeps the console clean', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(ROUTE)
  await page.waitForSelector('.map-layer')
  await streamFinished(page)

  // let the animation rebuild the deck layers many times over
  await page.waitForTimeout(6000)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * The time slider drives simulationTime, which every MovingIconsLayer reads -- a second
 * source of layer updates, and the only one a user controls. Dragging it also stops the
 * animation via the slider's `drag` event.
 */
test('the time slider moves the clock and stops the animation', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(ROUTE)
  await page.waitForSelector('.map-layer')
  await streamFinished(page)

  const track = page.locator('.time-slider-area .time-slider-dragger')
  // the draggable window itself: at t=0 it is a thin sliver pinned to the left edge, so
  // a drag started anywhere else on the track never reaches dragStart()
  const window_ = page.locator('.time-slider-area .active-region')
  await expect(window_).toBeVisible()

  const clock = () => page.locator('.time-slider-area .p1').textContent()
  const before = await clock()

  const trackBox = (await track.boundingBox())!
  const windowBox = (await window_.boundingBox())!
  await page.mouse.move(windowBox.x + windowBox.width / 2, windowBox.y + windowBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(
    trackBox.x + trackBox.width * 0.5,
    trackBox.y + trackBox.height / 2,
    { steps: 10 }
  )
  await page.mouse.up()

  // half a day in, vs. the couple of minutes the 0.01x animation has covered
  const after = await clock()
  expect(after).not.toEqual(before)
  expect(Number(after!.split(':')[0])).toBeGreaterThan(6)

  // the drag emits `drag`, which sets isAnimating=false -- so the clock must now hold
  await page.waitForTimeout(2500)
  expect(await clock()).toEqual(after)

  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * maplibre freezes the `rgb` array on each Color it parses out of a style, so a
 * *reactive* maplibre Map throws the same proxy-invariant TypeError -- but only on the
 * second style parse, i.e. when the user switches the basemap theme, never on first
 * paint. That is the only thing that exercises markRaw() on `mymap` here.
 */
test('switching the basemap theme redraws without errors', async ({ page }) => {
  test.setTimeout(120_000)
  const noise = watchConsole(page)

  await page.goto(ROUTE)
  await page.waitForSelector('.map-layer')
  await streamFinished(page)

  await page.locator('.settings-cog').click()
  await page.locator('.settings-popup button', { hasText: 'Dark' }).first().click()
  await page.waitForTimeout(3000)

  await expect(page.locator('canvas')).toHaveCount(1)
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})

/**
 * beforeUnmount was `beforeDestroy` -- silently dead in Vue 3 (trap #2). It terminates
 * the streaming worker, destroys the lil-gui panel and cancels the rAF loop, and the
 * map component's own hook removes the deck overlay and the maplibre map.
 *
 * Unmount must be driven by CLICKING. A page.goto() throws the whole JS context away,
 * so every assertion below would pass against a completely dead hook. maplibre's Map
 * registers window listeners and drops them in .remove(), so the listener tally across
 * two mount/unmount cycles is what actually proves EventDeckMap's hook ran.
 */
test('the map tears down on unmount', async ({ page }) => {
  test.setTimeout(180_000)
  const noise = watchConsole(page)

  await page.addInitScript(() => {
    const w = window as any
    w.__listeners__ = 0
    const add = window.addEventListener.bind(window)
    const remove = window.removeEventListener.bind(window)
    window.addEventListener = (...args: any[]) => {
      w.__listeners__++
      return (add as any)(...args)
    }
    window.removeEventListener = (...args: any[]) => {
      w.__listeners__--
      return (remove as any)(...args)
    }
  })

  await page.goto(ROUTE)

  const tallies: number[] = []
  for (let i = 0; i < 2; i++) {
    await page.waitForSelector('.map-layer')
    await streamFinished(page)

    // leave while the animation is still running
    await page.locator('.btn-header-back').click()
    await expect(page.locator('.map-layer')).toHaveCount(0)
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect
      .poll(() => page.evaluate(() => typeof (window as any).__testdata__))
      .toBe('undefined')
    // the lil-gui panel is destroyed by the plugin's own hook
    await expect(page.locator('.lil-gui.root')).toHaveCount(0)

    await page.waitForTimeout(3000)
    tallies.push(await page.evaluate(() => (window as any).__listeners__))

    await page.getByText('output_events.xml.gz', { exact: true }).first().click()
  }

  expect(tallies[1], `listener tally grew across cycles: ${tallies}`).toBeLessThanOrEqual(
    tallies[0]
  )
  expect(noise, `unexpected console output:\n${noise.join('\n')}`).toEqual([])
})
