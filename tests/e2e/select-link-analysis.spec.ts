import { test, expect } from '@playwright/test'
// @ts-ignore
import fs from 'fs'
// @ts-ignore
import path from 'path'

const LINKS_BERLIN = [
  { id: '253770361#1', hour: [12, 16], label: 'highway.motorway' },
  { id: '78298214#1', hour: [12, 16], label: 'highway.primary' },
  { id: '440212233#0', hour: [12, 16], label: 'highway.secondary' },
  { id: '948456834#2', hour: [12, 16], label: 'highway.residential' },
  { id: '248416565', hour: [12, 16], label: 'highway.motorway' },
]

// const WARMUP_LINK_ID_BERLIN = '4555235'
const WARMUP_LINK_ID_BERLIN = '83917720' // used for 1pct SQLite local

const LINKS_RUHR = [
  { id: '2291459880004f-237186430001f', hour: [12, 16], label: 'highway.motorway' },
  { id: '2966801060000f-2966801070000f', hour: [12, 16], label: 'highway.primary' },
  { id: '6247729410000r', hour: [12, 16], label: 'highway.secondary' },
  { id: '43977580009r', hour: [12, 16], label: 'highway.residential' },
  { id: '233306890020f-50771330000f', hour: [12, 16], label: 'highway.motorway' },
]

const WARMUP_LINK_ID_RUHR = '3053953260010r-1485045980001r'

const DATASETS = [
  {
    name: 'berlin',
    subfolder: '1pct_runs/r122880',
    scale: '1pct',
    links: LINKS_BERLIN,
    warmupLinkId: WARMUP_LINK_ID_BERLIN,
  },
  {
    name: 'berlin',
    subfolder: '10pct_runs/r122880',
    scale: '10pct',
    links: LINKS_BERLIN,
    warmupLinkId: WARMUP_LINK_ID_BERLIN,
  },
  {
    name: 'ruhr',
    subfolder: '10pct_runs/r122880_Ruhr',
    scale: '10pct',
    links: LINKS_RUHR,
    warmupLinkId: WARMUP_LINK_ID_RUHR,
  },
]
//
// 'Parquet','Csv'
const FORMATS = ['Sqlite', 'Parquet', 'Csv'] as const

type Format = (typeof FORMATS)[number]
const BACKENDS = [
  // { name: 'svn', path: 'e2e-tests' },
  // { name: 's3', path: 'e2e-tests-s3/select-link-analysis-test' },
  { name: 'local-host', path: 'e2e-tests-local' },
] as const
// @ts-ignore
const env = process.env
const QUICK = env.QUICK === '1' // smoke test: 1 sample, 2 reps
const N = env.N ? Number(env.N) : undefined // override samples per backend
const PREFETCH: string = env.PREFETCH ?? 'none' // 'footers' = read all footers at load
const REPS = QUICK ? 2 : 30
const SAMPLES: Record<Format, number> = { Parquet: 5, Sqlite: 5, Csv: 5 }
const samplesFor = (ds: string, f: Format) =>
  N ?? (QUICK ? 1 : Math.round(SAMPLES[f] * (ds === 'ruhr' ? 0.5 : 1)))
const SUFFIX = PREFETCH === 'none' ? '' : `__prefetch-${PREFETCH}`
const RESULTS_ROOT: string = env.RESULTS_DIR ?? 'benchmark-results/final_tests'
const COLD_DIR = path.join(RESULTS_ROOT, 'cold')
const WARM_DIR = path.join(RESULTS_ROOT, 'warm')

// refuse to silently overwrite finished data
function startFile(file: string) {
  if (fs.existsSync(file) && env.OVERWRITE !== '1') {
    throw new Error(
      `${file} already exists. Set OVERWRITE=1 to replace it, or use a new RESULTS_DIR.`
    )
  }
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, '')
}

const skip = (ds: string, f: Format) => ds === 'ruhr' && f === 'Csv'
// partition comparison only for Parquet on Berlin; everything else hour-partitioned
const partitionsFor = (ds: string, f: Format) =>
  f === 'Parquet' && ds === 'berlin' ? ['hour', 'none'] : ['hour']

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

const withTimeout = <T>(p: Promise<T>, ms: number, what: string): Promise<T> => {
  let timer: ReturnType<typeof setTimeout>
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${what} exceeded ${ms} ms`)), ms)
    }),
  ]).finally(() => clearTimeout(timer))
}

const CLICK_TIMEOUT_MS: Record<Format, number> = {
  Parquet: 2 * 60_000,
  Sqlite: 10 * 60_000, // includes a full download
  Csv: 10 * 60_000,
}

function toCsv(rows: Record<string, any>[], header: boolean): string {
  if (rows.length === 0) return ''
  const headers = Object.keys(rows[0])
  const esc = (v: any) => {
    const s = String(v ?? '')
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = rows.map(r => headers.map(h => esc(r[h])).join(','))
  return (header ? [headers.join(','), ...lines] : lines).join('\n') + '\n'
}

// test.describe('select link analyzer - session (cold) benchmark', () => {
//   for (const dataset of DATASETS) {
//     for (const format of FORMATS) {
//       if (skip(dataset.name, format)) continue
//       for (const partition of partitionsFor(dataset.name, format)) {
//         test(`cold: ${dataset.name}/${dataset.scale}/${format}/${partition}`, async ({
//           browser,
//           baseURL,
//         }) => {
//           // test.setTimeout(3 * 60 * 60_000)
//           test.setTimeout(0)
//           const n = samplesFor(dataset.name, format)
//           const L = dataset.links.length
//           const outFile = path.join(
//             COLD_DIR,
//             `${dataset.name}__${dataset.scale}__${format}__${partition}${SUFFIX}.csv`
//           )
//           startFile(outFile)
//           let headerDone = false
//           let failures = 0
//           let badResults = 0

//           for (let sample = 0; sample < n; sample++) {
//             const link = dataset.links[sample % L]
//             const other = dataset.links[(sample + 1) % L] // different link for the "new link" click
//             // counterbalance: even samples go 12 -> 16, odd samples go 16 -> 12
//             const hours = sample % 2 === 0 ? [...link.hour] : [...link.hour].reverse()
//             const rows: Record<string, any>[] = []

//             for (const backend of shuffle([...BACKENDS])) {
//               const context = await browser.newContext({ baseURL: baseURL ?? undefined })
//               const page = await context.newPage()
//               try {
//                 await page.addInitScript(
//                   ([f, p, pf]) => {
//                     const w = window as any
//                     w.__testFormat__ = f
//                     w.__testPartition__ = p
//                     w.__testPrefetch__ = pf
//                   },
//                   [format, partition, PREFETCH] as [string, string, string]
//                 )

//                 // network tally for data files (content-length is indicative, not exact)
//                 const net = { n: 0, n206: 0, bytes: 0 }
//                 context.on('response', resp => {
//                   if (/\.(parquet|csv|sqlite3)(\?|$)/.test(resp.url())) {
//                     net.n++
//                     if (resp.status() === 206) net.n206++
//                     net.bytes += Number(resp.headers()['content-length'] ?? 0)
//                   }
//                 })
//                 const snap = () => ({ ...net })

//                 const t0 = Date.now()
//                 await page.goto(`${backend.path}/${dataset.subfolder}`)
//                 await page.getByText('INFO PANEL').waitFor({ timeout: 300_000 })
//                 await page.waitForFunction(
//                   fmt => (window as any).__testdata__?.getReady?.()[fmt] === true,
//                   format,
//                   { timeout: 300_000 }
//                 )
//                 const readyMs = Date.now() - t0
//                 const ready = snap()

//                 await page.waitForFunction(
//                   () => {
//                     const m = (window as any).__mapReadyByViewId
//                     return m && Object.values(m).some(r => r === true)
//                   },
//                   undefined,
//                   { timeout: 60_000 }
//                 )

//                 const cfg = await page.evaluate(() => (window as any).__testdata__.getConfig())
//                 expect(cfg.partition, 'component ignored partition flag').toBe(partition)

//                 const clicks = [
//                   { clickType: 'first', linkId: link.id, hour: hours[0] },
//                   { clickType: 'hour_switch', linkId: link.id, hour: hours[1] },
//                   // realistic "warm" click: different link, hour already touched.
//                   // skipped for CSV: it has nothing to warm and each click costs ~30 s
//                   ...(format !== 'Csv'
//                     ? [{ clickType: 'new_link_same_hour', linkId: other.id, hour: hours[1] }]
//                     : []),
//                 ]

//                 for (const click of clicks) {
//                   const before = snap()
//                   const r = await withTimeout(
//                     page.evaluate(
//                       async ([id, hr, fmt]) => {
//                         const out = await (window as any).__testdata__.selectLink(id, hr, fmt)

//                         const counts = Object.values(out.result) as number[]

//                         return {
//                           queryTime: out.queryTime,
//                           prepTime: out.prepTime,
//                           totalTime: out.totalTime,
//                           nCoLinks: counts.length,
//                           traversalSum: counts.reduce((a, b) => a + b, 0),
//                         }
//                       },
//                       [click.linkId, click.hour, format] as [string, number, string]
//                     ),
//                     CLICK_TIMEOUT_MS[format],
//                     `${dataset.name}/${format}/${backend.name} ${click.clickType}`
//                   )
//                   const after = snap()
//                   if (!(r.nCoLinks > 0)) badResults++
//                   rows.push({
//                     dataset: dataset.name,
//                     scale: dataset.scale,
//                     backend: backend.name,
//                     format,
//                     partition,
//                     prefetch: cfg.prefetch,
//                     sample,
//                     linkId: click.linkId,
//                     linkType: dataset.links.find(l => l.id === click.linkId)?.label,
//                     clickType: click.clickType,
//                     hour: click.hour,
//                     readyMs,
//                     readyReqs: ready.n,
//                     readyMB: ready.bytes / 1e6,
//                     reqs: after.n - before.n,
//                     reqs206: after.n206 - before.n206,
//                     mb: (after.bytes - before.bytes) / 1e6,
//                     ...r,
//                     timestamp: new Date().toISOString(),
//                   })
//                 }
//                 console.log(
//                   `[${dataset.name}/${format}/${partition}] ${sample + 1}/${n} ${
//                     backend.name
//                   } ready ${readyMs} ms`
//                 )
//               } catch (e) {
//                 failures++
//                 console.error(
//                   `FAILED session ${dataset.name}/${format}/${backend.name} sample ${sample}`,
//                   e
//                 )
//               } finally {
//                 await context.close()
//               }
//             }
//             fs.appendFileSync(outFile, toCsv(rows, !headerDone))
//             if (rows.length) headerDone = true
//           }

//           expect(failures, 'failed sessions').toBe(0)
//           expect(badResults, 'clicks with empty results').toBe(0)
//         })
//       }
//     }
//   }
// })

test.describe('select link analyzer - session (warm) benchmark', () => {
  for (const dataset of DATASETS) {
    for (const format of FORMATS) {
      if (skip(dataset.name, format)) continue
      for (const partition of partitionsFor(dataset.name, format)) {
        for (const backend of BACKENDS) {
          test(`warm: ${dataset.name}/${dataset.scale}/${format}/${partition}/${backend.name}`, async ({
            page,
          }) => {
            // test.setTimeout(3 * 60 * 60_000)
            test.setTimeout(0)

            const L = dataset.links.length
            const results: Record<string, any>[] = []

            const outFile = path.join(
              WARM_DIR,
              backend.name,
              `${dataset.name}__${dataset.scale}__${format}__${partition}${SUFFIX}.csv`
            )
            startFile(outFile)

            let headerDone = false

            await page.addInitScript(
              ([f, p, pf]) => {
                const w = window as any
                w.__testFormat__ = f
                w.__testPartition__ = p
                w.__testPrefetch__ = pf
              },
              [format, partition, PREFETCH] as [string, string, string]
            )

            page.on('console', msg => console.log(msg.text()))
            const t0 = Date.now()
            await page.goto(`${backend.path}/${dataset.subfolder}`)
            await page.getByText('INFO PANEL').waitFor({
              timeout: 300_000,
            })

            await page.waitForFunction(() => !!(window as any).__testdata__, undefined, {
              timeout: 300_000,
            })

            await page.waitForFunction(
              fmt => (window as any).__testdata__?.getReady?.()[fmt] === true,
              format,
              { timeout: 300_000 }
            )

            const ready = await page.evaluate(() => (window as any).__testdata__.getReady())
            expect(ready[format], `not ready: ${JSON.stringify(ready)}`).toBe(true)
            const readyMs = Date.now() - t0

            // Wait for the map instance and its initial render to be ready.
            await page.waitForFunction(
              () => {
                const maps = (window as any).__mapReadyByViewId
                return maps && Object.values(maps).some(v => v === true)
              },
              undefined,
              { timeout: 60_000 }
            )

            const cfg = await page.evaluate(() => (window as any).__testdata__.getConfig())
            expect(cfg.partition, 'component ignored partition flag').toBe(partition)

            // Warm-up: visit every distinct hour, finishing at firstHour.
            const firstHour = dataset.links[0].hour[0]
            const warmupHours = [...new Set(dataset.links.flatMap(link => link.hour))]
            const warmupOrder = [...warmupHours.filter(hour => hour !== firstHour), firstHour]

            for (const hour of warmupOrder) {
              const nCo = await withTimeout(
                page.evaluate(
                  async ([id, hr, fmt]) => {
                    const out = await (window as any).__testdata__.selectLink(id, hr, fmt)
                    return Object.keys(out.result).length
                  },
                  [dataset.warmupLinkId, hour, format] as [string, number, string]
                ),
                CLICK_TIMEOUT_MS[format],
                `warm-up ${dataset.name}/${format} h${hour}`
              )
              expect(nCo, `warm-up link has no data at hour ${hour}`).toBeGreaterThan(0)
            }

            // Measured clicks: shuffled links, alternating hour blocks.
            // The first measured click is warm because warm-up has already run.
            let clickCount = 0
            let prevHour = firstHour

            for (let rep = 0; rep < REPS; rep++) {
              const repRows: Record<string, any>[] = []
              const links = shuffle(dataset.links)

              for (const link of links) {
                const hourIndex = Math.floor(clickCount / L) % 2

                const hour = link.hour[hourIndex]

                const isFirstClickOverall = clickCount === 0
                const hourSwitched = hour !== prevHour
                const isFirstClickAfterHourSwitch = !isFirstClickOverall && hourSwitched

                const r = await withTimeout(
                  page.evaluate(
                    async ([id, hr, fmt]) => {
                      const out = await (window as any).__testdata__.selectLink(id, hr, fmt)
                      const counts = Object.values(out.result) as number[]
                      return {
                        queryTime: out.queryTime,
                        prepTime: out.prepTime,
                        totalTime: out.totalTime,
                        nCoLinks: counts.length,
                        traversalSum: counts.reduce((a, b) => a + b, 0),
                      }
                    },
                    [link.id, hour, format] as [string, number, string]
                  ),
                  CLICK_TIMEOUT_MS[format],
                  `${dataset.name}/${format}/${backend.name} rep ${rep} ${link.id} h${hour}`
                )

                const row = {
                  dataset: dataset.name,
                  scale: dataset.scale,
                  backend: backend.name,
                  format,
                  partition,
                  prefetch: cfg.prefetch,
                  rep,
                  linkId: link.id,
                  linkType: link.label,
                  hour,
                  isFirstClickOverall,
                  hourSwitched,
                  isFirstClickAfterHourSwitch,
                  readyMs,
                  ...r,
                  timestamp: new Date().toISOString(),
                }

                results.push(row)
                repRows.push(row)

                prevHour = hour
                clickCount++
              }

              // Persist each repetition so partial results survive failures.
              if (repRows.length > 0) {
                fs.appendFileSync(outFile, toCsv(repRows, !headerDone))
                headerDone = true
              }

              console.log(
                `[${dataset.name}/${format}/${backend.name}] ` +
                  `rep ${rep + 1}/${REPS}, ` +
                  `clicks ${clickCount}/${REPS * L}`
              )
            }

            expect(results.length).toBe(REPS * L)

            expect(
              results.every(r => typeof r.totalTime === 'number' && r.totalTime > 0),
              'invalid totalTime'
            ).toBe(true)

            // expect(
            //   results.every(r => r.nCoLinks > 0),
            //   'clicks with empty results'
            // ).toBe(true)

            expect(
              results.every(r => r.format === format),
              'format mismatch'
            ).toBe(true)
          })
        }
      }
    }
  }
})
