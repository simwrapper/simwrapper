#!/usr/bin/env node
/**
 * Headless smoke-check for the running dev server. Loads one or more routes,
 * reports console errors/warnings + uncaught page errors, and screenshots each.
 *
 * Intended for the plugin re-migration loop: after wiring up a plugin, point
 * this at its route to confirm it mounts with a clean console.
 *
 * Usage (dev server must already be running, e.g. `pnpm dev`):
 *   node scripts/smoke-check.mjs                       # checks "/" on :5173
 *   node scripts/smoke-check.mjs / /embed /runconfig/x
 *   BASE=http://localhost:5199 node scripts/smoke-check.mjs /some/path
 *   SHOT_DIR=/tmp/shots node scripts/smoke-check.mjs /
 *
 * Exit code is non-zero if any route produced console errors or page errors.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const BASE = process.env.BASE || 'http://localhost:5173'
const SHOT_DIR = process.env.SHOT_DIR || '/tmp/simwrapper-shots'
const paths = process.argv.slice(2)
if (paths.length === 0) paths.push('/')

mkdirSync(SHOT_DIR, { recursive: true })

const browser = await chromium.launch()
const page = await browser.newPage()
await page.setViewportSize({ width: 1400, height: 900 })

const problems = []
page.on('console', m => {
  if (m.type() === 'error' || m.type() === 'warning') current.push(`[${m.type()}] ${m.text().slice(0, 200)}`)
})
page.on('pageerror', e => current.push(`[pageerror] ${e.message}`))

let current = []
let failed = 0

for (const path of paths) {
  current = []
  const url = BASE.replace(/\/$/, '') + path
  await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(e => current.push('[goto] ' + e.message))
  await page.waitForTimeout(2500)

  const text = (await page.evaluate(() => document.body.innerText || '')).replace(/\s+/g, ' ').trim().slice(0, 140)
  const shot = `${SHOT_DIR}/${path.replace(/[^a-z0-9]+/gi, '_') || 'root'}.png`
  await page.screenshot({ path: shot, fullPage: true })

  const bad = current.length > 0
  if (bad) failed++
  console.log(`\n${bad ? '✗' : '✓'} ${path}`)
  console.log(`  text: ${text}`)
  console.log(`  shot: ${shot}`)
  console.log(`  console: ${bad ? '\n   ' + current.slice(0, 20).join('\n   ') : '(clean)'}`)
  if (bad) problems.push(path)
}

await browser.close()
console.log(`\n${failed ? `FAILED: ${problems.join(', ')}` : `OK: ${paths.length} route(s) clean`}`)
process.exit(failed ? 1 : 0)
