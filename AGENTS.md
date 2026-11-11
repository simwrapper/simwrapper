# AGENTS.md

Guidance for AI coding agents working in the SimWrapper repository.

SimWrapper is a browser-based visualization platform for transport simulation output (MATSim,
ActivitySim, and others). It reads files directly from a server (or a local folder via the
companion Python app) and renders dashboards, maps and charts. It is a Vue 3 single-page app
built with Vite; heavy map work is done with deck.gl on top of MapLibre.

Other agent notes in this repo — read them before working in those folders:

- `python/AGENTS.md` — the `simwrapper` Python package (always use `uv`; never scan
  `python/simwrapper/static/`).
- `wasm/matsim-event-streamer/CLAUDE.md` — the Rust/WASM event-file decompressor.

## Stack at a glance

- **Vue 3, Options API** (not the Composition API). Most `.vue` templates are **Pug**
  (`<template lang="pug">`); see `docs/PUG.md`. Match the style of the file you're editing.
- **vue-i18n in Legacy mode**: components keep the `i18n: { messages }` option.
- **UI:** Oruga (`@oruga-ui/oruga-next`) with the Bulma theme. Buefy is gone.
- **State:** Vuex 4 (`src/store.ts`); routing: vue-router 4 (`src/router.ts`).
- **Maps:** MapLibre GL + deck.gl `MapboxOverlay` in interleaved mode.
- **Data:** duckdb-wasm, Apache Arrow, loaders.gl, avro, and heavy parsing in Web Workers
  (`src/workers/`, `*.worker.ts`), often talking through Comlink.
- **TypeScript 6, Vite 8, Vitest 4, Playwright.** Package manager is **pnpm** (version pinned in
  `package.json` `packageManager`). Never use npm or yarn to install.

## Repository layout

| Path                                     | What lives there                                                                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `src/plugins/<name>/`                    | Full-page visualizations. **Every plugin must be registered** in `src/plugins/pluginRegistry.ts` (kebab name + file patterns). |
| `src/dash-panels/`                       | Dashboard panel wrappers, registered in `src/dash-panels/_allPanels.ts`. Many reuse a plugin's components.                     |
| `src/layers/`                            | Custom deck.gl layers with hand-written/injected shaders (flowmap, moving-icons, offset/trace layers).                         |
| `src/js/`                                | Shared logic: `HTTPFileSystem.ts`, `DashboardDataManager.ts`, `duckdb.ts`, colors, coords, background layers.                  |
| `src/components/`, `src/layout-manager/` | Shared UI and the dashboard/layout shell.                                                                                      |
| `src/templates/`                         | Starting points for new work: `BlankPlugin.vue`, `BlankComponent.vue`, `BlankDeckMapComponent.vue`.                            |
| `src/fileSystemConfig.ts`                | Built-in data sources, including the hidden `e2e-tests` source.                                                                |
| `tests/unit/`                            | Vitest unit tests.                                                                                                             |
| `tests/e2e/`                             | Playwright specs, one per plugin/area. `*.HOLD` files are parked specs.                                                        |
| `wasm/`                                  | Rust crates built with `wasm-pack`; their `pkg/` output is committed.                                                          |
| `python/`                                | The `simwrapper` pip package that embeds the built app.                                                                        |
| `docs/website/`                          | User documentation site (separate pnpm project).                                                                               |
| `patches/`                               | pnpm patches applied to dependencies (see `pnpm-workspace.yaml`).                                                              |

Generated output (do not read, search or edit): `dist/`, `python/simwrapper/static/`,
`wasm/*/target/`, `node_modules/`, `playwright-report/`, `test-results/`.

## Commands

```bash
pnpm install
pnpm dev                     # dev server on http://localhost:5173
pnpm build
pnpm lint                    # eslint src
pnpm typecheck               # vue-tsc --noEmit (see "Type checking" below)
pnpm test:run                # vitest unit tests
npx playwright test          # e2e (starts the dev server itself if it isn't running)
npx playwright test xy-time --project=chromium     # one spec, one browser
node scripts/smoke-check.mjs <route> [<route>...]  # load routes, report console errors, screenshot
```

### Type checking

`pnpm typecheck` has a large **pre-existing** error baseline (roughly 370–380 errors). It is
not part of CI yet. Do not expect a clean run and do not "fix" unrelated errors in passing. To
verify your change, compare the error count and the errors in the files you touched before and
after. Always use `pnpm typecheck`; `npx vue-tsc` can pull an incompatible TypeScript and crash.

## Testing

### End-to-end tests

- Fixtures live **outside git**, under the `e2e-tests` file system in `src/fileSystemConfig.ts`.
  It points at the public SVN test-data URL. For a faster local mirror you can temporarily
  point it at `http://localhost:8000` (serve the mirror with `scripts/mini-file-server.py`,
  which supports Range requests). **Don't commit that switch.**
- Specs run on chromium and firefox (webkit too, in the full config). Run both chromium and
  firefox for anything rendering-related; they differ.
- Most specs install a `watchConsole()` helper that fails on any console warning or error,
  filtered through a per-spec `isNoise` regex. Only add a pattern to `isNoise` for browser- or
  driver-level chatter that isn't caused by our code (GPU stalls, Firefox engine notices).
  Never add one to hide an app warning.
- **The `/webgl/i` noise filter also hides real GL errors** (e.g. `GL_INVALID_VALUE`). For
  rendering changes, also run `scripts/smoke-check.mjs` or watch the unfiltered console.
- Plugins expose a `window.__testdata__` hook with CPU-side facts (row counts, breakpoints…).
  It cannot tell you whether the GPU drew anything correctly. For shader or color work, add a
  **pixel check** (see `tests/e2e/xy-time.spec.ts`, "points are drawn in more than one legend
  color"). When screenshotting a map canvas, mask DOM overlays such as legends; they are
  captured too.
- Unmount and teardown must be driven by clicking in the UI, not `page.goto()`, which
  discards the JS context and makes a dead hook look clean.
- Some tests are timing-sensitive under full parallel load. If a test fails in the full run,
  rerun it alone (`--repeat-each=3`) and check whether it also fails on `main` before
  blaming your change.

### Unit tests

Vitest, in `tests/unit/`. Prefer unit tests for pure data logic (colors/widths, plan parsing,
table formatting) and e2e tests for anything that needs a browser or WebGL.

## Vue 3 pitfalls (all have caused real bugs here)

Vue 3 reactivity wraps objects in Proxies. Several libraries used here break when that
happens:

1. **MapLibre maps and deck overlays must be `markRaw`:**
   `this.mymap = markRaw(new maplibregl.Map(...))`, `markRaw(new MapboxOverlay(...))`.
   A reactive map hands deck.gl a proxy, after which identity checks inside deck fail
   silently. Symptoms look like heisenbugs.
2. **deck.gl freezes layer props.** Reading them back through a Vue proxy throws a
   proxy-invariant `TypeError`, and only on the second render pass. Keep large data arrays and
   layer inputs non-reactive (`markRaw`, or plain fields outside `data()`).
3. **Never store duckdb/Arrow row objects in reactive state.** `.toArray()` rows are exotic
   Proxies and `reactive()` throws mid-render. Copy them first with `{ ...row.toJSON() }`, and
   convert `bigint` to `Number`.
4. **Never store a `Comlink.wrap()` remote as a reactive property**, even `markRaw`'d. Keep it
   in a `markRaw({ ... })` holder object or a non-reactive field.
5. **Worker payloads must be plain data.** Structured-clone rejects reactive proxies
   (`DataCloneError`). Pass them through `unreactive()` from `src/js/util.ts` (a deep `toRaw`
   copy) before `postMessage` or Comlink calls.
6. Child components that re-emit `click` need `emits: ['click']`. Otherwise the listener
   falls through and fires twice.

## deck.gl, luma.gl and custom shaders

- **deck.gl is pinned to exactly `9.3.12` and luma.gl to `9.3.6`** (`@luma.gl/core`,
  `engine` and `shadertools` are direct dependencies). Do not move to deck 9.4 without an
  explicit request; each minor version changed shader internals. After any dependency change,
  check that the lockfile resolves to a **single** version of `@deck.gl/core` and
  `@luma.gl/core`.
- Custom `ShaderModule`s (flowmap layers, moving-icons, `PathTraceLayer`, `LineOffsetLayer`,
  the `DrtRequestLayer`s, xy-time `ScatterplotColorBinsLayer`) must follow luma 9.3's rules:
  1. Declare the GLSL block as `layout(std140) uniform <moduleName>Uniforms { ... } <moduleName>;`.
     Without `std140`, luma logs a warning on every page, which fails the e2e console checks.
  2. List the `uniformTypes` keys **in the same order** as the block fields. luma throws at
     shader assembly if they differ.
  3. Declare arrays as `[type, length]`, e.g. `colors: ['vec4<f32>', 21]`. A bare type uploads
     only element 0.
  4. Set uniforms with `model.shaderInputs.setProps({ <moduleName>: {...} })`, never
     `setUniforms`.
- **Vendored copies of deck internals must be re-diffed when deck is upgraded:**

  - `src/layers/moving-icons/` is a fork of deck's `IconLayer` and `IconManager`.
  - `src/layers/line-offset-shader-full.vert` is a copy of the `LineLayer` vertex shader.
  - `src/layers/deckgl-forward-props.ts` and `GeojsonOffsetLayer._renderLineLayers()` mirror
    `GeoJsonLayer` internals.

  The upstream sources are in `node_modules/@deck.gl/*/src`; comparing them across versions
  is the fastest way to audit an upgrade.

- **Interleaved overlay layer order:** 2D layers use `beforeId: 'water'` so water and labels
  draw over them; extruded/3D layers render on top with no `beforeId`. Use separate layer ids
  for the 2D and 3D variants, because toggling `extruded` in place scrambles color
  transitions. deck 9.3 groups overlay layers by `beforeId` automatically. Do not use
  `_renderLayersInGroups` (removed in 9.3) or `MaskExtension` water clipping (tried and
  rejected for looks).
- Shader regressions usually leave the console clean. Verify visually or with pixel checks
  (see Testing).

## Dependency rules

- **`@duckdb/duckdb-wasm` stays at `1.29.0`.** Later versions break HTTP Range requests and
  download whole files, which breaks parquet-backed views like the plans viewer. Don't propose
  upgrading it as a performance fix.
- deck.gl / luma.gl pins: see above.
- Dependency fixes live in `patches/` via `pnpm patch`. If you bump a patched package, regenerate
  or drop its patch deliberately.
- Imports from a package should match a direct dependency in `package.json`. Transitive
  packages can disappear in a lockfile refresh.

## Working conventions

- **Logging:** log once per high-level operation plus error paths. No per-chunk or
  per-iteration `console.log` in streaming code except while actively debugging, and remove
  it when done. Stray console warnings also fail e2e specs.
- **New plugin:** start from `src/templates/BlankPlugin.vue`, register it in `pluginRegistry.ts`,
  add a dash panel in `_allPanels.ts` if it should embed in dashboards, and add an e2e spec
  with a `watchConsole()` guard and a `__testdata__` hook.
- **Forked plugins** (`vehicle-animation`, `xmas-kelheim`, `imoger`) share near-identical files
  such as `DrtRequestLayer.ts`. A fix in one usually applies to all three.
- Keep changes scoped. Don't reformat unrelated code (Prettier is configured; format only what
  you touch).
- Git: the main branch is `main`; work on feature branches. Commit only when asked.
