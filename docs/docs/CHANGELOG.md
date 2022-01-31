---
id: changelog
title: Change Log
---

# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

## [1.6.0](https://github.com/simwrapper/simwrapper/compare/v1.5.0...v1.6.0) (2022-01-31)


### Features

* DBF files now supported in most places where CSVs are allowed ([3866379](https://github.com/simwrapper/simwrapper/commit/38663796e78936dd5c72e36aa43d76119ae4e645))
* Enable drag/drop to load datasets (CSV,.GZ) ([a4bd4ce](https://github.com/simwrapper/simwrapper/commit/a4bd4ce2c276dbb0f88902bfdabbe450ea912521))
* **links:** Categorical link data can be used for colors ([2e00fa5](https://github.com/simwrapper/simwrapper/commit/2e00fa50c2e77220ead36e29e9860d65d5958ce3))
* **links:** Export YAML config with full color & width settings ([2fd285e](https://github.com/simwrapper/simwrapper/commit/2fd285eedad8af6cb2fcb1ad368b37f239ba7749))
* **links:** Load detailed color and width settings from YAML ([fa02c9e](https://github.com/simwrapper/simwrapper/commit/fa02c9e2078354adeeef047893bc020528b606d0))
* New configuration panel for colors & widths ([84c7c35](https://github.com/simwrapper/simwrapper/commit/84c7c35bddfb7deac841d818bcf0640dab631b33)), closes [#98](https://github.com/simwrapper/simwrapper/issues/98)


### Bug Fixes

* area map should center on geojson data center instead of San Francisco ([37b5430](https://github.com/simwrapper/simwrapper/commit/37b54307f251dbbf8651c1774f5996b7f42af9df))
* create-geojson.network fails because Python 3.9 flipped coordinate x/y for projections ([4bc9e9d](https://github.com/simwrapper/simwrapper/commit/4bc9e9d47113e54afba1327157997ed78d7c640b))
* Dark mode map zoom/center buttons should follow map theme ([2858907](https://github.com/simwrapper/simwrapper/commit/2858907c381408f588dd0c1b5ee54defb17037d9))
* Fix single-panel navigation; URL of YAML file should load the viz ([ba79c79](https://github.com/simwrapper/simwrapper/commit/ba79c79e6939d793d5c885ffd700208bad7215a2))
* **links:** diff mode better, but still WIP ([f19b954](https://github.com/simwrapper/simwrapper/commit/f19b954bf512b264f49fe0f87532d63da2c20468))
* **links:** Diff tooltip not showing difference values ([74b4c79](https://github.com/simwrapper/simwrapper/commit/74b4c794f3e79b86a45d693a007043b4ff14e153))
* **links:** Firefox crashes when large network.xml.gz files are read ([5453401](https://github.com/simwrapper/simwrapper/commit/545340157eba660046adca22f3fcafdcd92d042f))
* **links:** Link widths could show wrong data if multiple datafiles loaded ([10b234b](https://github.com/simwrapper/simwrapper/commit/10b234bc22b3de247fd35f07e614a0005d0f7309))
* Zoom buttons & drawing tool aren't drawn nicely together (z-indexes) ([8b299ba](https://github.com/simwrapper/simwrapper/commit/8b299ba2ae9de2ba137575f75d52f7bdcc2691f3))

## [1.5.0](https://github.com/simwrapper/simwrapper/compare/v1.4.0...v1.5.0) (2021-12-22)


### Features

* **aggregate-od:** Aggregate O/D Spider diagrams learned to be in dashboards ([8485d45](https://github.com/simwrapper/simwrapper/commit/8485d45debf569c906554a76a80ff06dbb4362d4))
* **carriers:** Carrier viewer learned how to be in a dashboard ([7e32b23](https://github.com/simwrapper/simwrapper/commit/7e32b23c0bbf68f438cb9ac85614297eb169dd1a))
* **vega:** Vega-Lite charts now embeddable in dashboards ([b365bd0](https://github.com/simwrapper/simwrapper/commit/b365bd04098e074f7a2aa046c4dda6874d02eebd))


### Bug Fixes

* **carriers:** Carriers viewer should be available when output_carriers file exists ([86ce42a](https://github.com/simwrapper/simwrapper/commit/86ce42ad2baff406f8e81a05f74a7337866eedca))
* **links:** Strange sadface appears instead of background map on Chrome ([c502ae8](https://github.com/simwrapper/simwrapper/commit/c502ae8fa32fe7efeb07ab8b01d13c6efc19eff3))
* **sankey:** Sankey has resize problems ([e38f5cd](https://github.com/simwrapper/simwrapper/commit/e38f5cd5245f0f35ce0da5d4963f5b3f84d4e626)), closes [#82](https://github.com/simwrapper/simwrapper/issues/82)
* **transit:** Improve transit dashboard layout ([7935a54](https://github.com/simwrapper/simwrapper/commit/7935a542c6bccd91f284ef0f563e1531d310eb97))
* Zoom buttons are missing from area-maps ([9bb4bea](https://github.com/simwrapper/simwrapper/commit/9bb4beab87a97a7507a7931c3f92549ae6f32b2b))

## [1.4.0](https://github.com/simwrapper/simwrapper/compare/v1.3.3...v1.4.0) (2021-12-20)


### Features

* Add interactive map scale to all maps, near the zoom buttons ([8021fce](https://github.com/simwrapper/simwrapper/commit/8021fce4c18862d89cf95b94be19b113c1b54254)), closes [#69](https://github.com/simwrapper/simwrapper/issues/69)
* **dash:** Project-level dashboards, vizes, and calculation topsheets ([b920e63](https://github.com/simwrapper/simwrapper/commit/b920e634bb68277b2b6fbb4accf2fa812c8702aa))
* **hexagons:** XY Hexagon viz learned how to embed in dashboards ([3b495ae](https://github.com/simwrapper/simwrapper/commit/3b495ae5bbadb5d4445bff3a7989427bd39dd1e9))
* Maps learned zoom-in, zoom-on, and reset-view on all views ([244c4f5](https://github.com/simwrapper/simwrapper/commit/244c4f5b7d4474bef09a8908a652f52ef97d2968)), closes [#70](https://github.com/simwrapper/simwrapper/issues/70)
* **sankey:** Sankey learned "only show changes" and can be embedded in dashboards ([a96c190](https://github.com/simwrapper/simwrapper/commit/a96c1901a75ffdc42ed424ad6d4d64362ed38309))
* **transit:** add transit viz to dashboards too' ([12eb429](https://github.com/simwrapper/simwrapper/commit/12eb429246d7f5208a7965b81ad2c6fef16e30a2))


### Bug Fixes

* **charts:** Better filenames for exported charts ([d97041d](https://github.com/simwrapper/simwrapper/commit/d97041da790bb48f9b0890480a844fe5fd7c8a8e)), closes [#79](https://github.com/simwrapper/simwrapper/issues/79)
* Hovering on a map shows a weird card title when it shouldn't ([d10c1ce](https://github.com/simwrapper/simwrapper/commit/d10c1ce68c3833b32e66439e715dd1660025ffcf))
* Re-enable some error messages when files can't be loaded ([a709f7c](https://github.com/simwrapper/simwrapper/commit/a709f7cf371744b234c8cdd7897d1aeb0ad50729))
* Transit viewer asks nicely for coordinate system EPSG now ([4c601bc](https://github.com/simwrapper/simwrapper/commit/4c601bcc9f985121fc8abf5351dbe39a1735ae48))

### [1.3.3](https://github.com/simwrapper/simwrapper/compare/v1.3.2...v1.3.3) (2021-12-14)


### Bug Fixes

* **charts:** bar/line charts now for standard matsim *stats.txt files ([aeb8fc9](https://github.com/simwrapper/simwrapper/commit/aeb8fc96f14f9646deaa7db86065dc25957d0a90))
* **links:** Time-slider and colorramp buttons don't work together. ([77a7965](https://github.com/simwrapper/simwrapper/commit/77a79652cbd5cc68e0b714f64978132eeb9b0995))
* **topsheet:** topsheets lost their user-entry fields and titles ([2312659](https://github.com/simwrapper/simwrapper/commit/23126594516b734c1f92b000e7061803a84e6aeb))

### [1.3.2](https://github.com/simwrapper/simwrapper/compare/v1.3.1...v1.3.2) (2021-12-13)


### Bug Fixes

* **xy:** Ask for coordinate system if loading output_trips ([c1b5e91](https://github.com/simwrapper/simwrapper/commit/c1b5e91645da62380fc8134c119bd17fb10e6057))

## [1.3.1](https://github.com/simwrapper/simwrapper/compare/v1.3.0...v1.3.1) (2021-12-09)


### Features

* **heatmap:** Heatmap learned flipAxes true/false, to flip the heatmap :-) ([5aa3c07](https://github.com/simwrapper/simwrapper/commit/5aa3c0789fa7118f532832cefea072e7c88bc656))

## [1.3.0](https://github.com/simwrapper/simwrapper/compare/v1.1.0...v1.3.0) (2021-12-09)


### Features

* **dashboard:** Charts can zoom/unzoom fullscreen now ([2587521](https://github.com/simwrapper/simwrapper/commit/2587521053270a1b897c93ed4c12c2b65bda7ba2))
* Support multiple local servers on ports 8000-8500 ([8ca422f](https://github.com/simwrapper/simwrapper/commit/8ca422f4e262027bae5a87d8c3386fe6fb0bef33))


### Bug Fixes

* Fix [#71](https://github.com/simwrapper/simwrapper/issues/71), DrawingTool broke with big Vite merge ([9f23d79](https://github.com/simwrapper/simwrapper/commit/9f23d79d660e9955cbf9e6f3774c84d26fadf189))
* Fix dark/light mode watcher in dashboard charts ([1291ef7](https://github.com/simwrapper/simwrapper/commit/1291ef724861f7ee5e112176747f45cbe3e9f226))
* Plotly charts don't resize properly when switching dashboard tabs ([affccab](https://github.com/simwrapper/simwrapper/commit/affccab53759107d8256bad8db733078c88c77fc))
* **sankey:** handle commas,semicolons,tabs as separators ([8b2cacb](https://github.com/simwrapper/simwrapper/commit/8b2cacbf900e7c5113e463e82a93874c88526269))
* **sankey:** plot size on Chrome/Safari ([5a31fb0](https://github.com/simwrapper/simwrapper/commit/5a31fb038a092253c860a7d0aff9d953ed9827fd))
* **sankey:** Sankey text colors follow dark/light theme now ([5500a8d](https://github.com/simwrapper/simwrapper/commit/5500a8d91a815f9c6022d2c28e02147f526db1ac))
* useLastRow and ignoreColumns are leaking into other dashboard views ([1d690b2](https://github.com/simwrapper/simwrapper/commit/1d690b25fd868ac8acbad7892835128ea793df1e)), closes [#75](https://github.com/simwrapper/simwrapper/issues/75)
* video-player resizing bugs ([e480798](https://github.com/simwrapper/simwrapper/commit/e48079806acdcf30347be6719f2072dc13960b49))
* Vite: faster builds & fewer dependencies ([a4d92c0](https://github.com/simwrapper/simwrapper/commit/a4d92c0c7c9bbc7aa88770ff1ada75ae4e366b5d))

## [1.1.0](https://github.com/simwrapper/simwrapper/compare/v1.0.1...v1.1.0) (2021-11-24)


### Features

* New "heatmap" chart type ([c15b21f](https://github.com/simwrapper/simwrapper/commit/c15b21fdf2fbe711ca7ccddaae53a4c956c02cdd))


### Bug Fixes

* Back Button Bug ([#59](https://github.com/simwrapper/simwrapper/issues/59)) ([89d12d5](https://github.com/simwrapper/simwrapper/commit/89d12d50a1813d6dc265001f4a99b7b5ddc0b0db))

### [1.0.1](https://github.com/simwrapper/simwrapper/compare/v1.0.0...v1.0.1) (2021-11-08)

* Fix Stacked Bar Chart [edbe0a2](https://github.com/simwrapper/simwrapper/commit/edbe0a205a87fde1b23ab118d384804dec5c98e9))

## 1.0.0 (2021-11-03)

We are starting to use "semantic versioning" now, so we can track builds since our number of users is increasing.

Version numbers are MAJOR.MINOR.POINT where

- MAJOR: major new releases; breaking changes, etc
- MINOR: feature releases, new functionality
- POINT: bugfixes and internal improvements

This seems as good a time as any to stamp a "1.0.0" release. Woot!

### Features

* Color schemes ([3d19f36](https://github.com/simwrapper/simwrapper/commit/3d19f36ee96b6bfc475743ab68678f532d9b61a7))
* **carriers:** update carrier viewer for simwrapper ([4090e20](https://github.com/simwrapper/simwrapper/commit/4090e20e82846ee622c4ca8d77fb9ae0d4208744))
* **charts:** allow relative paths for dataset ([2350993](https://github.com/simwrapper/simwrapper/commit/235099307efb6370239e445454a426cd62d6e4fc))
* **dash:** Area charts ([d715ea5](https://github.com/simwrapper/simwrapper/commit/d715ea575865fd01ecabb14f25ae12b6ffe7f620))
* **dash:** Choro-CIRCLES plot on map! ([40b4b1c](https://github.com/simwrapper/simwrapper/commit/40b4b1ccdb395dd16df0e1c7350ff1a997d496c6))
* **dash:** Choropleth maps! ([fe43f09](https://github.com/simwrapper/simwrapper/commit/fe43f09d64cb337c1b5468e4472909b335b5d0bb))
* **dash:** fullscreen button on card headers ([e252f8e](https://github.com/simwrapper/simwrapper/commit/e252f8ecae07a24ac3cc433d951fef4fd4f6ae31))
* **dash:** Load any dashboard from /gist/123456789 ([5668974](https://github.com/simwrapper/simwrapper/commit/56689741068344e36c1f2385e663b8641ee1499a))
* **dash:** Tabbed dashboards! ([96acf3e](https://github.com/simwrapper/simwrapper/commit/96acf3efe2efb8c14a8ff861e73985ac7259a939))
* **flowmap:** FlowMap based on FlowmapBlue (WIP) ([f667347](https://github.com/simwrapper/simwrapper/commit/f66734762da91201fbac749cd7d50c24d2ce8a07))
* **topsheet:** allow hard-coded paths in topsheet config ([0472807](https://github.com/simwrapper/simwrapper/commit/04728074ae1ba9f9d3111a38f6d5078fb971ef7a))
* add [@filter](https://github.com/filter) to topsheet calcs ([5aa8623](https://github.com/simwrapper/simwrapper/commit/5aa86231730363af826325ad6196b86a189828dd))
* Add DrawingTool to XY plot ([065e198](https://github.com/simwrapper/simwrapper/commit/065e1988d83df73c9271822c0bec8c9bf7b46ab0)), closes [#39](https://github.com/simwrapper/simwrapper/issues/39)
* add EN/DE locale support ([161897f](https://github.com/simwrapper/simwrapper/commit/161897f09dc8e6a3337e8cdd6eb40baac81460df))
* Dark mode! ([0556c2c](https://github.com/simwrapper/simwrapper/commit/0556c2ca53019fb012aa053a941827f7e847e630))
* Move main site to https://vsp.berlin/simwrapper ([5782022](https://github.com/simwrapper/simwrapper/commit/5782022084472258bd3a8f46cf218ed276ea2622))
* new Vega-Lite charting plugin ([16d25f4](https://github.com/simwrapper/simwrapper/commit/16d25f43aaa7c983a84c81f26f4dabe687788e81))
* run-finder panel treeview ([d8725db](https://github.com/simwrapper/simwrapper/commit/d8725dba0bd96b0c7b57ce9cf755b61eccbb5ae7))
* Show transit viewer thumbnail whenever *output_transitSchedule* is present ([f67f38c](https://github.com/simwrapper/simwrapper/commit/f67f38cfed0e19b7663b22be555c329be0fddf4b))
* topsheet filters ==,<=,>=,!=,<,> ([866a1c0](https://github.com/simwrapper/simwrapper/commit/866a1c0516742617031ef0e5c6cb92d3088ad5d6))
* topsheet title comes from title/title_en/title_de fields ([3d7e25f](https://github.com/simwrapper/simwrapper/commit/3d7e25fa904a8b7bae977bc0bf7c63fb3d4d3130))
* Try to find coordinate system in output_config.xml ([5ce8766](https://github.com/simwrapper/simwrapper/commit/5ce8766a73e69583444d465c67c1cc56c8170359))
* **carriers:** add shipment tooltips and drive on left/right side ([fd7d056](https://github.com/simwrapper/simwrapper/commit/fd7d056e13827a2e79eedc9f6d21115a2bfb5505))
* **carriers:** fix [#8](https://github.com/simwrapper/simwrapper/issues/8) - add +/- to carriers treeview ([fcb7d57](https://github.com/simwrapper/simwrapper/commit/fcb7d57b0a51cd85eead749c75519514794e66c6))
* **dash:** Topsheet + Pie are more or less working ([3698bc1](https://github.com/simwrapper/simwrapper/commit/3698bc1ab775e9d151c1395347262850cbce9c73))
* **shapefile:** a bit better at guessing CRS projections ([209e060](https://github.com/simwrapper/simwrapper/commit/209e060463919a2a91a1fc905ced19439f8f1a70))
* **shapefile:** Add opacity slider ([5df86a8](https://github.com/simwrapper/simwrapper/commit/5df86a89e4728db785cca07268819b755208add9)), closes [#38](https://github.com/simwrapper/simwrapper/issues/38)
* **video:** add video plugin ([442c408](https://github.com/simwrapper/simwrapper/commit/442c408a6eafba9b1b5c20f9caa34a57d4858e10))
* **video:** video player plugin ([c250a11](https://github.com/simwrapper/simwrapper/commit/c250a117c87df0ac54374c5d0b48a66cd3454183))


### Bug Fixes

* Charts learned dark/light modes ([97c77fc](https://github.com/simwrapper/simwrapper/commit/97c77fc0ad8468f725c46693ab62fc6d5cbf58c2))
* **carriers:** fix [#1](https://github.com/simwrapper/simwrapper/issues/1) use link midpoint for shipment locations ([3e589f6](https://github.com/simwrapper/simwrapper/commit/3e589f6ac2108d971830e107e1f5a2b972e80fae))
* **dash:** allow map geojson to be on Url or local file path ([17e79e6](https://github.com/simwrapper/simwrapper/commit/17e79e6c77c78df42bdd4f9a5ba055f74446decc))
* **dash:** bg colors in dark mode ([f6b5776](https://github.com/simwrapper/simwrapper/commit/f6b57766cc96ca421f53f06d5d93d9f16d843df7))
* **dash:** Dashboard max 110rem width. Too wide is too wide. ([ec4dcaf](https://github.com/simwrapper/simwrapper/commit/ec4dcaf3c85cfbeb0b61febdc3dbc23a840d3e93))
* **dash:** loose threads causing bad card reloads ([90c74ed](https://github.com/simwrapper/simwrapper/commit/90c74ede9e4f44c974418685e991f2acd4c99073))
* **dash:** nicer shape/circle buttons ([81a2e46](https://github.com/simwrapper/simwrapper/commit/81a2e46faf48513a1eff1cb78f3f562e30d68775))
* **dash:** No need for dashboards to have a max width ([79d6d9d](https://github.com/simwrapper/simwrapper/commit/79d6d9d979a6ccd07b861efe0acc17f5e8ea55db))
* **dashboard:** links-gl layout improvements ([af78cde](https://github.com/simwrapper/simwrapper/commit/af78cde06389bad2677f6d33bc50f6a8f7d21aa0))
* **links:** column names with hours were being mangled ([f61a6fd](https://github.com/simwrapper/simwrapper/commit/f61a6fdce905e0c71b31613c0b0240099f950877))
* **links:** config panel layout ([eb8b6ec](https://github.com/simwrapper/simwrapper/commit/eb8b6ec1fed9d1c03a9188755d8f04b99f13b124))
* **links:** config panel layout ([0d750f0](https://github.com/simwrapper/simwrapper/commit/0d750f0a159a9db9c78a407bcc8f3658f612e34b))
* **links:** diff plots are always red/blue now ([5903c4c](https://github.com/simwrapper/simwrapper/commit/5903c4c11efca3c452029acf8a6a858245dce092))
* **links:** handle .gz and non-.gz inputs ([fd44328](https://github.com/simwrapper/simwrapper/commit/fd44328c889b8e353e745ec8915b475af1a23ef3))
* **links:** thumbnail images ([3e0324a](https://github.com/simwrapper/simwrapper/commit/3e0324a2c6ec89d1423d053664be007f1b2233f3))
* **links:** time-slider was too narrow ([218cac7](https://github.com/simwrapper/simwrapper/commit/218cac72012aa0b9f937bd36689993d8da0e59ae))
* **links:** use network center ([7a7d86a](https://github.com/simwrapper/simwrapper/commit/7a7d86a93b366b3516b039f21d2030899090be7a))
* **shapefile:** guess more EPSG codes ([e941f07](https://github.com/simwrapper/simwrapper/commit/e941f072a982fa87fc416584028aece6ec27279d))
* back button is broken ([109d672](https://github.com/simwrapper/simwrapper/commit/109d672402a22affd1492b2cad2671d6b1f4d722)), closes [#21](https://github.com/simwrapper/simwrapper/issues/21)
* better navigation when clicking on viz thumbnails ([d5a7892](https://github.com/simwrapper/simwrapper/commit/d5a78924509e1f73dd45732e2178f60a011f6d37))
* dashboard tabs sometimes show old labels ([8804b2a](https://github.com/simwrapper/simwrapper/commit/8804b2a4f6fee57f1cf813235f894a01e4312128))
* Draw shapefile exports as EPSG:31468 instead of WGS84 (needs work) ([9176141](https://github.com/simwrapper/simwrapper/commit/9176141e2f9e6c034331c2228abd7301ccb1a508))
* draw tool should not hide underlying layers ([89b9fde](https://github.com/simwrapper/simwrapper/commit/89b9fde9bd04df534eb9059e69a163da11aff061))
* **transit:** try to find correct transitSchedule, network, demand files ([8a4beef](https://github.com/simwrapper/simwrapper/commit/8a4beefcf75a00fa6d93f737c0255d044217ab94))
* clean up RunFinder layout ([c03ef5c](https://github.com/simwrapper/simwrapper/commit/c03ef5caa4970f58dc83e5be57aca293725f5f96))
* gist viewer wasn't loading ([3d194f5](https://github.com/simwrapper/simwrapper/commit/3d194f5fc87b185268d57a55f663397d46b1c5f0))
* host font-awesome locally so site works offline ([af0b4d7](https://github.com/simwrapper/simwrapper/commit/af0b4d701e9887ea519aabef71cdd635d181fde6))
* shapefile drawer should export as WGS84, always ([f75c202](https://github.com/simwrapper/simwrapper/commit/f75c202791c36e44f38ee554ce0c1c1388e63f96)), closes [#29](https://github.com/simwrapper/simwrapper/issues/29) [#31](https://github.com/simwrapper/simwrapper/issues/31)
* shapefile tooltip ([4222877](https://github.com/simwrapper/simwrapper/commit/42228772643c99aff27be6a8a467c115684e66aa))
* shapefile zoom and tooltip ([705a233](https://github.com/simwrapper/simwrapper/commit/705a233bd1e98dd48eccdad41fb947ae70c7d7e2))
* thumbnail image heights ([55132d8](https://github.com/simwrapper/simwrapper/commit/55132d896d53d42b8b97e3fc31bd64d8c90fc26d))

### 0.1.1 (2020-08-25)

### Features

- **video:** add video plugin ([442c408](https://github.com/simwrapper/simwrapper.github.io/commit/442c408a6eafba9b1b5c20f9caa34a57d4858e10))
- **video:** video player plugin ([c250a11](https://github.com/simwrapper/simwrapper.github.io/commit/c250a117c87df0ac54374c5d0b48a66cd3454183))
