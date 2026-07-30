# Vue 3 Migration — Status & Handoff

_Branch: `vue3`. Platform-core migration committed as `feat: Migrate platform core from
Vue 2.7 to Vue 3` (commit `4073dede`)._

## TL;DR

The **platform core** (bootstrap, layout manager, dashboards, left/nav panels, sim-runner)
is migrated to Vue 3 and verified running with a clean console. Re-migration of the
**viz plugins and dashboard chart panels** is underway; the rest are still
removed/commented out. This doc is the playbook for re-migrating them.

**Read ["Vue 3 traps that bite at runtime"](#vue-3-traps-that-bite-at-runtime) before
migrating anything.** Every bug listed there compiled and linted perfectly and only failed in
a browser — a plugin that "looks migrated" is not migrated until you render it, and (trap #7)
not until you've *clicked something in it*.

Stack now: Vue 3.5, vue-router 4, vuex 4, vue-i18n 9 (**Legacy/Options API mode**),
Oruga UI (replacing Buefy) + Bulma, **Vite 8 (Rolldown bundler)** with `@vitejs/plugin-vue`,
Vitest 4, sass 1.102 (modern compiler), pnpm.

---

## What works today

- `pnpm dev` and `pnpm build` both succeed. App mounts, renders, clean console.
- Routes verified: `/` (SplashPage), `/embed`, `/runconfig/:id`, deep catch-all → LayoutManager.
- Oruga controls render/style via the Bulma theme (buttons, inputs, selects, fields,
  checkboxes, switch, sidebar; native Bulma navbar).
- i18n stays on the **Options API** — every component keeps its inline `i18n: { messages }`
  option and `$t()` unchanged. **Do the same in plugins** (see below).
- `pnpm test:run` (vitest, unit only): 8 pass, 1 fails (`tests/unit/table.test.js`) and
  `tests/unit/tile.test.ts` fails to load. Both panels are restored and render fine — the
  failures are stale-test issues, diagnosed under Loose ends. e2e specs for still-removed
  plugins will fail; ignore those until their plugins return.
- **No `vue-tsc` in this repo** — `.vue` files are never type-checked, and `pnpm build`
  (Rolldown) strips types without checking them, so type errors inside SFCs are invisible.
  This is a deliberate, measured decision — see
  [Why there's no vue-tsc](#why-theres-no-vue-tsc-evaluated-deferred).

### Migrated & verified so far

| | enabled | verified in a browser |
|---|---|---|
| dash-panels | `aequilibrae` `aggregate` `area` `bar` `bubble` `carriers` `csv` `flowmap` `gridmap` `heatmap` `hexagons` `line` `map` `pie` `plotly` `sankey` `scatter` `slideshow` `text` `tile` `vega` `video` `xml` | all except `pie` |
| plugins | `aeq-reader` `aggregate` `area-map` `carriers` `flowmap` `gridmap` `hexagons` `image-view` `plotly` `sankey` `summary-table` `vega-lite` `video-player` `xml` | all except `gridmap` (no fixture — see below) |

Still removed: `transit` `vehicles` panels, and the remaining
full-screen map plugins (`layers` `links` `matrix` `xytime`
`events` `logistics` `plans` …).

`flowmap` needed no new dependencies — the guide's old warning about `@luma.gl/core`,
`@luma.gl/shadertools` and `@visx/scale` being uninstalled does **not** apply to it:
`src/layers/flowmap/*` imports `@luma.gl/engine` (installed) and pulls `ShaderModule` from
`@luma.gl/shadertools` as a **type-only** import, which is erased before the bundler sees it.
`@visx/scale` belongs to the `ColorMapSelector`/matrix orphans, not flowmap. Only
`@flowmap.gl/data` matters and it is in `package.json`. Verified against
`e2e-tests/flowmap/sfcta` and `e2e-tests/flowmap/pt-flows` (both dashboards — no
`viz-flowmap*.yaml` fixture exists, so the standalone plugin route is unexercised).

Two long-standing warnings on those routes were fixed at the same time, both guarded by
`tests/e2e/flow-map.spec.ts` ("loads without console warnings", mutation-checked against
each fix):

- `deck: FlowmapLayer.componentName not specified` — deck.gl reads `componentName` off an
  **own** static `layerName` (`hasOwnProperty`, so inheriting doesn't count).
  `FlowmapLayer` and `AnimatedFlowLinesLayer` had none; the two sibling layers did.
- `Invalid color: undefined` ×2 — the magnitude accessor was `flow.v || null`, which also
  discarded a legitimate magnitude of **0**. Only reproducible with clustering on, because
  flowmap.gl seeds a cluster's total with the first member's value
  (`count: flowCountsMapReduce.map(flow)`), so a nulled-out zero could poison the cluster's
  colour scale. `pt_headway_per_stop_area_pair_and_hour.csv` has ~1300 blank-headway rows
  (a stop pair visited once has no headway) that parse to 0, which is why that fixture hit
  it and `sfcta` did not.

  Worth recording the *method*, because four plausible hypotheses were wrong first
  (NaN in the CSV, negative values, unmatched flow/centroid ids, bad stop coordinates —
  all disproved by checking the actual data). What localized it was toggling features and
  counting: clustering **off** → 0 warnings, clustering **on** → 2. Instrumenting our own
  accessor then showed it never emitted a bad value, which pointed at the `|| null`
  conversion rather than at the data.

`gridmap` (`dash-panels/gridmap.vue` + `plugins/grid-map/GridMap.vue` + its `MapComponent.vue`)
needed the usual checklist — `import Vue from 'vue'` + three `Vue.set` calls, two
`beforeDestroy` hooks, three `@import '@/styles.scss'`, `this.` in two template `v-if`s, and
the `ToggleButton` import **and** registration from the uninstalled `vue-js-toggle-button`
(imported, registered, never used in the template — same as `XyHexagons.vue`, so both lines
just go). Three things are worth recording beyond that:

- **It is the only consumer of `components/TimeSliderV2.vue` and
  `components/ClickThroughTimes.vue`**, which both declared `allTimes: [] as any[]` — an empty
  array as the prop *type*, matching no constructor. Vue 3: `Prop type [] for prop "allTimes"
  won't match anything`. Those two files were unreferenced and therefore **never compiled**
  while grid-map was out (the unreferenced-`.vue` trap under "Verifying a change"), so
  restoring the plugin is what surfaced it. Now `{ type: Array as PropType<any[]>, required:
  true }`. This was also [trap #8](#8-a-trailing--in-a-style-value-now-warns--and-drags-i18n-noise-in-with-it)
  a second time: the warning dragged two `[intlify] Not supported …` lines with it, and all
  three vanished together.
- ⚠️ **`beforeDestroy` here is not a slow leak, it's an immediate crash.** With the Vue 2 name
  the maplibre map is never removed and keeps running against a detached container:
  `PAGEERROR Cannot read properties of null (reading 'id')` on **every** navigation, plus a
  surviving `window.__testdata__` and lil-gui panel. Guarded by `gridmap-lifecycle.spec.ts`.
- **`markRaw` on the deck overlay is precautionary here — trap #7 does not reproduce.**
  Verified by removing it and driving the layer through several update passes (toggling `flip`,
  switching the column dropdown) with the console attached: still clean. The reason refines
  trap #7 usefully: the throw needs a **plain** object or array behind the frozen prop, and
  this layer's `data.attributes` payload is entirely **typed arrays**, which Vue's `reactive()`
  returns *untouched* (they're `TargetType.INVALID`), so the proxy invariant is never
  violated. Kept anyway as the robust whole-class fix — it costs nothing and the moment
  someone hands this layer a plain array the trap is live.

`area-map` is `shape-file/ShapeFile.vue` — the largest plugin in the repo (3.3k lines) and the
**only** consumer of the whole `components/viz-configurator/` directory plus
`ModalIdColumnPicker.vue`. Those 14 files were already Oruga-converted by an earlier pass but
had never been compiled or rendered, because nothing imported them while the plugin was
disabled; enabling `area-map` is what finally exercised them. All render clean. Verified
against `maps/hamburg`, `maps/geopackage`, `maps/networks` (both the `viz-map-*.yaml` plugin
route and the `dashboard-1.yaml` panel route) and `networks/viz-map-berlin-v6.4.yaml`,
including opening every configurator section, adding a dataset through the Add Data panel
(which round-trips the `DataFetcher` worker) and answering the join-column modal.

The `video` **panel** and the `video-player` **plugin** are different components serving the
same fixture folder two ways: `/e2e-tests/video-player` renders `dashboard-movie.yaml` through
the panel, `/e2e-tests/video-player/movie-via.mp4` matches the plugin's `*.mp4` pattern.
Check both when touching either.

`sqlite-map` is restored and migrated, but it isn't a plugin — it's a **support library**.
It's deliberately absent from `pluginRegistry.ts`: `tile.vue` uses its `db`/`loader`/
`helpers` modules for SQL-backed tiles, and `SqliteMapComponent.vue` is a headless
scoped-slot provider awaiting a consumer (the AequilibraE / Polaris readers, still removed —
`reader.scss` is theirs and is currently unimported). **Nothing currently compiles
`SqliteMapComponent.vue`** — see the warning about unreferenced `.vue` files under
"Verifying a change".

### Why there's no vue-tsc (evaluated, deferred)

`vue-tsc` is the SFC-aware type checker from the Vue language tools (Volar). It runs the same
TypeScript compiler but understands `.vue`: it extracts the `<script lang="ts">` block and,
for **HTML** templates, generates a virtual render function so template expressions, props,
slots and emits get checked. Plain `tsc` silently skips `.vue` files entirely — which is why
`tsconfig.json` already lists `src/**/*.vue` in `include` and it has never done anything.

Measured on this repo:

| finding | value |
|---|---|
| `tsc --noEmit` errors today, `.ts`/`.tsx` only | **148** across 45 files |
| …that are only missing dependency types (TS2307 / TS7016) | 31 (21%) |
| components using `<template lang="pug">` | **87 of 89** |
| `as any` in `.vue` / files containing `@ts-ignore` | 245 / 18 |

**The decisive reason: Volar does not type-check pug templates.** With 87 of 89 components on
pug, the headline benefit — wrong props, unknown components, typo'd bindings — is unavailable
for ~98% of the codebase. Adopting it buys `<script>`-block checking only.

Two further costs: `vue-tsc` v2+ requires TypeScript 5.x while `package.json` pins
`typescript: ^4.2.0` (resolves to 4.9.5), and that bump alone will churn the existing 148
errors; and `src/shims-vue.d.ts` declares `module '*.vue'` as `DefineComponent<{}, {}, any>`,
erasing cross-component prop types, so it would have to be deleted for vue-tsc to add any
cross-component value.

**Calibration — don't oversell it.** Against the bugs actually found during this migration:

- *Would* have caught: `import Vue from 'vue'` / `Vue.component()` in
  `xml-viewer/TreeItem.vue` + `TreeView.vue`; the missing `vue-good-table` package in
  `table.vue` (TS2307).
- *Would not* have caught: the 17 dead `beforeDestroy` hooks (Vue's component-options type is
  permissive — precisely why a custom `i18n: {…}` option compiles); the reactive-Proxy
  `postMessage`/`structuredClone` failures (types are compatible, it fails at runtime); the
  `table.vue` card collapse (CSS).

**If revisited**, get `tsc --noEmit` to zero first, *then* add `vue-tsc` as a non-blocking
`pnpm typecheck` script — not a CI gate. But see the next section: that cleanup is blocked
on plugin restoration.

Reproduce the numbers:

```bash
node_modules/.bin/tsc --noEmit 2>&1 | grep -cE "error TS"              # 85 (was 148)
grep -rl 'template lang="pug"' src --include=*.vue | wc -l             # 87
grep -rl "<template" src --include=*.vue | wc -l                       # 89
```

### The tsc backlog — wait for the plugins

An attempt to clear the backlog was **deliberately stopped**: most of what's left lives in
files belonging to plugins that haven't been restored, so it can't be fixed properly yet.

**Done (kept):** `src/layers/GeojsonOffsetLayer.ts` used to deep-import
`@/../node_modules/@deck.gl/layers/src/geojson-layer/sub-layer-map` for one internal helper.
deck.gl ships its TypeScript *source*, so that single import made `tsc` load and check the
whole deck.gl layers source tree — **63 of the original 148 errors were in node_modules**.
The helper is now vendored verbatim in `src/layers/deckgl-forward-props.ts` (MIT, ~28 lines).
148 → 85, node_modules errors → 0, build verified. An ambient `declare module` for that path
does *not* work — the `@/*` path mapping resolves it to a real file first, so the source
still gets loaded. Vendoring is the only clean fix.

**Blocked on plugin restoration.** Three packages are imported but **not installed and not in
`package.json`**: `@luma.gl/core`, `@luma.gl/shadertools`, `@visx/scale`. The files importing
them (`src/layers/flowmap/*`, `src/layers/moving-icons/*`, `src/layers/PathTraceLayer.ts`,
`src/components/ColorMapSelector/*`) are orphans of the removed flowmap / vehicle-animation /
matrix plugins — they can't build today, and `pnpm build` only passes because nothing
reachable imports them. Adding `declare module` shims would silence tsc while leaving them
unbuildable. Re-add the real dependencies with their plugins instead.

**Do not bump `@types/react` on its own.** `react` is `^18.3.1` while `@types/react` is
`^16.9.49` (pnpm warns about this). Upgrading types to 18 made things *worse* — 84 → 98 —
because the React-16-era `.tsx` bridge files then fail on `ReactNode`/`children` variance,
and there are three `@types/react` copies in the tree (16, 18, 19) which is what produces
`TS2786 'Icon' cannot be used as a JSX component`. Of those `.tsx` files only `Selector.tsx`
is actually imported by any component; `Btn`, `ColorMapSelector`, `ScaleOption` and
`MdGraphicEqRotated` are unreferenced. Fix this together with the matrix/h5web plugin, with a
`pnpm.overrides` pin for `@types/react`.

**Then the genuinely fixable core:** `src/js/DeckMap.ts` alone has 30 (27 × TS2339 — mostly
undeclared class fields like `_map` and props such as `screenshotFilename` missing from
`DeckProps`), plus `shapefile-to-geojson.ts` (6), `HTTPFileSystem.ts` (4), and small counts in
`util.ts` and `sqlite-map/`.

## Verifying a change

Dev server must be running, then:

```bash
node scripts/smoke-check.mjs /            # or any route(s)
BASE=http://localhost:5199 node scripts/smoke-check.mjs /embed /runconfig/x
```

Non-zero exit on any console error / uncaught page error; screenshots land in
`$SHOT_DIR` (default `/tmp/simwrapper-shots`). Use this per-plugin-route while migrating.
(This helper is currently untracked — commit it if you want it permanent, or fold it into
`tests/e2e/`.)

**Always look at the screenshot, not just the exit code.** A dashboard can exit clean while
every card renders "Unknown panel type" (that just means the panel is still commented out
in `_allPanels.ts`), and a chart can be blank with its error text tucked inside a card.

⚠️ **`pnpm build` does not compile an unreferenced `.vue` file.** If a restored component
isn't imported by anything (not in `_allPanels.ts`, not in `pluginRegistry.ts`, not imported
by a sibling), the bundler never touches it — a broken template or a Vue 2 leftover there
produces a perfectly green build. `src/plugins/sqlite-map/SqliteMapComponent.vue` is in that
state; `tests/unit/sqlite-map.test.ts` mounts it purely so *something* compiles it. Do the
same for any component you migrate but can't yet render.

### Getting real data in front of a panel

Test data is **not** in this repo. The `e2e-tests` filesystem points at
`http://localhost:8000`, served from the SVN checkout at
`/Users/billy/public-svn/shared/simwrapper-testdata` (the committed `baseURL` is the remote
`svn.vsp.tu-berlin.de` URL; `src/fileSystemConfig.ts` has a deliberate uncommitted local
override). Browse it at `/e2e-tests/<folder>`.

Useful folders: `charts/` (many CSVs + plotly dashboards), `tiles/`, `plotly/`, `vega-charts/`,
`sankey/`, `table/`.

⚠️ **Don't try to use `public/data` (the `files` filesystem) in dev.** Directory listings
come from fetching the folder URL and parsing the returned HTML, but Vite's SPA fallback
returns the app's `index.html` for any extensionless URL, so every folder looks empty.
This costs an hour if you don't know it. Use the `:8000` server instead.

### e2e tests

Specs added for the re-migrated panels/plugins, all green on chromium + firefox + webkit:

- `tests/e2e/dash-panels.spec.ts` — `bar`/`area`/`line`/`scatter`/`bubble` (7 tests). Drives
  the **"Panels" tab** of `e2e-tests/charts`.
- `tests/e2e/tiles.spec.ts` — the `tile` panel (5 tests): both dataset forms, icon
  resolution (local asset vs font-awesome), and link/non-clickable states. Drives
  `e2e-tests/tiles`.
- `tests/e2e/gridmap-lifecycle.spec.ts` — the `gridmap` panel (3 tests): console-clean on
  both fixtures plus teardown. The two pre-existing scenario specs (`gridmap-noise`,
  `gridmap-xmas-2025`) pass **unmodified** after the migration, but they only assert on
  `window.__testdata__` values — they never look at the console or at unmount, which is
  exactly where this plugin's Vue 3 problems were. Both console tests are needed: the
  `allTimes` prop bug only appears on the **lausitz** fixture, because that is the only one
  that mounts the time widgets.
  ⚠️ Console filters must be **case-insensitive**. Chromium says `GPU stall … ReadPixels`;
  firefox says `WEBGL_debug_renderer_info is deprecated` (from luma.gl). A `/WebGL/` filter
  matches the first and misses the second, so the spec passed on chromium and failed on
  firefox — use `/…/i`.
- `tests/e2e/aggregate-od.spec.ts` — the `aggregate` panel **and** the plugin route
  (11 tests). Restored from `aggregate-od.BROKEN.ts`, whose three data-count assertions
  (23 centroids / 390 spider links / 23 zone polygons) were correct all along — it was
  only broken while the plugin was removed. `video-player.BROKEN.ts` is now the last
  `.BROKEN.ts`, and that one is unfixable here (see Loose ends). The last three tests
  cover the **time-bin indexing bug** below and need
  `agg-od/dashboard-1.yaml` + `one-row.csv`.

The first two **depend on fixtures that live outside git** (see Loose ends), so they fail on
a machine without that testdata.

Useful selectors: `.dash-card-headers` (card titles), `.dash-card-frame` (scope per card),
`.plotly-plot` (one per chart), `.error-text` (card errors — assert `toHaveCount(0)`),
`.legendtext`, `.xtitle`/`.ytitle`, `.tile` / `.tile-title` / `.tile-value` /
`.tile-image`.

When adding specs, mutation-check them: break the fixture on purpose and confirm the test
actually fails. Counting `.plotly-plot` elements passes just as happily on an empty chart.

#### Testing an Oruga control, and three things that fooled a spec

Worked out while writing `aggregate-od.spec.ts`; every one of these produced a **passing**
test that guarded nothing, and each is now recorded as a comment in the spec next to the
assertion it explains.

- ⚠️ **`page.goto()` cannot test `beforeUnmount`.** A goto throws away the whole JS
  context, so `expect(window.__testdata__).toBeUndefined()` passes identically whether the
  teardown hook ran or was renamed to the silently-dead `beforeDestroy` (trap #2) —
  verified by mutation. **Unmount tests must navigate by clicking**, same conclusion
  `folder-navigation.spec.ts` reached for a different reason. The header back arrow is
  `.btn-header-back` (`LayoutManager.onBack`), which swaps the panel component in place.
- **Leaked `window` listeners are directly assertable.** An `addInitScript` that wraps
  `window.addEventListener`/`removeEventListener` and tallies `keyup`/`keydown` catches a
  missing `removeKeyListeners()`. Compare against a **baseline taken on the folder view**,
  not against zero — other components add their own.
- **A pixel diff proves less than it looks like.** "Destinations redraws the map" still
  passes with the `updateCentroidLabels()` call deleted, because the sibling
  `convertRegionColors()` also repaints. Where a control maps 1:1 to one maplibre layer
  (`showCentroids` → circle layer, `showCentroidLabels` → symbol layer) the diff is exact;
  where it doesn't, say so and lean on a DOM assertion (here the `is-link`/`is-active`
  classes) for the precise part.
- Oruga's slider renders its **`formatter` output into `.tooltip-content` even with
  `:tooltip="false"`**, which is what makes the `custom-formatter` → `formatter` rename
  testable at all: assert the *mapped* label (`'Alle'`, `'5000'`), never the raw index, or
  the test passes under the dead Buefy prop name. Theme-bulma class names for the rest:
  root `.slider`, `.slider-track`, `.slider-thumb` (one per thumb, so `toHaveCount(2)` is
  how you prove `:range` survived), `.slider-tick`, and `input.check` for `o-checkbox`.
  Note `.lower-left .slider:nth-of-type(1)` matches **nothing** — `nth-of-type` counts all
  sibling `div`s, and `.subheading` labels are interleaved. Use Playwright's `.nth()`.
- Firefox floods the console from maplibre's own tile upload (`WebGL warning: texImage:
  Alpha-premult and y-flip are deprecated`), and once 32 pile up adds `After reporting 32,
  no further warnings will be reported for this WebGL context`. The cap is only reached
  under parallel load, so a filter that misses it produces a spec that passes alone and
  fails in a full run. `/GPU stall|WebGL|externalized for browser/` covers all of it, and
  a mutation check (dropping `unreactive()` from the CSV worker's `postMessage`) confirms
  the test still has teeth with that filter in place.

---

## Vue 3 traps that bite at runtime

These compile clean, lint clean, and pass type checks. They only fail in a browser. Every
one of them was found by rendering a real dashboard, not by reading code.

### 1. A reactive Proxy cannot be `structuredClone`d

This is the highest-value thing to know. In Vue 2, `props` and `data` were plain objects
with getter/setter instrumentation. In Vue 3 they are **Proxies**, and the structured clone
algorithm throws `DataCloneError` on a Proxy. Anything that clones an object across a
boundary breaks:

- **`worker.postMessage(...)`** — panels pass their `config` **prop** straight through to
  `DashboardDataManager.getDataset()`, which posts it to a `DataFetcher` worker.
  Symptom: `Failed to execute 'postMessage' on 'Worker': #<Object> could not be cloned.`
  and the chart silently never loads.
- **Third-party libs that clone their input** — `vegaEmbed(el, spec)` clones the spec
  internally. Symptom: `DataCloneError` surfaced in the card's error box, blank chart.

**Fix already in place:** `unreactive()` in `src/js/util.ts`. It recurses only into plain
objects and arrays, returning anything else untouched — **this matters**:
`FileSystemConfig.handle` is a real `FileSystemAPIHandle`, and a naive deep-copy would
silently break Chrome local-folder access. Currently applied to the four `postMessage`
payloads in `DashboardDataManager.ts`, the three in `TopSheet.vue`, the one in
`XmlViewer.vue`, and the two in `xy-hexagons/XyHexagons.vue`.

**Wrap every new `worker.postMessage()` in it.** This has now bitten five separate places
(dashboard datasets, vega, topsheet, xml-viewer, xy-hexagons); assume it will bite the next
worker too. Note the symptom varies: xy-hexagons didn't error visibly, it just **hung
forever** — both e2e tests sat at the 2-minute timeout, and passed in ~15s once wrapped.
Only `postMessage` from the *main thread* is affected; a `postMessage` inside a `.worker.ts`
(worker → main) carries no proxies and needs nothing.
Note the payload doesn't have to be a `config` prop — `XmlViewer.vue` posted a
`FileSystemConfig` pulled straight from `$store.state.svnProjects`, which is just as
proxied. Anything reachable from props *or* store state counts.

For a library call, `toRaw()` at the call site is enough (see `VegaLite.vue`). Note
`toRaw()` only unwraps the top level — that's fine when the raw target holds raw values,
but if code has assigned a proxied value *into* the object (e.g.
`this.config.legendTitles = this.config.legendName`, which several panels do), you need the
recursive `unreactive()` approach instead.

### 2. `beforeDestroy` doesn't warn — it just never runs

The compat warning fires for `destroyed`, but a `beforeDestroy` hook is simply an unknown
option: no error, no warning, silently dead. The whole "migrated" core still had 14 of
them. All are now `beforeUnmount`; `grep -rn "beforeDestroy" src/` should stay empty.

Measured leaks before the fix (SPA nav, counting `window` listeners):

- `DashBoard.vue` — `resize` listeners grew 1 → 5 over 4 mount/unmount cycles.
- `PlotlyDiagram.vue` — 7 orphaned `resize` listeners per dashboard view; 0 after.

**Renaming the hook makes dead code live for the first time, so read the body first.**
`VuePlotly.vue` needed a `if (!this.myPlot) return` guard: `mounted()` awaits a tick, so
unmounting faster than that would newly throw a TypeError. Check for null-safety on
anything the hook touches before you flip it.

### 3. The dashboard calls your resizer before your data has loaded

`DashBoard.vue` registers a card's resizer as soon as the card emits `dimension-resizer`,
and may invoke it immediately — **before** an `async mounted()` has finished fetching.
`VegaLite.vue` hit this: `embedChart()` ran against the placeholder
`{title:'', description:''}` spec, and with `width/height: 'container'` vega emitted
`<svg> attribute width: Expected length, "NaN"` six times per load.

Guard any resize/redraw entry point with a "spec/data actually loaded" flag
(`isSpecLoaded` in `VegaLite.vue`), not just a truthiness check on the object.

### 4. `@import '@/styles.scss'` no longer forwards Sass variables

Under the module system a plugin doing `@import '@/styles.scss'` and then using
`$thumbnailHeight` (or any `_variables.scss` value) fails the **build** with
`Undefined variable` — the import no longer re-exports them. This is what
`@use '@/variables' as *;` is for. It bit `SankeyDiagram.vue`.

### 5. An absolutely-positioned panel collapses a content-sized card

`DashBoard.vue` gives `text` and `csv` cards **no default height** (`defaultHeight` is
`undefined` for those types) — they're meant to size to their content. `table.vue` styled
its root `position: absolute; inset: 0`, which contributes zero height, so the card
collapsed to ~21px and `overflow: hidden` clipped every row.

**The console was completely clean and `csv-table.spec.ts` passed the whole time** — it
counts `tbody tr` in the DOM, and the rows were there, just clipped. Only the screenshot
showed it. If a panel type has no `defaultHeight`, keep its root in normal flow.

### 6. Custom directives: every hook was renamed, and `vnode.context` is gone

Like `beforeDestroy`, a Vue 2 directive hook name is simply an unknown key in Vue 3 — no
warning, the directive just never runs. `text.vue`'s `v-markdown-links` had two problems:

| Vue 2 | Vue 3 |
|---|---|
| `bind` | `beforeMount` |
| `inserted` | `mounted` |
| `update` / `componentUpdated` | `updated` |
| `unbind` | `unmounted` |

And **`vnode.context` was removed** — the component instance is now `binding.instance`:

```ts
// Vue 2                              // Vue 3
vnode.context.$route.path             binding.instance.$route.path
const mythis = vnode.context          const mythis = binding.instance
```

`grep -rn "inserted(\|unbind(\|componentUpdated(\|vnode.context" src/` should stay empty.

### 7. deck.gl throws a Proxy-invariant TypeError on reactive layer data

Trap #1's sibling, and it does **not** involve `structuredClone`. deck.gl calls
`Object.freeze()` on a layer's props. A frozen property is non-writable and
non-configurable, and the JS spec then *requires* a Proxy `get` to return the target's
actual value — a Vue reactive proxy returns a wrapped one instead, so the engine throws:

```
deck: matching of SolidPolygonLayer({id: 'background-layer-…-fill'}): 'get' on proxy:
property 'data' is a read-only and non-configurable data property on the proxy target
but the proxy did not return its actual value
deck: initialization of SolidPolygonLayer(…): deck.gl: assertion failed.
```

The precise mechanism matters, because it dictates where the fix goes. Vue's proxy `get`
returns `reactive(value)` for object values. If the raw value is already raw, `reactive()`
hands back *the same object* and the invariant is satisfied; if not, it returns a wrapper and
the engine throws. So the throw needs **both** a proxy in the path **and** a non-raw value
behind the frozen property.

**Where the fix goes — two rules, and the obvious one is wrong.**

1. **`markRaw` the deck overlay.** `deckOverlay: null` sitting in `data()` means
   `new MapboxOverlay(...)` becomes reactive, and deck's layer-matching then reads
   `layer.props.data` straight through Vue's proxy. Fixed in
   `shape-file/DeckMapComponent.vue` and `carrier-viewer/MapComponent.vue`. This is the
   robust, whole-class fix: it takes every layer out of the proxy path at once, instead of
   chasing each individual `data:` value.
2. **`markRaw` the big arrays you hand deck.gl** — the `features` inside
   `js/BackgroundLayers.ts`, and `this.boundaries` in `ShapeFile.vue`. This also removes a
   proxy hop per coordinate read on 100k-feature networks, which is the real reason to do it.

⚠️ **Do *not* `markRaw` the `BackgroundLayers` instance itself.** That was tried first and it
silently breaks background layers: `initialLoad()` is async and signals completion by
reassigning its internal `bgLayers` map (`this.bgLayers = { ...this.bgLayers }` — that line
exists purely as a reactivity trigger). Marking the instance raw severs the dependency, so
the consumer's `layers` computed never re-runs and **the layers load but never appear**. The
console stays clean and the map looks plausible — you only catch it by noticing the polygons
are missing. `grep -rn "new BackgroundLayers" src/` should show **no** `markRaw`.

Three things make this expensive to find:

- **It usually fires on layer *update*, not first paint.** The word "matching" in the message
  is deck's layer-diffing phase. A route smoke-check that loads and screenshots exits
  **clean**; the throw needs a second render pass, so you only see it after interacting
  (clicking a tab, dragging a slider) or re-rendering. It *can* hit on load when a layer is
  rebuilt during startup — `shape-file`'s `linksLayer` did.
- **It needs a fixture that actually has the relevant data.** `e2e-tests/carriers` and
  `maps/networks/viz-map-bglayers.yaml` have `backgroundLayers:` blocks, which is why it
  surfaced there and not on the `aequilibrae` / `xy-hexagons` / other `viz-map-*` fixtures,
  whose configs have none. Those were latent, not safe.
- **The layer id in the message names the symptom, not the cause.** `SolidPolygonLayer(…-fill)`
  pointed at background layers; `LineOffsetLayer({id: 'linksLayer'})` pointed at a computed
  building fresh plain arrays. Both were the same root cause — a reactive overlay.

Anything else that freezes or seals its input is a candidate. Prefer `markRaw` for objects
handed to a rendering library; use `unreactive()` only for clone-across-a-boundary cases. And
prefer marking the *leaf data* raw over marking a *stateful container* raw — containers often
carry the reactivity some consumer depends on.

### 8. A trailing `;` in a style *value* now warns — and drags i18n noise in with it

`:style='{"background": urlThumbnail}'` where the value ends in `;`
(`"url('assets/thumbnail.jpg') no-repeat;"`) makes Vue 3 log:

```
[Vue warn]: Unexpected semicolon at the end of 'background' style value: '…no-repeat;'
```

Harmless on its own, but **it cascades**: to build the "found in component" trace, Vue walks
the component instance, and reading `$i18n.formatter` / `$i18n.preserveDirectiveContent`
trips vue-i18n's legacy deprecation *getters*, which each log their own warning:

```
[intlify] Not supported 'formatter'.
[intlify] Not supported 'preserveDirectiveContent'.
```

So three warnings × every re-render. Chasing the intlify pair directly is a dead end — they
have nothing to do with the component's `i18n` option, and they vanish the moment the style
warning is fixed. **If you see `[intlify] Not supported …`, look for another Vue warning
firing next to it first.** `XyHexagons.vue` carried the same trailing-semicolon string (never
bound to a style, so it stayed silent); both are now cleaned up. Only *JS strings* bound via
`:style` are affected — `grep -rn "no-repeat;\"" src/` should stay empty, while a
`background: … no-repeat;` inside a `<style>` block is ordinary CSS and perfectly fine.

### Not bugs — don't chase these

- **Plotly reverses legend order for stacked traces.** A stacked `area` chart legends as
  `[simulated, mean]`, not `[mean, simulated]`. Write order-independent assertions.
- `vue/no-mutating-props` on `this.config.legendTitles = this.config.legendName`
  (`bar`/`area`/`line`) — pre-existing, and nested prop mutation behaves the same in Vue 3.
- Headless-Chrome `GPU stall due to ReadPixels` / `willReadFrequently` from Plotly WebGL,
  and vega's `input spec uses Vega-Lite v5, but current version is v6.4.2` (that one is the
  **fixture's** `$schema`, not our code). All benign; `smoke-check.mjs` counts warnings as
  failures, so it will flag them.

---

## The plugin architecture (where to re-enable things)

Two dynamic-component registries, both already using `defineAsyncComponent`:

1. **Viz plugins** — `src/plugins/pluginRegistry.ts`
   - A `plugins[]` array; **every entry is currently commented out**.
   - Each entry: `{ kebabName, filePatterns[], component: defineAsyncComponent(() => import('./<plugin>/<Comp>.vue')) }`.
   - `src/App.vue` (~lines 55–58) iterates the array, fills `pluginComponents[kebabName]`,
     and `store.commit('registerPlugin', p)` → populates `store.state.visualizationTypes`
     (a reactive `Map`). File→plugin matching tests `filePatterns` (micromatch) against
     filenames in `FolderBrowser.vue` / `LeftSplitFolderPanel.vue`.
   - Consumers render via `<component :is="...">` (LayoutManager, EmbedView, FolderBrowser…).

2. **Dashboard chart panels** — `src/dash-panels/_allPanels.ts`
   - `panelLookup: { [type]: defineAsyncComponent(...) }`. Only **`bar`** and **`pie`** are
     active; ~30 others commented out. `DashBoard.vue` resolves `panelLookup[card.type]`.

**To re-enable a plugin/panel:** restore its `.vue` file(s) from the pre-migration state,
migrate that file per the checklist below, then uncomment its registry entry and smoke-test
its route/dashboard.

---

## Per-plugin migration checklist (Vue 2 → 3)

Most core components needed almost none of this (the codebase was already `defineComponent`
+ Options API), but **plugin code is older and will hit more of these**:

- **Global API**: `import Vue from 'vue'` has no default export in Vue 3.
  - `Vue.set(obj,k,v)` → `obj[k] = v` (reactivity is automatic).
  - `Vue.delete` → `delete obj[k]`.
  - `Vue.component('x', {...})` (used for recursion) → `defineComponent({ name:'x', ... })`.
    **Hit for real** in `xml-viewer/TreeItem.vue` + `TreeView.vue`. The `name` is load-bearing:
    Vue 2 got self-reference from the *global* registration, so in Vue 3 a recursive template
    tag (`tree-item` inside `TreeItem.vue`) resolves only via `name: 'TreeItem'`. Drop the
    `name` and the tree silently renders one level deep.
  - `Vue.extend({...})` → `defineComponent({...})`.
  - `import { AsyncComponent } from 'vue'` — **removed**; use `Component` or
    `ReturnType<typeof defineAsyncComponent>`.
- **Templates**:
  - `.sync` → `v-model:foo` (e.g. Buefy sidebar `:open.sync` → Oruga `v-model:active`).
  - old `slot="name"` → `template(#name)` (pug).
  - `.native` event modifier → removed (drop it; listeners are transparent).
  - filters `{{ x | f }}` — **removed**; call a method/computed. (None in core; watch in plugins.)
  - `functional: true` / `<template functional>` — rework as normal components.
- **Custom v-model component**: prop `value` + `$emit('input')` →
  prop `modelValue` + `$emit('update:modelValue')` (done for `EditableField.vue` — copy that
  pattern).
- **Event bus** (`new Vue()` used with `$on/$off/$once`) — removed in Vue 3. None in core;
  if a plugin uses one, replace with mitt or props/emits.
- **i18n**: keep the component-local `i18n: { messages: { en, de } }` option and `$t()` —
  they work in Legacy mode. Do **not** convert plugins to `useI18n`/Composition.
- **SCSS**: in a component `<style lang="scss">`, use `@use '@/variables' as *;` (as the
  first line) to access shared Sass variables — **not** `@import '@/styles.scss'` (deprecated,
  and it re-emits the whole global theme). The global theme CSS + library CSS are loaded once
  in `main.ts`. CSS custom properties (`var(--x)`) are global and need no import at all.
- **Lifecycle**: `beforeDestroy` → `beforeUnmount`, `destroyed` → `unmounted`.
  `beforeDestroy` is **silently dead**, not merely deprecated — and renaming it runs that
  code for the first time, so check the body for null-safety first. See
  [trap #2](#2-beforedestroy-doesnt-warn--it-just-never-runs). All of core is done.
- **Anything crossing a worker or clone boundary** — if the component hands its `config`
  prop (or store state) to a worker or to a library that clones, de-proxy it first. See
  [trap #1](#1-a-reactive-proxy-cannot-be-structuredcloned).
- **Custom directives** (`directives: { … }`): every hook name changed and `vnode.context`
  is gone. Silently dead if missed — see
  [trap #6](#6-custom-directives-every-hook-was-renamed-and-vnodecontext-is-gone).
- **`this.` in template expressions** — `v-for="x in this.foo"` / `:class="this.bar"` worked
  in Vue 2; drop the `this.` (hit in `table.vue` and `tile.vue`).
- **Async `mounted()` + the dashboard resizer** — guard redraw entry points with a
  "loaded" flag. See [trap #3](#3-the-dashboard-calls-your-resizer-before-your-data-has-loaded).
- **React interop** (h5web / matrix viewer): the `createRoot` mount path was removed with
  the plugins. The `.tsx` bridge components (`Selector`, `ColorMapSelector`, `ScaleSelector`)
  compile but aren't exercised. Re-verify the Vue↔React mount timing when that plugin returns.

### Buefy → Oruga reference (what was done in core)

| Buefy | Oruga | Notes |
|---|---|---|
| `b-input/button/select/field/checkbox/slider/sidebar` | `o-*` | tag rename |
| `size="is-small"` | `size="small"` | drop the `is-` |
| button/field `type="is-primary"` | `variant="primary"` | color moves to `variant`; native `type="text/number/..."` stays |
| `type="is-x is-outlined"` | `variant="x"` + `outlined` | |
| `b-navbar` / `b-navbar-item` | native Bulma `nav.navbar` markup | Oruga has no navbar |
| `b-menu-list` | Bulma `p.menu-label` (or `o-menu`) | |
| `vue-js-toggle-button` | `o-switch` | package is uninstalled — see note below |
| Buefy slider `:duration` / `:dotSize` | *(drop them)* | not Oruga props; they'd fall through as DOM attrs |
| slider option `size:'is-small'` | `'small'` | |
| slider `custom-formatter` | **`formatter`** | renamed. Silently ignored under the old name — see below |
| slider range via array `v-model` | **`:range="true"`** *plus* the array | Oruga needs the explicit prop; Buefy inferred it |
| `b-slider` `type="is-link"` | `variant="link"` | |
| `b-switch` | `o-switch` | drop-in |
| `b-radio-button` (button-group radio) | **no equivalent** | Oruga's `o-radio` is a plain radio input — see below |
| `b-dropdown` / `b-dropdown-item` | `o-dropdown` / `o-dropdown-item` + **`selectable`** + **`keepOpen`** | both implicit in Buefy, both default `false` in Oruga — see below |
| `b-dropdown` `max-height="250"` | `:maxHeight="250"` | camelCase; also `:mobile-modal` → `:mobileModal` |
| `b-dropdown` `aria-role="list"` | *(drop it)* | Buefy invention, not a real ARIA attribute |
| `b-progress` | **no equivalent** | use native Bulma `progress.progress.is-*` with `:value` + `max` |

⚠️ **`o-dropdown` needs `selectable` and `keepOpen` spelled out.** This is the nastiest of the
renames because it is *entirely* silent: the dropdown renders, opens, lists its items, and
clicking one does nothing at all — `selectable` defaults to `false` in Oruga 0.13, while
Buefy selected implicitly. `keepOpen` likewise defaults `false`, so a `multiple` dropdown
would close after each pick. Both are now explicit in `shape-file/ShapeFile.vue`'s filter
dropdown, and **`tests/unit/oruga-dropdown.test.ts` locks the behavior in** — including a
mutation check asserting that *without* `selectable` nothing gets selected, so the day Oruga
changes its default, that test fails and tells you the prop is no longer load-bearing.
Verified against `node_modules/@oruga-ui/oruga-next/dist/index.js`, not from docs.

⚠️ **A class you put on an Oruga control may land on the inner element, not the root** —
and which one differs per component, so check the DOM before writing a selector against it.
`o-select.form-select` and `o-checkbox.tight` both forward the class to the inner
`<select>` / `<input>`, so `select.form-select` and `input.tight` are the correct
selectors and `.form-select select` matches nothing. The **root** meanwhile gets the theme's
class: `@oruga-ui/theme-bulma` gives `o-checkbox` a `rootClass` of `"checkbox control"` and
`o-select` `"select control"`. That matters for CSS ported from Buefy — `flowmap/Flowmap.vue`
had a `.b-checkbox.checkbox:not(.button):hover` rule that is now
`.checkbox.control:not(.button):hover`. Read the truth out of
`node_modules/@oruga-ui/theme-bulma/dist/theme.js` rather than guessing the class names.

⚠️ **Oruga has no progress bar.** `b-progress` became a native Bulma
`progress.progress.load-progress.is-success(:value="loadProgress" max="100")`. Buefy's
`:rounded="false"` has no equivalent either — Bulma rounds progress bars by default, so
`.load-progress` carries an explicit `border-radius: 0`.

⚠️ **`custom-formatter` → `formatter` is silent.** Under the Buefy name the prop just falls
through as a DOM attribute, so the slider label shows the raw index instead of the mapped
value and nothing warns. This was already live in core's `ScaleSlider.vue` (migrated earlier,
its `custom-formatter` never ran); now fixed there and used correctly in
`aggregate-od/LineFilterSlider.vue`. The full Oruga prop list is the authority —
`node_modules/@oruga-ui/oruga-next/dist/types/components/slider/props.d.ts`.

⚠️ **Oruga has no `b-radio-button`.** Buefy's `b-radio-button` rendered a *button group* that
behaved like tabs. Oruga ships `o-radio` (a radio input) and no button-group variant, so the
markup has to be rebuilt — same situation as `b-navbar`. `carrier-viewer/CarrierViewer.vue`
does it as a Bulma `.buttons.has-addons` group of `o-button`s with
`:variant="activeTab==='x' ? 'warning' : ''"` and `@click`, which reproduces Buefy's
selected-button highlight.

`aggregate-od`'s Origins/Destinations pair is the same shape, but **don't reach for a Bulma
variant for the "active" fill**. It used `is-link`, whose `#485fc7` is a vivid indigo that
reads as a hyperlink and was by far the brightest thing on the panel. It now carries a plain
`.dir-button` + `:class="{selected: …}"` and fills from a theme variable:

```scss
--bgSelected: #{$matsimBlue};   // one value works in both colour schemes
--textSelected: #ffffff;
```

`$matsimBlue` (`#4b7cc4`) is dark enough against the white panel and light enough against dark
mode's `#2a3c4f` one, so it needs no `.dark-mode` counterpart. `.selected` is unused by both
Bulma and theme-bulma (verified, 0 hits), so there is no collision. Note Bulma 1.x buttons are
built on HSL channel variables (`--bulma-button-h/s/l`), so a direct
`background-color`/`border-color`/`color` rule is the simple override — scoped CSS adds
`[data-v-…]`, which outranks `.button` and even `.button:hover`.

If you restyle this, `tests/e2e/aggregate-od.spec.ts` asserts `toHaveClass(/\bselected\b/)` on
the pair — that is the exact half of that test, since its canvas diff can't isolate which
handler ran.

⚠️ **`vue-js-toggle-button` is not installed and not in `package.json`.** A restored file
importing it will fail to build. `XyHexagons.vue` imported *and registered* `ToggleButton`
without ever using it in the template, so the fix was simply deleting both lines — check
whether a leftover import is actually used before reaching for `o-switch`.

**Oruga registration** (already done in `main.ts`): the default plugin registers **no**
components unless you pass them — `createOruga(config, OrugaComponentPlugins)` then
`app.use(oruga)`. All the global stylesheets are imported in **`main.ts`**, not `App.vue` —
resets/libs first, then `bulma/css/bulma.min.css`, `@oruga-ui/theme-bulma/style.css`,
`@oruga-ui/theme-oruga/style.css`, and finally `@/styles.scss` so the app's own rules win.

### Two themes at once: sliders are on theme-oruga, everything else on theme-bulma

**Oruga resolves class names from the runtime config, not from whichever stylesheet is
loaded.** This is the single most important thing to know about theming here, and it is
counter-intuitive: adding a theme's stylesheet does **nothing** on its own. Proven — importing
`@oruga-ui/theme-oruga` while `bulmaConfig` was fully active left three routes screenshotting
**byte-identical**, because its rules target `o-*` names and `bulmaConfig` was assigning
Bulma's (`checkbox control`, `check`, `button`, `slider`).

**`@oruga-ui/theme-oruga` ships no config at all** — its `dist/theme.js` is an 83-byte banner
comment. It styles Oruga's *built-in default* class names (`o-slider`, `o-slider__track`,
`o-slider__fill`, `o-slider__thumb`, `o-slider__tick`, `--small`/`--medium`/`--large` and the
variant modifiers — verified against the string literals in `oruga-next/dist/index.js`). So
adopting it means **removing** config, not adding any.

Because the config is **per-component**, that is scopable. `main.ts` destructures the `slider`
key out so it is genuinely absent, and sliders alone fall back to Oruga's defaults:

```ts
const { slider: _bulmaSlider, ...bulmaConfigNoSlider } = bulmaConfig
createOruga({ ...bulmaConfigNoSlider, iconPack: 'mdi' }, OrugaComponentPlugins)
```

Why: theme-bulma *does* ship slider CSS (Bulma itself has none — 0 hits — so the theme
supplies it), but at `size="small"` it renders a ~5 px hairline with no visible fill. The
Oruga theme gives a real track, thumb and coloured fill.

Two overrides in `src/styles.scss`, both needed because theme-oruga declares its variables
**on `.o-slider` itself**, which beats anything you put on `:root`:

- `--oruga-primary: #{$appTag}` — the stock value is `#445e00`, a dark olive. This one
  variable drives the slider's **fill and its tick marks**. (It lives in `:root`, which works
  because *that* one is only declared in theme-oruga's own `:root, :host` block.)
- `.o-slider--small { --oruga-slider-thumb-size: 1rem }` — 0.75 rem gave a 10.5 px thumb,
  a fiddly grab target. theme-oruga derives **`track-height = thumb-size / 2`**, so this
  single variable scales both proportionally (now 14 px thumb / 7 px track). Scoped to the
  `--small` step, which is what every slider in the app uses, so `size="medium"`/`"large"`
  keep their own proportions.

Consequences worth knowing:

- ⚠️ **A local `.slider` class on an `o-slider` gets double-styled**, because theme-bulma's
  `.slider` rules are still loaded for every other component. `carrier-viewer/CarrierViewer.vue`
  and `components/PlaybackControls.vue` both did this; renamed to `.carrier-slider` /
  `.playback-slider`. `.time-slider`, `.ui-slider` and `.pie-slider` never collided.
- ⚠️ **A `padding` shorthand on an `o-slider` collapses it.** theme-oruga puts `padding: 1em 0`
  on the root; `ScaleSlider.vue` and `LineFilterSlider.vue` had `padding: 0 1rem`, which zeroed
  the vertical padding — `aggregate-od`'s `.lower-left` overlay shrank 110 px → 54 px and the
  sliders collided with their own labels. Both now use `padding-left`/`padding-right`.
- **theme-oruga has no `link` variant** (only `primary secondary info success warning danger`);
  `CarrierViewer.vue`'s `variant="link"` became `primary`.
- ⚠️ **Don't use Oruga's `indicator` to show a slider's value.** It renders the value *inside*
  the thumb — 14 px text in a 10.5 px thumb, spilling onto the track. (theme-oruga tries to
  size it via `--oruga-tooltip-content-font-size`, which our still-Bulma-classed tooltip
  ignores, since only the `slider` key was dropped.) The Buefy original had the same problem in
  reverse: a thumb big enough to hold the number.

  **The pattern to copy is `xy-hexagons`'**: caption and value on one line above the track,
  value right-aligned, `:tooltip="false"` and no `indicator`. `ScaleSlider.vue` and
  `LineFilterSlider.vue` now take an optional `label` prop and render
  `.slider-label > .slider-name + .slider-value` themselves. Two things that matter:
  - **`font-variant-numeric: tabular-nums`** on the value. These run `1 → 5000` and `0 → Alle`;
    without fixed digit widths the number jitters while you drag.
  - **The child must own the value.** `AggregateOd`'s `currentScale`/`lineFilter` only update
    through `bounceScaleSlider`/`bounceLineFilter`, debounced 50 ms and **250 ms**, so a
    parent-rendered value visibly trails the thumb. The child's `sliderValue` is synchronous.
- Specs must use the new names: `.o-slider`, `.o-slider__track`. For the thumb prefer
  **`[role="slider"]`** — it is where `aria-valuenow` lives and it survives the next theme
  change. And read a slider's value from the visible `.slider-value`, **not**
  `.tooltip-content`: with `:tooltip="false"` Oruga still emits that element but it measures
  **0×0**, so the old assertion proved the `formatter` ran without proving anything was
  legible. Both mutation checks (formatter returning the raw index) still fail through the
  visible label.

Path traps: the package has **no `oruga.scss`**. The CSS entry is `./style.css` — the seemingly
obvious `@oruga-ui/theme-oruga/dist/theme.css` is **not in the exports map** and fails to
resolve. The Sass entry is `./style.scss`; a deep `dist/scss/...` specifier must **omit** the
extension (`.../dist/scss/theme`), because the pattern is
`"./dist/scss/*": "./dist/scss/*.scss"` — a trailing `.scss` becomes `theme.scss.scss` and
Rolldown fails with `failed to resolve import`. `theme-build.scss` is the same styles plus a
`@forward` of `utils/variables`, needed only to `@use ... with (...)` them from a `.scss` file.
Note `useVar()` emits `var(--oruga-x)` with **no fallback**, so any component you cherry-pick
also needs `utils/root`.

**Switching the whole app to theme-oruga is a much bigger job**: drop `bulmaConfig` entirely,
then deal with ~178 `is-*` Bulma classes in `src/`, the hand-built Bulma markup that has no
Oruga equivalent (navbar, `.buttons.has-addons` radio groups, `progress.progress`), and every
theme-bulma class selector the specs rely on (`input.check`, `select.form-select`,
`.checkbox.control`). `bulma.min.css` would still be needed for layout (columns, tiles, menu).

**Oruga events** (verified): `o-input`/`o-checkbox` emit **both** `input` and
`update:modelValue` (so `@input` handlers still fire); `o-select` emits **only**
`update:modelValue`; sliders use `v-model` + emit `change`. The Buefy slider option objects
still passed via `v-bind` in `ScaleSlider.vue`/`PlaybackControls.vue` compile but will want
Oruga-specific prop tuning when their plugins are re-enabled.

---

## Gotchas already fixed (don't re-trip these)

- **Full-height layout**: Vue 3 mounts *inside* `#app` (Vue 2 replaced it). Added
  `#app { height: 100% }` in `App.vue` so the `height:100%` chain reaches `#main-app`.
  Any new full-height root needs the parent to have height.
- **Worker `postMessage` de-proxying**: `unreactive()` in `src/js/util.ts` — see
  [trap #1](#1-a-reactive-proxy-cannot-be-structuredcloned). Reuse it, don't reinvent it,
  and don't "simplify" it to a `JSON.parse(JSON.stringify())` round-trip (kills
  `FileSystemAPIHandle`).
- **A swallowed `DataCloneError` looks like a hung spinner.** `TopSheet.vue` caught its
  worker failure and `console.log`'d it, so `smoke-check.mjs` reported the route *clean*
  while both cards span forever. That catch now uses `console.error`. If a panel hangs on
  its spinner with a clean console, read the `log`-level output before anything else.
- **`REACT_VIEW_HANDLES` doc comment** in `Globals.ts` now says `beforeUnmount()`; it used
  to tell plugin authors to clean up in a hook that never fires.
- **Router catch-all**: uses `path: '/:pathMatch(.*)'` (string). Do **not** use
  `/:pathMatch(.*)*` — the trailing `*` makes `params.pathMatch` an **array**, but the app
  calls `.startsWith`/`.substring` on it (`LeftSystemPanel.vue`, `SimRunner.vue`).
- **vue-i18n version**: pinned `^9`. Legacy mode is removed in **v12** — do not bump past
  v11 without migrating all `i18n` options to Composition API.

## Dependencies removed (re-add Vue 3 versions when a plugin needs them)

Removed because they had zero usage in the stripped core; plugins may need them back:

- ~~`vueperslides`~~ → **re-added as `^3.6.0`** for `slideshow.vue`. v3 is the Vue 3 line
  (`peerDependencies: { vue: ^3.2.0 }`); the existing imports needed no changes.
- `vue-virtual-scroll-list` → `vue3-virtual-scroll-list` or `vue-virtual-scroller`
- `vuedraggable` → `^4` (uses sortablejs)
- `vue-slide-bar` → no Vue 3 version; replace (e.g. `o-slider` or a maintained lib)

## Loose ends

- `tests/unit/tile.test.ts` fails to load, and **not** because of `tile.vue` (which is now
  restored and renders fine). `src/js/avro.js` is a 33-byte shim whose whole body is
  `export default avro` — a bare global supplied in the browser by
  `<script src="/src/js/avro-browserify.js">` in `index.html`. Vitest has no equivalent
  (no `setupFiles` are configured), so evaluating it throws `ReferenceError: avro is not
  defined`. The import chain is `tile.vue` → `DashboardDataManager` → `avro.js`. Fixing it
  means giving vitest a setup file that defines the global, or making `avro.js` a real
  module — not a Vue 3 issue.
- `tests/unit/table.test.js` now **runs** (table.vue is back) and **fails**, for two stale
  reasons unrelated to Vue 3: its `getDataset` mock returns a bare column map instead of
  `{ allRows: … }`, so `prepareData()` throws on `Object.entries(undefined)`; and it asserts
  `hideHeader === false` when `data()` initialises it to `undefined` and the code that used
  to set it is commented out. Fix the mock/expectations, don't "fix" the panel.
- `src/fileSystemConfig.ts` has a local-only change (e2e `baseURL` → `localhost:8000`),
  intentionally **not committed**.
- `pnpm lint` works again (Vue 3 preset) but reports ~94 pre-existing style nits
  (`prefer-const`, unused vars in workers); `--fix` handles most. When judging whether
  *your* change added a lint error, `git stash` and diff the counts — most files already
  have some.
- Fixtures added under `/Users/billy/public-svn/shared/simwrapper-testdata/` (**not** in
  git — they only exist on this machine):
  - `charts/dashboard-8-panels.yaml` — backs `tests/e2e/dash-panels.spec.ts`
  - `charts/dashboard-9-slideshow.yaml` — images via a relative `../logistics/*.png` path
  - `tiles/dashboard-10-tiles.yaml` + `tiles/tile-metrics.csv` — backs
    `tests/e2e/tiles.spec.ts`; both dataset forms (CSV and inline list)
  - `agg-od/dashboard-1.yaml` + `agg-od/one-row.csv` — the "One Row" tab, backing the three
    time-bin tests in `tests/e2e/aggregate-od.spec.ts`. One OD pair with a distinct value
    per time bin; see the indexing bug under "Gotchas already fixed" for why a
    single-row fixture is what caught it.

  Note `svn status` reports `shared/simwrapper-testdata/charts` as `?` — that whole tree is
  **unversioned** in the working copy (root is `/Users/billy/public-svn`), so these can't
  just be `svn commit`ed; the testdata needs adding first, or publishing another way.

  Adding a dashboard to `charts/` is safe because it's already a dashboard folder. Do
  **not** drop a `dashboard*.yaml` into `cottbus/`, `logistics/`, or `emissions/` — they're
  file-browser folders backing other specs, and a dashboard file flips their view mode and
  breaks those specs.
- ⚠️ **`pnpm build` produces a bundle that throws `ReferenceError: avro is not defined` at
  startup.** `index.html` loads the global via `<script src="/src/js/avro-browserify.js">`, but
  that tag is **absent from `dist/index.html`** and the file is not emitted into `dist/` —
  Vite doesn't process a `/src/...` script tag as an asset. Anything importing
  `DashboardDataManager` (most panels) dies on `vite preview`. Found while trying to compare
  dev vs. production timings; `pnpm dev` is unaffected, which is why it has gone unnoticed.
  Same root cause as the `tile.test.ts` vitest failure below — `src/js/avro.js` is a 33-byte
  shim over a global that only `index.html` supplies. Making `avro.js` a real module fixes
  the build, the preview and the unit test together.
- One `@import '@/styles.scss'` survives, in
  `src/components/ColorMapSelector/Btn.module.css`. It's a plain CSS module for the
  React/h5web bridge, not Sass — the `@use` rule doesn't apply. Left alone deliberately.
- `src/plugins/sqlite-map/viewstate-normalizer.ts` is dead — nothing imports it, and
  `SqliteMapComponent.vue` carries a comment saying it was removed. Delete it or wire it
  back up; left in place for now.
- `store.state.isFullScreen` is written (`VideoPlayer.vue`) but **never read** — the only
  consumer, `App.vue`'s `toggleFullScreen` watcher, is commented out at `App.vue:165`.
  Restore that watcher or drop the flag.
- `buildRouteFromUrl()` in `ImageView.vue` / `VideoPlayer.vue` reads `$route.params.project`,
  which the Vue 3 catch-all route no longer provides, so it logs and bails. It's only reached
  when `yamlConfig` is empty, which doesn't happen on the plugin path — left as-is.
- `tests/e2e/video-player.BROKEN.ts` is not collected (Playwright only matches
  `*.spec.ts`/`*.test.ts`) and asserts `readyState === 4` plus advancing `currentTime`, which
  bundled headless Chromium can't satisfy — it has no H.264 decoder. `canPlayType('video/mp4')`
  returns `"maybe"` and the frame stays black even though the mp4 serves fine. Video
  *playback* is not e2e-testable here; assert on the element and its `<source>` instead.
- **`carrier-viewer/DetailsPanel.vue` was deleted as dead code** during this round. Worth
  recording *how* that was established, because an unreferenced `.vue` is invisible to the
  build and "nothing imports it" alone doesn't prove a file is dead:
  - It read `carrier.$.id` — the xml2js nested-`$`-attributes shape. The plugin's parser
    (`parseXML` in `CarrierViewer.loadCarriers`) emits **flattened** attributes and sorts on
    `a.$id`, which `CarrierViewer.vue` uses throughout. So the panel was stale against its own
    data format and would have rendered `undefined` for every id even if mounted.
  - It declared **no `props`** and had no `mounted`/`created` and no loader, so its `carriers`
    array could never be populated by anyone — it was neither a presentational child nor a
    self-sufficient panel.
  - Its `collapsible-panel` accordion had been superseded by the flat carrier list + Oruga tab
    bar now inline in `CarrierViewer.vue`.

  Apply that same three-part test (stale data shape / no way to receive data / superseded UI)
  to the other orphans before migrating them — `sqlite-map/SqliteMapComponent.vue` is
  deliberately *not* in this category: it's a headless provider awaiting a consumer, and
  `aequilibrae-map` is now that consumer.
- **Pre-existing `shape-file` bugs found while verifying it — none are Vue 3 issues, all were
  confirmed against the restored pre-migration file and left alone deliberately:**
  - `ShapeFile.vue`'s `bgLayers` map is **never populated** — it is only ever assigned `{}` or
    spread onto itself. So `.bglayer-section` (`v-if="Object.keys(bgLayers).length"`) never
    renders, and with it the per-layer visibility checkboxes *and* the "3D buildings"
    checkbox. 3D buildings is still reachable from the ZoomButtons toggle, and background
    layers still draw (they go through the separate `backgroundLayers` instance), so the only
    loss is the toggles. Fix = mirror `vizDetails.backgroundLayers` into `bgLayers` on load.
  - A dataset added at runtime via **Add Data** never registers in `datasetKeyToFilename`
    (only the YAML `loadDatasets()` path writes it), so creating a filter on it throws
    `Can't add listener, no dataset named: <subfolder>/undefined`.
  - `Filters.vue` emits its column as `dataset@column`, but
    `handleUserCreatedNewFilter()` does `selection.split(':')`. The two halves disagree on the
    separator.
  - Net effect: the **filter dropdown in the config bar has no fixture coverage** — every
    `viz-map-*.yaml` in the testdata has `datasets: {}`, and the runtime path to create a
    filter is blocked by the two bugs above. That is why its Oruga conversion is covered by
    `tests/unit/oruga-dropdown.test.ts` instead of by a rendered route.
- `viz-configurator/Colors.vue` (`ColorsConfig`) and `Widths.vue` (`WidthConfig`) are
  imported and registered in `VizConfigurator.vue` but **no section name ever maps to them**:
  `getSections()` builds the component name from `ShapeFile.configuratorSections`, which only
  ever returns `fill-color/fill-height/line-color/line-width/circle-radius/layers/filters`.
  They are superseded by `FillColors.vue` / `LineWidths.vue` (and still take the older
  `vizConfiguration`+`datasets` props, without `vizDetails`/`subfolder`). Same three-part dead
  code test as `DetailsPanel.vue` below — deletion candidates.
- ⚠️ **"Background layers never appear" had a second, unrelated cause — and it was the real
  one.** `LayoutManager.buildLayoutFromURL()` reused the current panel verbatim whenever
  exactly one panel was on screen (`this.panels = [[this.panels[0][0]]]`), which is precisely
  the state you are in while looking at a folder. Clicking a viz file pushed the new route but
  left the previous view mounted. On `maps/networks` — whose folder view is `dashboard-1.yaml`,
  an avro network with **no** background layers — that looked exactly like "the map opened but
  its background layers are missing": the network links on screen were the *dashboard's*.
  A direct page load always worked, because `panels` starts empty and took the other branch,
  which is why this survived every `page.goto()`-style check. The panel is now replaced unless
  it is already that exact viz (same component/root/subfolder/yamlConfig). This code predates
  the Vue 3 migration (identical in `28452333`) — it is a long-standing bug that only became
  reachable for `area-map` when the plugin was re-enabled. Guarded by
  `tests/e2e/folder-navigation.spec.ts`, whose tests navigate **by clicking**; four of the five
  fail if the old branch is restored. Related: `onNavigate()` interpolated a
  trailing-slashed subfolder straight into the route, yielding `/maps/networks//viz-map.yaml`
  — harmless (direct loads of it work) but confusing; it now joins path segments properly.
- **Separately, background layers took ~13s to appear — that one was load ordering, not
  Vue 3.** `ShapeFile.vue` created its `BackgroundLayers` and awaited `initialLoad()` as the
  *last* statement of `mounted()`, after `loadBoundaries()` and `loadDatasets()`. On
  `maps/networks/viz-map-bglayers.yaml` (a 202,939-segment avro network) that starved them:
  `getFileBlob` of a **1.6 MB local** file measured 2.9 s and `arrayBuffer()` 3.5 s, which is
  only possible if the main thread is blocked. The layers did eventually paint, at 13.4 s and
  17.0 s. Now the instance is constructed and `initialLoad()` *started* before
  `loadBoundaries()`, with the promise awaited at the end (an error is captured and rethrown
  there, so it still reaches the same `catch`). Result: **2.8 s and 3.7 s**, and the
  background layers render while the network is still loading. The geopackage parse itself is
  only ~400 ms once it isn't competing.

  Worth recording how this was diagnosed, because the obvious suspects were all wrong: a CDP
  CPU profile over the load attributed **78.5 % to `(program)`** — native WASM (the
  geopackage's SQLite) plus WebGL for 200k line segments — while **every Vue reactivity frame
  combined came to ~1.2 %**. The `layers` / `lineLayers` computeds rebuild all 202,939
  segments in ~200 ms, so they were not the problem either. Don't assume a Vue 3 proxy cliff
  because something got slow; profile first. `scripts/` had a throwaway
  `Profiler.start`/`Profiler.stop` harness for this — worth rebuilding if it recurs.
- `maps/networks/viz-map-bglayers.yaml` logs three
  `Expected value to be of type number, but found null instead.` warnings. They come from
  **maplibre's own blob tile-worker** (confirmed via `console` message location) parsing
  basemap vector tiles, not from our layers — deck.gl `interleaved` layers never pass through
  that worker. Benign, viewport-dependent, ignore.
- ~~`aggregate-od` keeps 5 pre-existing lint errors~~ — **cleared.** Three `prefer-const` in
  `AggregateDatasetStreamer.worker.ts` (the three accumulator objects are mutated, never
  reassigned), plus the two `vue/no-reserved-keys`: `_mapExtentXYXY` → `mapExtentXYXY` with
  its `[180, 90, -180, -90]` seed moved into `data()`, and `_maximum` **deleted** — it was
  written once in `created()` and never read, so renaming it would have preserved nothing.
  That emptied `created()` entirely, so it's gone too (`data()` runs once per instance, same
  as `created()`, so the seed timing is unchanged).

  Worth knowing *why* this was only a lint error and not a live bug, since the `_` prefix
  looks like trap #2 material: Vue 3's `PublicInstanceProxyHandlers.get` resolves **any**
  own `data` key, prefix or not, so `this._maximum` worked fine inside methods. Only
  `initData`'s `exposeDataOnRenderContext` skips reserved prefixes, and the
  `must be accessed via $data` warning fires **only during render** — and neither key was
  ever touched from a template. Verified against
  `@vue+runtime-core@3.5.40/dist/runtime-core.cjs.js`, not from docs.
- `AggregateOd.updateSpiderLinks()` and `handleCentroidsForTimeOfDayChange()` now also call
  `updateTestData()`. Both replace their whole FeatureCollection, so the
  `window.__testdata__` hook kept pointing at the **pre-change** array — silently stale
  after any slider move, and a trap for the next spec author.
- ⚠️ **`aggregate-od` showed the wrong centroid totals for every time bin — fixed.** Three
  separate bugs, all from one wrong assumption (`headers` starts with a totals column — it
  does not; the worker slices off only the origin/destination columns, so `headers` lines up
  1:1 and 0-based with each row's `values`). **All three predate the migration** — identical
  in `master` — and all three are in `calculateCentroidValuesForZone` /
  `getDailyDataSummary`:

  1. `const hour = this.headers.indexOf(timePeriod) - 1` — every single-bin selection read
     the **previous** bin's marginal, and the *first* bin read index `-1` →
     `Math.round(undefined)` → `NaN`. Because the centroid filter is
     `dailyFrom + dailyTo > 0` and `NaN > 0` is false, the centroids **silently vanished**
     rather than showing `NaN`.
  2. Same `- 1` on both bounds of the range ("Duration") branch, so a span always came up
     one bin short at each end.
  3. `getDailyDataSummary` sized and filled its marginals `Array(headers.length - 1)`, so
     the **final** bin was never accumulated at all — not merely misread, absent.

  A fourth, adjacent bug surfaced only because the test drove the slider *back*:
  `handleCentroidsForTimeOfDayChange` overwrites `feature.properties.dailyFrom/dailyTo`
  with the selected bin's values (`convertRegionColors` needs that to shade zones by the
  current selection), but the `TOTAL_MSG` branch **read those same properties** — so
  returning to "All >>" showed the last-selected bin's value forever. It now reads
  `marginals.rowTotal`/`colTotal`, the same source `buildCentroids()` uses.

  **Why it went unnoticed for so long, and the lesson for the next fixture:** on the
  23-zone `dashboard-0.yaml` every zone has substantial traffic in every bin, so a label
  showing the neighbouring bin looks entirely plausible — there is nothing to compare it
  against. `agg-od/dashboard-1.yaml` + `one-row.csv` (a **single** OD pair, `030405` →
  `110101`, with a distinct value per bin: `10 80 140 120 110 130 20`) makes the origin's
  "from" marginal exactly that bin's value, so the off-by-one is unmissable. When a
  plugin aggregates, add a fixture with **one** of whatever it aggregates.

  `tests/e2e/aggregate-od.spec.ts` guards all four, and each fix was mutation-checked
  individually. The third test is fixture-independent: on the 23-zone dashboard the seven
  per-bin totals must **sum** to the "All >>" total, which cannot hold while bug 3 is
  present. That invariant is also the cheapest way to re-verify this by hand.
- **`gridmap` pre-existing issues, all confirmed identical on `master` and left alone:**
  - `components/TimeSliderV2.vue` **mutates its props** in `mounted()` —
    `this.allTimes.unshift(0)` and `this.range[0] = 0`. Two `vue/no-mutating-props` errors,
    present before the prop-type fix too (checked by stashing it). Would compound across
    remounts, but on the current fixtures the component only mounts transiently and is not
    in the final DOM, so nothing observable. Fixing it properly means restructuring, not a
    one-liner.
  - `deck: Attribute instanceFillColors is normalized` — deck.gl warns when a normalized
    attribute is handed an array whose type differs from its default and `normalized` isn't
    stated. `colorData` is a `Uint8Array`, `instanceFillColors` is `unorm8`
    (→ `Uint8ClampedArray`). **Fixed** with an explicit `normalized: true` on the
    `getFillColor` descriptor, which is what deck already assumed — nothing changes visually.
  - `BackgroundLayers` is constructed and `initialLoad()` **awaited as the last statement of
    `mounted()`**, after the heavy avro parse — the same shape as the ShapeFile ordering
    problem that cost 13 s there. Not changed here (it isn't a Vue 3 issue and these fixtures
    have no `backgroundLayers:` block), but it is the same fix if it ever matters.
  - There is **no `viz-grid*.y?(a)ml` fixture** anywhere in the testdata, so the plugin's own
    route is registered but unexercised; both fixtures go through the dashboard-panel path.
- Fixtures used to verify this round (all already present, none added):
  `e2e-tests/aequilibrae` (`dashboard-combined-demo.yaml`, 7 `aequilibrae` panels),
  `e2e-tests/agg-od` (`dashboard-0.yaml`, the `aggregate` panel) plus
  `e2e-tests/emissions/viz-od-drt.yaml` (the same plugin's own route — note it sets
  `scaleFactor: 0.001`, which multiplies line width at `AggregateOd.vue:610`/`1282`, so its
  spider links render as near-invisible hairlines and its legend reads `~ 1 trips`. That is
  the fixture, identical on `master`, **not** a regression), and
  `e2e-tests/carriers/viz-carriers.yaml` (the `carriers` plugin), and for `area-map`:
  `maps/hamburg` (shapefile + a `.dbf` to add as a dataset), `maps/geopackage` (gpkg, and the
  only fixture exposing all seven configurator sections), `maps/networks` (avro + the
  `viz-map-bglayers.yaml` background-layer case) and `networks/viz-map-berlin-v6.4.yaml`
  (xml.gz network). `maps/hamburg` and `maps/networks` each also carry a `dashboard-1.yaml`
  that exercises the same plugin through the dashboard-panel path.

## Next up

`pnpm build` is green and every enabled panel/plugin has been rendered except `pie` (no
fixture uses it). No restored file is left unmigrated: the only `beforeDestroy` left in `src/`
is the word inside an explanatory comment in `VideoPlayer.vue`, and no Buefy `b-*` tag or
`@import '@/styles.scss'` survives in any enabled plugin.

To bring back a panel/plugin: restore its file(s), work the checklist, uncomment its
registry entry, and render it against a `:8000` fixture.

**Rendering it once is not enough — interact with it.** Trap #7 exits clean on load and only
throws on the second render pass, so after the screenshot looks right, click the plugin's
tabs/toggles and drag its sliders with the console still attached. That is also the only way
to check a migrated Oruga control actually works: a `b-slider` → `o-slider` rename screenshots
identically whether or not `range` / `formatter` survived the port.

⚠️ **Don't uncomment a registry entry before its file exists.** A missing target makes
`_allPanels.ts` return a 500, which cascades into
`Failed to fetch dynamically imported module: LayoutManager.vue` and a completely blank app
— the symptom points at LayoutManager, not at the panel. `pnpm dev` survives until
something imports it; `pnpm build` fails outright.

### Third-party packages: check for a Vue 3 fork first

`table.vue` imported `vue-good-table` (Vue 2, not installed) while the Vue 3 fork
`vue-good-table-next@^0.2` was already in `package.json`. Both the component and its
stylesheet had to be repointed, and the CSS path differs — dist CSS, not source SCSS:

```ts
import 'vue-good-table/src/styles/style.scss'   →  'vue-good-table-next/dist/vue-good-table-next.css'
import { VueGoodTable } from 'vue-good-table'   →  from 'vue-good-table-next'
```

The API was otherwise drop-in (`:columns` / `:rows` / `:pagination-options` unchanged).
Check `package.json` before assuming a dependency is missing.

Fixtures: `e2e-tests/table`, `e2e-tests/sankey`, `e2e-tests/calculation-table`.
