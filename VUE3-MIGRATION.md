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
| dash-panels | `aequilibrae` `aggregate` `area` `bar` `bubble` `carriers` `csv` `heatmap` `hexagons` `line` `pie` `plotly` `sankey` `scatter` `slideshow` `text` `tile` `vega` `video` `xml` | all except `pie` |
| plugins | `aeq-reader` `aggregate` `carriers` `hexagons` `image-view` `plotly` `sankey` `summary-table` `vega-lite` `video-player` `xml` | all eleven |

Still removed: `gridmap` `transit` `vehicles` panels, and the remaining
full-screen map plugins (`layers` `area-map` `flowmap` `links` `matrix` `xytime`
`events` `logistics` `plans` `shape-file` …).

`shape-file/DeckMapComponent.vue` **is** migrated and live — `aequilibrae-map` renders through
it — but `shape-file/ShapeFile.vue` (the plugin proper) is still unregistered and still has a
`beforeDestroy`. Migrating that file is the remaining shape-file work.

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

Two specs were added for the re-migrated panels, both green on chromium + firefox + webkit:

- `tests/e2e/dash-panels.spec.ts` — `bar`/`area`/`line`/`scatter`/`bubble` (7 tests). Drives
  the **"Panels" tab** of `e2e-tests/charts`.
- `tests/e2e/tiles.spec.ts` — the `tile` panel (5 tests): both dataset forms, icon
  resolution (local asset vs font-awesome), and link/non-clickable states. Drives
  `e2e-tests/tiles`.

**Both depend on fixtures that live outside git** (see Loose ends), so they fail on a
machine without that testdata.

Useful selectors: `.dash-card-headers` (card titles), `.dash-card-frame` (scope per card),
`.plotly-plot` (one per chart), `.error-text` (card errors — assert `toHaveCount(0)`),
`.legendtext`, `.xtitle`/`.ytitle`, `.tile` / `.tile-title` / `.tile-value` /
`.tile-image`.

When adding specs, mutation-check them: break the fixture on purpose and confirm the test
actually fails. Counting `.plotly-plot` elements passes just as happily on an empty chart.

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

Hit for real in `carrier-viewer`: `this.backgroundLayers = new BackgroundLayers({…})` put the
instance in `data()`, so Vue proxied it, and `BackgroundLayers.layers()` handed
`data: layerDetails.features` (now proxied) to deck.gl.

**Fix: `markRaw()` the instance** — `this.backgroundLayers = markRaw(new BackgroundLayers(…))`.
Applied in `carrier-viewer/CarrierViewer.vue`, `aequilibrae-map/AequilibraEMapComponent.vue`,
and `xy-hexagons/XyHexagons.vue`. `grep -rn "new BackgroundLayers" src/` should show
`markRaw` at every site; **`shape-file/ShapeFile.vue` has two sites still unfixed** (it
doesn't build yet anyway).

Two things make this expensive to find:

- **It only fires on layer *update*, not first paint.** The word "matching" in the message is
  deck's layer-diffing phase. A route smoke-check that loads and screenshots exits **clean**;
  the throw needs a second render pass, so you only see it after interacting (clicking a tab,
  dragging a slider) or re-rendering.
- **It needs a fixture that actually has background layers.** `e2e-tests/carriers` has a
  `backgroundLayers:` block, which is why it surfaced there and not on the `aequilibrae` or
  `xy-hexagons` fixtures, whose configs have none. Those two were latent, not safe.

Anything else that freezes or seals its input is a candidate. Prefer `markRaw` for objects
handed to a rendering library; use `unreactive()` only for clone-across-a-boundary cases.

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
selected-button highlight. `aggregate-od`'s Origins/Destinations pair uses the same shape with
Bulma's `is-link`/`is-active` classes.

⚠️ **`vue-js-toggle-button` is not installed and not in `package.json`.** A restored file
importing it will fail to build. `XyHexagons.vue` imported *and registered* `ToggleButton`
without ever using it in the template, so the fix was simply deleting both lines — check
whether a leftover import is actually used before reaching for `o-switch`.

**Oruga registration** (already done in `main.ts`): the default plugin registers **no**
components unless you pass them —
`createOruga({ ...bulmaConfig, iconPack:'mdi' }, OrugaComponentPlugins)` then `app.use(oruga)`.
Oruga CSS is imported in `App.vue` (`@oruga-ui/theme-bulma/dist/theme.css`).

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

  Note `svn status` reports `shared/simwrapper-testdata/charts` as `?` — that whole tree is
  **unversioned** in the working copy (root is `/Users/billy/public-svn`), so these can't
  just be `svn commit`ed; the testdata needs adding first, or publishing another way.

  Adding a dashboard to `charts/` is safe because it's already a dashboard folder. Do
  **not** drop a `dashboard*.yaml` into `cottbus/`, `logistics/`, or `emissions/` — they're
  file-browser folders backing other specs, and a dashboard file flips their view mode and
  breaks those specs.
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
- `aggregate-od` keeps 5 pre-existing lint errors: three `prefer-const` in
  `AggregateDatasetStreamer.worker.ts` and two `vue/no-reserved-keys` for the `_mapExtentXYXY`
  / `_maximum` data keys. Not introduced by the migration; the `no-reserved-keys` pair needs a
  rename across the file.
- Fixtures used to verify this round (all already present, none added):
  `e2e-tests/aequilibrae` (`dashboard-combined-demo.yaml`, 7 `aequilibrae` panels),
  `e2e-tests/agg-od` (`dashboard-0.yaml`, the `aggregate` panel), and
  `e2e-tests/carriers/viz-carriers.yaml` (the `carriers` plugin — the only fixture with a
  `backgroundLayers:` block, which is what exposed trap #7).

## Next up

`pnpm build` is green and every enabled panel/plugin has been rendered except `pie` (no
fixture uses it). The one restored file **not** yet migrated is
`shape-file/ShapeFile.vue` (still has `beforeDestroy`, an `@import '@/styles.scss'`, and two
un-`markRaw`'d `new BackgroundLayers` sites) — its `DeckMapComponent.vue` sibling *is* done.

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
