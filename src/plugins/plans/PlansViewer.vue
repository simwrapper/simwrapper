<template lang="pug">
.carrier-viewer(:class="{'hide-thumbnail': !thumbnail}"
                :style='{"background": urlThumbnail}'
                spellcheck="false"
                oncontextmenu="return false")

  .container-1(@mousemove="dividerDragging" @mouseup="dividerDragEnd")

    .main-panel

      DeckMapComponent.anim(
        :bgLayers="backgroundLayers"
        :legs="shownLegs"
        :nonRoutedLegs="nonRoutedLegs"
        :stopActivities="stopActivities"
        :dark="globalState.isDarkMode"
        :viewId="linkLayerId"
        :settings="vizSettings"
        :onClick="handleClick"
        :show3dBuildings="show3dBuildings"
        :currentTime="currentTime"
        :overview="showEveryone ? overview : null"
        :highlightRow="highlightRow"
        @hover-row="handleMapHover"
      )

      ZoomButtons(v-if="!thumbnail" corner="top-left" :show3dToggle="true" :is3dBuildings="show3dBuildings" :onToggle3dBuildings="toggle3dBuildings")

      .bottom-section.flex-col

        .time-slider-area(v-if="maxEndTime" ref="sliderArea")
          TimeSlider(
            :isPointInTime="true"
            :range="[0, maxEndTime]"
            :activeTimeExtent="timeFilter"
            :labels="timeLabels"
            :isAnimating="isAnimating"
            @timeExtent="handleTimeSliderValues"
            @toggleAnimation="toggleAnimation"
            @drag="stopAnimation"
          )

        PlanTable(v-if="selectedPlans.length"
          :plans="plans[selectedPlans[0]]"
          :searchTerm="searchTerm"
          :currentTime="currentTime"
          :lockedRow="lockedRow"
          :mapHoveredRow="mapHoveredRow"
          @hover-row="hoveredRow = $event"
          @click-row="toggleLockedRow"
        )


      .x-status-message(v-if="myState.statusMessage"): h3 {{ myState.statusMessage }}

    .dragger(@mousedown="dividerDragStart" @mouseup="dividerDragEnd" @mousemove.stop="dividerDragging")

    .right-panel(:darkMode="true" :style="{width: `${legendSectionWidth}px`}")
      h3 {{ $t('plansExplorer') }}

      .search-panel
        p.speed-label(:style="{margin: '1rem 0 0 0'}") {{ $t('search') }}
        form(autocomplete="off")
        .field
          p.control.has-icons-left
            input.input.is-small(type="text" :placeholder="`${$t('searchHint')}...`" v-model="searchTerm")
            span.icon.is-small.is-left
              i.fas.fa-search

      .filter-plans
          o-switch(v-model="vizSettings.selectedPlansOnly")
            span(v-html="$t('selectedPlansOnly')")

      //- every selected plan in the file, animated by the time slider (needs time columns)
      .show-everyone(v-if="maxEndTime")
          o-switch(v-model="showEveryone" :disabled="isLoadingOverview")
            span {{ $t('showEveryone') }}

      .carrier-list.mb1(data-testid="plan-list")
        .carrier(v-for="plan,i in plans" :key="plan[0].plan_num"
                 :class="{selected: selectedPlans.indexOf(i) > -1 }"
                 @click="handleSelectPlan(i)")
          .carrier-title {{ `${plan[0].person_id}&nbsp;/&nbsp;${plan[0].plan_num}&nbsp;&nbsp;${plan[0].plan_selected=='yes' ? '(*)':''}` }}

        //- Oruga's loading takes `fullPage` (camelCase) and `active` via v-model
        o-loading(:active="isQueryRunning" :fullPage="false")

      .detail-area
        .speed-label(style="margin-bottom: 0.5rem") Legend

        .mode-color(v-for="c in legModeColors" :key="c[0]")
          .flex-row
            span(:style="{color: `rgb(${c[1][0]},${c[1][1]},${c[1][2]})`}") ───&nbsp;{{ c[0]}}

      .switchbox
        p.speed-label(:style="{margin: '1rem 0 0 0'}") {{ $t('show') }}
        .switches
          o-switch(v-model="vizSettings.shipmentDotsOnTourMap")
            span(v-html="$t('Activities')")
          o-switch(v-model="vizSettings.simplifyTours")
            span(v-html="$t('flatten')")
          o-switch(v-model="vizSettings.showTeleportedTrips")
            span {{ $t('teleportedTrips') }}

</template>

<script lang="ts">
const i18n = {
  messages: {
    en: {
      plans: 'Plans',
      plansExplorer: 'Plans Explorer',
      vehicles: 'VEHICLES',
      services: 'SERVICES',
      shipments: 'JOBS',
      jobs: 'JOBS',
      tours: 'TOURS',
      pickup: 'Pickup',
      delivery: 'Delivery',
      flatten: 'Simple&nbsp;tours',
      shipmentDots: 'Show shipments',
      scaleSize: 'Widths',
      scaleFactor: 'Width',
      selectedPlansOnly: 'Selected plans (*) only',
      showEveryone: 'Show everyone',
      teleportedTrips: 'Teleported trips',
      unknownLink: '1 unknown link: not found in the network file, so it is left off the map.',
      unknownLinks:
        '{count} unknown links: not found in the network file, so they are left off the map.',
      confirmEveryone:
        'This file has {rows} rows. Loading everyone may take a while and a lot of memory. Continue?',
      showActivities: 'Show activities',
      search: 'Search',
      searchHint: 'Person_id or pattern*',
      service: 'Service',
      show: 'Show',
      Activities: 'Activities',
    },
    de: {
      carriers: 'Unternehmen',
      vehicles: 'FAHRZEUGE',
      services: 'BETRIEBE',
      shipments: 'AUFTRÄGE',
      jobs: 'JOBS',
      tours: 'TOUREN',
      pickup: 'Abholung',
      delivery: 'Lieferung',
      flatten: 'Simple&nbsp;tours',
      shipmentDots: 'Show shipments',
      scaleSize: 'Widths',
      scaleFactor: 'Width',
      service: 'Betrieb',
      show: 'Show',
      Activities: 'Activities',
      showEveryone: 'Alle anzeigen',
      teleportedTrips: 'Teleportierte Wege',
      unknownLink: '1 unbekannter Link: nicht im Netzwerk, daher fehlt er auf der Karte.',
      unknownLinks: '{count} unbekannte Links: nicht im Netzwerk, daher fehlen sie auf der Karte.',
      confirmEveryone:
        'Diese Datei hat {rows} Zeilen. Alle zu laden kann lange dauern und viel Speicher brauchen. Fortfahren?',
    },
  },
}
import { defineComponent, markRaw, toRaw } from 'vue'
import type { PropType } from 'vue'

import DuckDB from '@/js/duckdb'
import type {
  AsyncDuckDB,
  AsyncDuckDBConnection,
} from '~/@duckdb/duckdb-wasm/dist/types/src/targets/duckdb.js'
import naturalSort from 'javascript-natural-sort'

import { personSearchFilter } from './personSearch'
import { OverviewBuilder, linkLookup, type OverviewData } from './overviewData'
import {
  MAX_END_TIME_KEY,
  P995_END_TIME_KEY,
  formatClockTime,
  sliderEndTime,
  timeWindow,
} from './planTime'
import { planKey } from './planHover'
import YAML from 'yaml'

import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import TimeSlider from '@/components/TimeSlider.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import { sleep, debounce } from '@/js/util'
import DashboardDataManager from '@/js/DashboardDataManager'
import DeckMapComponent from './MapComponent.vue'
import PlanTable from './PlanTable.vue'
import BackgroundLayers from '@/js/BackgroundLayers'

import { FileSystemConfig, REACT_VIEW_HANDLES } from '@/Globals'

export const LegModeColor = {
  bike: [0, 225, 50, 255],
  car: [0, 128, 240, 255],
  drt: [180, 0, 228, 255],
  freight: [255, 128, 255, 255],
  pt: [255, 0, 40, 255],
  ride: [0, 255, 255, 255],
  walk: [255, 220, 0, 255],
} as { [mode: string]: number[] }

naturalSort.insensitive = true

// The viz YAML / dashboard config, plus the fields this viewer reads from it.
interface VizDetails {
  network?: string
  carriers?: string
  projection?: string
  title?: string
  description?: string
  thumbnail?: string
  buildings3d?: boolean
  show3dBuildings?: boolean
  center?: number[] | string | null
}

// An activity stop drawn on the map: its position plus the dashed marker along its link.
// `row` is the plan-table row it came from, so table hover/click can find it again.
interface ActivityStop {
  type: string
  midpoint: number[]
  ptFrom: number[]
  ptTo: number[]
  t0: number
  t1: number
  row?: Plan
}

// A leg drawn on the map: polyline points, its mode (colors the line) and time window.
interface DrawnLeg {
  points: number[][]
  mode: string
  type: string
  t0: number
  t1: number
  row?: Plan
}

// Above this many rows (all plans) "Show everyone" asks first: memory and download scale
// with it (Leipzig 10%: 10M rows, ~40 MB downloaded, ~0.5 GB transient browser memory).
const OVERVIEW_CONFIRM_ROWS = 20_000_000

// The columns "Show everyone" needs, for selected plans only: what the plan view draws for a
// plan (activity coordinates; link routes; start/end links of other legs) plus the time
// windows. Coalesced so every column arrives without nulls (see OverviewBatch), and the route
// strings only where they're drawn. `has` = the file's columns: optional ones may be missing.
const overviewQuery = (url: string, has: Set<string>) => {
  const col = (name: string, fallback: string) => (has.has(name) ? name : fallback)
  const routeType = col('route_type', "''")
  return `
  SELECT (element = 'leg')::TINYINT AS is_leg,
         coalesce(${col('activity_lon', 'NULL')}::FLOAT, 'NaN'::FLOAT) AS lon,
         coalesce(${col('activity_lat', 'NULL')}::FLOAT, 'NaN'::FLOAT) AS lat,
         coalesce(time_start, -1) AS t0,
         coalesce(time_end, 1000000000) AS t1,
         coalesce(${col('leg_mode', 'NULL')}, ${col('activity_type_simple', 'NULL')}, '') AS kind,
         coalesce(${routeType}, '') AS route_type,
         CASE WHEN ${routeType} = 'links' THEN coalesce(${col(
    'route_text',
    "''"
  )}, '') ELSE '' END AS route_text,
         CASE WHEN ${routeType} = 'links' THEN '' ELSE coalesce(${col(
    'route_start_link',
    "''"
  )}, '') END AS start_link,
         CASE WHEN ${routeType} = 'links' THEN '' ELSE coalesce(${col(
    'route_end_link',
    "''"
  )}, '') END AS end_link
  FROM '${url.replace(/'/g, "''")}' WHERE plan_selected = 'yes'`
}

export interface Plan {
  person_id: string
  plan_num: number
  plan_selected: string
  element: string
  leg_mode: string
  route_start_link: string
  route_end_link: string
  route_text: string
  route_type: string
  activity_link: string
  activity_lon: number
  activity_lat: number
  activity_type: string
  // [time_start, time_end) in seconds, from plans2parquet; null time_end = open-ended
  time_start?: number | null
  time_end?: number | null
}

const PlansViewerPlugin = defineComponent({
  name: 'PlansViewer',
  i18n,
  components: {
    DeckMapComponent,
    PlanTable,
    TimeSlider,
    ZoomButtons,
  },

  props: {
    root: { type: String, required: true },
    subfolder: { type: String, required: true },
    yamlConfig: { type: String, default: undefined },
    config: { type: Object as PropType<VizDetails>, default: undefined },
    thumbnail: { type: Boolean, default: false },
    datamanager: { type: Object as PropType<DashboardDataManager>, default: undefined },
  },

  emits: ['error', 'title'],

  data() {
    return {
      duck: {} as AsyncDuckDB,
      debounceUpdateSearch: {} as () => void,
      nonRoutedLegs: [] as {
        start: number[]
        end: number[]
        mode: string
        t0: number
        t1: number
        row?: Plan
      }[],
      plans: [] as Plan[][],
      selectedPlans: [] as number[],
      // the plan-table row whose map geometry is highlighted: hovered (transient) or
      // clicked (locked until clicked again or the map's empty space is clicked)
      hoveredRow: null as Plan | null,
      lockedRow: null as Plan | null,
      // the row hovered on the map (a leg/activity under the mouse), so the table can
      // highlight it back. Only rows shown in the table count; everything else stays null.
      mapHoveredRow: null as Plan | null,
      isQueryRunning: false,
      linkLayerId: Math.floor(1e12 * Math.random()),
      legModeColors: Object.entries(LegModeColor),
      dbUrl: '',

      // time slider: 0 = no file metadata, so no slider
      maxEndTime: 0,
      currentTime: 0,
      timeFilter: [0, 0] as number[],
      timeLabels: [formatClockTime(0)] as string[],
      isAnimating: false,
      animator: 0,
      lastFrameTime: 0,
      // simulated seconds per real second while playing
      ANIMATE_SPEED: 3600,

      // the panel is showing the "unknown links" error (so it can be cleared again)
      isShowingUnknownLinks: false,

      // "Show everyone": loaded once, on first use; markRaw'd typed arrays
      showEveryone: false,
      isLoadingOverview: false,
      overview: null as OverviewData | null,

      // ------
      vizSettings: {
        simplifyTours: false,
        shipmentDotsOnTourMap: true,
        scaleFactor: 0, // 0 means don't scale at all
        selectedPlansOnly: false,
        showTeleportedTrips: true,
      },

      vizDetails: {
        network: '',
        carriers: '',
        projection: '',
        title: '',
        description: '',
        thumbnail: '',
        center: null,
      } as VizDetails,

      show3dBuildings: false,

      myState: {
        statusMessage: '',
        subfolder: '',
      },

      isDraggingDivider: 0,
      dragStartWidth: 250,
      legendSectionWidth: 275,

      // DataManager might be passed in from the dashboard; or we might be
      // in single-view mode, in which case we need to create one for ourselves
      myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),

      searchTerm: '',

      backgroundLayers: null as BackgroundLayers | null,

      globalState: globalStore.state,

      // link-id -> [startLon, startLat, endLon, endLat], built by loadNetwork()
      links: null as { [id: string]: number[] } | null,

      stopActivities: [] as ActivityStop[],

      shownLegs: [] as DrawnLeg[],

      // NB no trailing ';' -- this string is bound via :style, and Vue 3 warns
      // "Unexpected semicolon at the end of 'background' style value" on every render,
      // dragging two [intlify] deprecation warnings with it. See trap #8.
      thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat",
    }
  },
  computed: {
    fileApi(): HTTPFileSystem {
      return new HTTPFileSystem(this.fileSystem, globalStore)
    },

    fileSystem(): FileSystemConfig {
      const svnProject: FileSystemConfig[] = this.$store.state.svnProjects.filter(
        (a: FileSystemConfig) => a.slug === this.root
      )
      if (svnProject.length === 0) {
        console.log('no such project')
        throw Error
      }
      return svnProject[0]
    },

    urlThumbnail(): string {
      return this.thumbnailUrl
    },

    // hover wins while the mouse is over a row; otherwise the locked (clicked) row stays lit
    highlightRow(): Plan | null {
      return this.hoveredRow ?? this.lockedRow
    },
  },

  watch: {
    'vizSettings.selectedPlansOnly'() {
      this.selectedPlans = []
      this.updateSearch()
    },

    '$store.state.viewState'() {
      if (!REACT_VIEW_HANDLES[this.linkLayerId]) return
      REACT_VIEW_HANDLES[this.linkLayerId]()
    },

    searchTerm() {
      this.debounceUpdateSearch()
    },

    showEveryone(on: boolean) {
      if (on && !this.overview && !this.isLoadingOverview) this.loadOverview()
    },
  },

  async mounted() {
    const db = DuckDB.getDuckDB()

    this.debounceUpdateSearch = debounce(this.updateSearch, 500)

    this.myState.subfolder = this.subfolder

    if (!this.yamlConfig) this.buildRouteFromUrl()
    await this.getVizDetails()

    if (this.thumbnail) return

    this.myState.statusMessage = 'Loading network...'
    await sleep(0) // update UI
    this.links = (await this.loadNetwork()) ?? null
    this.setMapCenter()

    // this.myState.statusMessage = 'Loading plans...'
    // this.plans = await this.loadPlans()

    this.myState.statusMessage = ''
    await sleep(0) // update UI

    // background layers
    try {
      this.backgroundLayers = new BackgroundLayers({
        vizDetails: this.vizDetails,
        fileApi: this.fileApi,
        subfolder: this.subfolder,
      })
      await this.backgroundLayers.initialLoad()
    } catch {
      this.$emit('error', 'Error loading background layers')
    }
    // finally, make sure duckdb is ready
    this.duck = await db
    this.dbUrl = await this.setupDbUrl()
    await this.loadTimeRange()
  },

  beforeUnmount() {
    this.stopAnimation()

    if (this.fileSystem.handle && this.dbUrl) this.duck.dropFile?.(this.dbUrl)
    this.duck.terminate?.()
  },

  methods: {
    handleSelectPlan(i: number) {
      if (this.selectedPlans.length && i == this.selectedPlans[0]) {
        this.selectedPlans = []
      } else {
        this.selectedPlans = [i]
      }

      // a different plan is drawn now: the old highlight (and its lock) no longer applies
      this.hoveredRow = null
      this.lockedRow = null
      this.mapHoveredRow = null

      let plans = [] as Plan[]

      const showPlans = this.selectedPlans.length
        ? this.selectedPlans
        : [...Array(this.plans.length).keys()]

      for (let n of showPlans) {
        plans.push(...this.plans[n])
      }

      // "selected=yes" ?
      if (this.vizSettings.selectedPlansOnly) {
        plans = plans.filter(r => r.plan_selected == 'yes')
      }

      this.drawThePlans(plans)
    },

    drawThePlans(rows: Plan[]) {
      console.log(this.searchTerm)
      this.shownLegs = []
      this.nonRoutedLegs = []
      this.stopActivities = []

      const activities = rows.filter(r => r.activity_link)
      const legs = rows.filter(r => r.element == 'leg')
      const linkRoutes = [] as Plan[],
        nonLinkRoutes = [] as Plan[]
      for (const r of legs) (r.route_type == 'links' ? linkRoutes : nonLinkRoutes).push(r)

      console.log({ linkRoutes, nonLinkRoutes, activities })

      // Links missing from the network are skipped (and reported below) instead of crashing
      const unknownLinks = new Set<string>()
      const linkXY = (id: string): number[] | undefined => {
        const xy = this.links?.[id]
        if (!xy) unknownLinks.add(id)
        return xy
      }

      // -------
      // add the routes like a crazy person
      linkRoutes.forEach(route => {
        const linksOnThisRoute = (route.route_text || '').split(' ').filter(id => linkXY(id))
        if (!linksOnThisRoute.length) return
        this.addRouteToMap(route.leg_mode, timeWindow(route), linksOnThisRoute, route)
      })

      // Non-routed routes can be shown as arcs, by mode
      nonLinkRoutes.forEach(leg => {
        const start = linkXY(leg.route_start_link)
        const end = linkXY(leg.route_end_link)
        if (!start || !end) return
        const startMidpoint = [0.5 * (start[0] + start[2]), 0.5 * (start[1] + start[3])]
        const endMidpoint = [0.5 * (end[0] + end[2]), 0.5 * (end[1] + end[3])]

        this.nonRoutedLegs.push({
          start: startMidpoint,
          end: endMidpoint,
          mode: leg.leg_mode,
          ...timeWindow(leg),
          row: leg,
        })
      })

      // YOLO! Add the activities too!
      // TODO: split out activities per PLAN, not one big list
      const stopActivities = [] as ActivityStop[]
      activities.forEach(activity => {
        const link = activity.activity_link
        const lnglat = [activity.activity_lon, activity.activity_lat]
        // the dashed marker along the activity's link; none if the link is unknown
        const xy = linkXY(link)
        const ptFrom = xy ? [xy[0], xy[1]] : lnglat
        const ptTo = xy ? [xy[2], xy[3]] : lnglat

        stopActivities.push({
          type: activity.activity_type,
          midpoint: lnglat,
          ptFrom,
          ptTo,
          ...timeWindow(activity),
          row: activity,
        })
      })
      this.stopActivities = stopActivities

      this.reportUnknownLinks(unknownLinks.size)
    },

    // Show (or clear) the "unknown links" error on the panel.
    reportUnknownLinks(count: number) {
      if (count) {
        const message = count === 1 ? this.$t('unknownLink') : this.$t('unknownLinks', { count })
        this.$emit('error', `${message}`)
        this.isShowingUnknownLinks = true
      } else if (this.isShowingUnknownLinks) {
        this.$emit('error', '')
        this.isShowingUnknownLinks = false
      }
    },

    // `db`: the DuckDB instance to register a local file with (default: the viewer's own)
    async setupDbUrl(db?: AsyncDuckDB) {
      // Local files: DuckDB can handle FileHandles from the filesystem but they must be registered.
      // Flask filesystem: URL
      // S3: URL
      // Remote: URL
      let url = `${this.fileSystem.baseURL}/${this.subfolder}/${this.yamlConfig}`

      if (!this.fileSystem.handle) {
        // await this.duck.registerFileURL('plans.parquet', url, DuckDB.DuckDBDataProtocol.HTTP, true)
        // return 'plans.parquet'
        return url
      }

      url = 'plans.parquet' // this.yamlConfig || 'datafile.parquet'

      // retrieve file handle
      const dir = await this.fileApi.getDirectory(this.subfolder)
      const handle = dir.handles[this.yamlConfig || url]
      const file = await handle.getFile()
      // console.log({ dir, handle })

      // register file handle with DuckDB using filename
      await (db || this.duck).registerFileHandle(
        url,
        file, // the file from the FileSystemFileHandle
        // handle, // the FileSystemFileHandle itself
        DuckDB.DuckDBDataProtocol.BROWSER_FILEREADER,
        false
      )
      return url
    },

    // "Show everyone": stream the few columns needed for every selected plan into compact
    // typed arrays, once. Uses its own DuckDB instance: DuckDB-wasm's WebAssembly memory
    // grows while scanning and never shrinks, so terminating the instance afterwards gives
    // it back (Leipzig 10%: ~350 MB less kept than reusing the viewer's instance).
    async loadOverview() {
      this.isLoadingOverview = true
      let db: AsyncDuckDB | null = null
      try {
        const rows = await this.countFileRows()
        if (rows > OVERVIEW_CONFIRM_ROWS) {
          const message = `${this.$t('confirmEveryone', { rows: rows.toLocaleString() })}`
          if (!window.confirm(message)) {
            this.showEveryone = false
            return
          }
        }

        const columns = await this.fileColumns()
        // legs are drawn on the road network that the viewer already loaded
        const network = linkLookup(toRaw(this.links) || {})

        db = await DuckDB.getDuckDB()
        const url = await this.setupDbUrl(db)
        const conn = await db.connect()
        const builder = new OverviewBuilder(network)
        let reported = 0
        for await (const batch of await conn.send(overviewQuery(url, columns))) {
          const text = (name: string) => {
            const vector = batch.getChild(name)!
            return (i: number) => vector.get(i) as string
          }
          builder.append({
            numRows: batch.numRows,
            isLeg: batch.getChild('is_leg')!.toArray(),
            lon: batch.getChild('lon')!.toArray(),
            lat: batch.getChild('lat')!.toArray(),
            t0: batch.getChild('t0')!.toArray(),
            t1: batch.getChild('t1')!.toArray(),
            kind: text('kind'),
            routeType: text('route_type'),
            startLink: text('start_link'),
            endLink: text('end_link'),
            routeText: text('route_text'),
          })
          if (builder.rowsRead - reported >= 250_000) {
            reported = builder.rowsRead
            this.myState.statusMessage = `${this.$t('showEveryone')}: ${(reported / 1e6).toFixed(
              2
            )}M`
          }
        }
        await conn.close()
        this.overview = markRaw(builder.finish())
        if (this.overview.unknownLinks) this.reportUnknownLinks(this.overview.unknownLinks)
      } catch (e) {
        console.error('Could not load everyone:', e)
        this.showEveryone = false
      } finally {
        db?.terminate()
        this.isLoadingOverview = false
        this.myState.statusMessage = ''
      }
    },

    // Column names of the file, from the parquet footer only.
    async fileColumns() {
      const conn = await this.duck.connect()
      const url = this.dbUrl.replace(/'/g, "''")
      const table = await conn.query(`SELECT name FROM parquet_schema('${url}');`)
      await conn.close()
      return new Set<string>(table.getChild('name')?.toArray() || [])
    },

    // Total rows in the file (all plans), from the parquet footer only.
    async countFileRows() {
      const conn = await this.duck.connect()
      const url = this.dbUrl.replace(/'/g, "''")
      const table = await conn.query(
        `SELECT sum(num_rows)::BIGINT AS n FROM parquet_file_metadata('${url}');`
      )
      await conn.close()
      return Number(table.getChild('n')?.get(0) ?? 0)
    },

    // The slider range is in the file's key/value metadata (written by plans2parquet), so
    // only the parquet footer is read. Older files have no such keys: no slider.
    async loadTimeRange() {
      try {
        const conn = await this.duck.connect()
        const url = this.dbUrl.replace(/'/g, "''")
        const table = await conn.query(
          `SELECT decode(key) AS k, decode(value) AS v FROM parquet_kv_metadata('${url}')
           WHERE decode(key) IN ('${MAX_END_TIME_KEY}', '${P995_END_TIME_KEY}');`
        )
        await conn.close()
        const keys: string[] = table.getChild('k')?.toArray() || []
        const values: string[] = table.getChild('v')?.toArray() || []
        const meta = Object.fromEntries(keys.map((k, i) => [k, values[i]]))
        this.maxEndTime = sliderEndTime(meta)
      } catch (e) {
        console.warn('Could not read plans time range:', e)
        this.maxEndTime = 0
      }
      if (this.maxEndTime) {
        await this.$nextTick()
        // TimeSlider only picks up labels through a (non-immediate) watcher, so hand it a
        // new array once it's mounted, or the clock stays blank until the first move
        this.timeLabels = [formatClockTime(this.currentTime)]
      }
    },

    setTime(t: number) {
      const time = Math.min(Math.max(t, 0), this.maxEndTime)
      this.currentTime = time
      this.timeFilter = [time, time]
      this.timeLabels = [formatClockTime(time)]
    },

    // TimeSlider is a range slider: in point-in-time use its two ends move as one, so the
    // time is whichever end the user moved.
    handleTimeSliderValues(values: number[]) {
      const [start, end] = values
      // tolerance: the slider's position <-> time conversion isn't exact in floating point
      const moved = Math.abs(start - this.currentTime) > 1e-6 ? start : end
      if (start === end && Math.abs(moved - this.currentTime) <= 1e-6) return
      this.setTime(moved)
    },

    toggleAnimation() {
      if (this.isAnimating) return this.stopAnimation()
      if (this.currentTime >= this.maxEndTime) this.setTime(0)
      this.isAnimating = true
      this.lastFrameTime = performance.now()
      this.animator = window.requestAnimationFrame(this.animate)
    },

    stopAnimation() {
      this.isAnimating = false
      if (this.animator) window.cancelAnimationFrame(this.animator)
      this.animator = 0
    },

    animate(now: number) {
      if (!this.isAnimating) return
      const elapsed = (now - this.lastFrameTime) / 1000
      this.lastFrameTime = now
      let t = this.currentTime + elapsed * this.ANIMATE_SPEED
      if (t > this.maxEndTime) t = 0 // loop
      this.setTime(t)
      this.animator = window.requestAnimationFrame(this.animate)
    },

    // clicking a row again releases its highlight
    toggleLockedRow(row: Plan) {
      this.lockedRow = this.lockedRow === row ? null : row
    },

    // Hovering a leg/activity on the map lights up its row in the table -- but only while
    // the table is up and the object belongs to a row it shows; otherwise nothing happens.
    handleMapHover(row: Plan | null) {
      const shown = this.selectedPlans.length ? this.plans[this.selectedPlans[0]] : null
      this.mapHoveredRow = row && shown && shown.indexOf(row) > -1 ? row : null
    },

    async performQuery(conn: AsyncDuckDBConnection, term: string) {
      // One query for exact ids and wildcard patterns alike. For a pattern like 'p524*' the
      // filter adds a person_id range on its literal prefix, so DuckDB only reads the row
      // groups (of the person_id-sorted parquet) that can hold matches, not the whole file.
      const { where, params } = personSearchFilter(term)
      const stmt = await conn.prepare(`SELECT * FROM '${this.dbUrl}' WHERE ${where};`)
      const table = await stmt.query(...params)
      return table
    },

    async updateSearch() {
      if (!this.duck.ping) return

      this.isQueryRunning = true

      const dbconn = await this.duck.connect()
      const table = await this.performQuery(dbconn, this.searchTerm)
      dbconn.close()

      // let's search for persons
      const rows = table.toArray().map(r => r.toJSON()) as Plan[]

      // selected="yes" ?
      const shownRows = this.vizSettings.selectedPlansOnly
        ? rows.filter(r => r.plan_selected == 'yes')
        : rows

      const grouped = Object.groupBy(shownRows, row => `${row.person_id}/${row.plan_num}`)
      const plans = Object.values(grouped).filter((p): p is Plan[] => !!p)
      plans.sort((a, b) => naturalSort(a[0].person_id, b[0].person_id))
      this.plans = plans

      this.selectedPlans = []
      // the rows are new objects now: whatever was hovered or locked is gone with them
      this.hoveredRow = null
      this.lockedRow = null
      this.mapHoveredRow = null

      this.drawThePlans(shownRows)
      this.isQueryRunning = false
    },

    dividerDragStart(e: MouseEvent) {
      this.isDraggingDivider = e.clientX
      this.dragStartWidth = this.legendSectionWidth
    },

    dividerDragEnd() {
      this.isDraggingDivider = 0
    },

    dividerDragging(e: MouseEvent) {
      if (!this.isDraggingDivider) return
      const deltaX = this.isDraggingDivider - e.clientX
      this.legendSectionWidth = Math.max(0, this.dragStartWidth + deltaX)
    },

    // Draw a chain of network links as one leg polyline.
    addRouteToMap(
      mode: string,
      timeWin: { t0: number; t1: number },
      linkIds: string[],
      row?: Plan
    ) {
      if (!this.links) return
      // starting point from xy:[0,1]
      const points = [[this.links[linkIds[0]][0], this.links[linkIds[0]][1]]]

      for (const link of linkIds) {
        const lastPoint = points[points.length - 1]
        const fromXY = [this.links[link][0], this.links[link][1]]

        // add from-point if it isn't a duplicate
        if (fromXY[0] !== lastPoint[0] || fromXY[1] !== lastPoint[1]) {
          points.push(fromXY)
        }

        // always add to-point: xy:[2,3]
        points.push([this.links[link][2], this.links[link][3]])
      }

      this.shownLegs.push({
        points,
        mode,
        type: 'leg',
        // time window for the slider filter
        t0: timeWin.t0,
        t1: timeWin.t1,
        // the plan-table row, so hovering or locking it can find this leg again
        row,
      })
    },

    // this happens if viz is the full page, not a thumbnail on a project page
    buildRouteFromUrl() {
      const params = this.$route.params
      if (!params.project || !params.pathMatch) {
        console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
        return
      }

      // subfolder containing the file
      const pathMatch = params.pathMatch as string
      const sep = 1 + pathMatch.lastIndexOf('/')

      this.myState.subfolder = pathMatch.substring(0, sep)
    },

    async getVizDetails() {
      // are we in a dashboard?
      if (this.config) {
        this.vizDetails = Object.assign({}, this.config)
        this.sync3dBuildingsSetting()
        return
      }

      // if a YAML file was passed in, just use it
      if (this.yamlConfig?.endsWith('yaml') || this.yamlConfig?.endsWith('yml')) {
        try {
          const filename =
            this.yamlConfig.indexOf('/') > -1
              ? this.yamlConfig
              : this.subfolder + '/' + this.yamlConfig

          const text = await this.fileApi.getFileText(filename)
          this.vizDetails = YAML.parse(text)
          this.sync3dBuildingsSetting()
          if (this.vizDetails.title) {
            this.$emit('title', this.vizDetails.title)
          }

          return
        } catch (e) {
          console.log('failed' + e)
          // maybe it failed because password?
          const err = e as { status?: number }
          if (this.fileSystem.needPassword && err.status === 401) {
            globalStore.commit('requestLogin', this.fileSystem.slug)
          } else {
            this.$emit('error', '' + e)
          }
          return
        }
      }

      // Fine, build the config based on folder contents -------------------------

      // TODO for now, we'll try two network files
      const { files } = await this.fileApi.getDirectory(this.subfolder)

      let networkFile = ''
      if (files.indexOf('network.avro') > -1) networkFile = 'network.avro'
      else networkFile = this.yamlConfig?.replace('events.xml', 'network.xml.gz') || 'network.xml'

      // does that network file actually exist? If not grab any network file :-)
      // (A plans parquet's name has no 'events.xml', so the replace above returns the plans
      // file itself -- which exists, but isn't a network.)
      if (files.indexOf(networkFile) == -1 || networkFile === this.yamlConfig) {
        networkFile = files.find(f => f.indexOf('network.xml') > -1) || ''
        if (networkFile) console.log('Guessing that network is in:', networkFile)
      }

      const t = '' + this.$t('plansExplorer')
      this.vizDetails = {
        network: networkFile,
        carriers: this.yamlConfig,
        title: t,
        description: '',
        center: this.vizDetails.center,
        projection: '',
        thumbnail: '',
      }
      this.sync3dBuildingsSetting()

      this.$emit('title', t)
    },

    sync3dBuildingsSetting() {
      this.show3dBuildings = !!(this.vizDetails.buildings3d ?? this.vizDetails.show3dBuildings)
    },

    toggle3dBuildings() {
      this.show3dBuildings = !this.show3dBuildings
    },

    async setMapCenter() {
      let samples = 0
      let longitude = 0
      let latitude = 0

      let center = this.vizDetails.center
      if (typeof center == 'string') {
        center = center.split(',').map(Number)
        this.vizDetails.center = center
      }
      if (center) {
        longitude = center[0]
        latitude = center[1]
      } else {
        const links = Object.entries(this.links ?? {})

        if (!links.length) return

        const numLinks = links.length / 2

        const gap = 4096
        for (let i = 0; i < numLinks; i += gap) {
          longitude += links[i * 2][1][0]
          latitude += links[i * 2 + 1][1][1]
          samples++
        }

        longitude = longitude / samples
        latitude = latitude / samples
      }
      if (longitude && latitude) {
        this.$store.commit('setMapCamera', {
          longitude,
          latitude,
          zoom: 4,
          bearing: 0,
          pitch: 0,
          jump: false,
        })
      }
    },

    // Clicking a leg/activity selects its plan, as if picked in the list (which also opens
    // the plan table). On the plan already selected, it locks that row instead, like
    // clicking the row in the table. Empty map space releases the lock.
    handleClick(object: { row?: Plan } | null) {
      const row = object?.row
      if (!row) {
        this.lockedRow = null
        return
      }
      const key = planKey(row)
      const i = this.plans.findIndex(plan => planKey(plan[0]) === key)
      if (i < 0) return
      if (this.selectedPlans[0] === i) {
        this.toggleLockedRow(row)
        return
      }
      this.handleSelectPlan(i)
      // bring the newly selected plan into view in the list
      this.$nextTick(() => {
        const item = (this.$el as HTMLElement).querySelector?.(
          '[data-testid="plan-list"] .carrier.selected'
        )
        item?.scrollIntoView({ block: 'nearest' })
      })
    },

    async loadNetwork() {
      this.myState.statusMessage = 'Loading network...'

      const networkFile = this.vizDetails.network ?? ''

      try {
        // try loading this network file
        const network = await this.myDataManager.getRoadNetwork(
          networkFile,
          this.myState.subfolder,
          Object.assign({}, this.vizDetails),
          null, // no status callback?!
          false // extra: get freespeed, length attributes
        )
        // console.log({ network })
        this.vizDetails.projection = '' + (network.projection || '')
        // build direct lookup of x/y from link-id
        this.myState.statusMessage = 'Building network link table'
        const links: { [id: string]: number[] } = {}

        network.linkId.forEach((linkId: string, i: number) => {
          links[linkId] = [
            network.source[i * 2],
            network.source[i * 2 + 1],
            network.dest[i * 2],
            network.dest[i * 2 + 1],
          ]
        })
        // return { network }
        // console.log( links )
        return links
      } catch {
        this.$emit('error', 'Could not load network file', networkFile)
      }
    },
  },
})

export default PlansViewerPlugin
</script>

<style scoped lang="scss">
@use '@/variables' as *;

/* SCROLLBARS
   The emerging W3C standard is currently Firefox-only */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--bgBold) var(--bgPanel2);
}

/* And this works on Chrome/Edge/Safari */
*::-webkit-scrollbar {
  width: 10px;
}

.carrier-viewer {
  position: absolute;
  top: 0;
  bottom: 0;
  pointer-events: none;
  min-height: $thumbnailHeight;
  // keep the viewer's own z-indexes (the side panel's is 20000) inside the viewer, so the
  // layout's panel error bar is drawn on top of it
  isolation: isolate;
}

.container-1 {
  display: grid;
  height: 100%;
  grid-template-columns: 1fr auto auto;
  grid-template-rows: 1fr;
  pointer-events: auto;
}

.carrier-viewer.hide-thumbnail {
  background: none;
}

.main-panel {
  position: relative;
  flex: 1;
}

.bottom-section {
  position: absolute;
  bottom: 0.5rem;
  left: 0.5rem;
  right: 0.5rem;
  z-index: 6;
  pointer-events: auto;
  max-height: 40%;
  gap: 0.4em;
}

h4 {
  // border-top: 1px solid #bbb;
  margin: 1rem 0.25rem 0.5rem 0.25rem;
  padding-top: 0.25rem;
  font-weight: bold;
  font-size: 1.1rem;
}

.right-panel {
  color: var(--text);
  display: flex;
  flex-direction: column;
  font-size: 0.8rem;
  pointer-events: auto;
  background-color: var(--bgMapLand);
  padding: 0.25rem 0.5rem;
  overflow-y: auto;
  z-index: 20000;

  h3 {
    text-transform: uppercase;
    font-size: 1rem;
  }
}

.input {
  border: none;
  background-color: var(--bgCardFrame2);
  color: var(--text);
}

.input::placeholder {
  color: var(--text);
  opacity: 0.7;
}

.nav {
  grid-area: title;
  display: flex;
  flex-direction: row;
  margin: 0 0;
  padding: 0 0.5rem 0 1rem;

  a {
    font-weight: bold;
    color: white;
    text-decoration: none;

    &.router-link-exact-active {
      color: white;
    }
  }

  p {
    margin: auto 0.5rem auto 0;
    padding: 0 0;
    color: white;
  }
}

.speed-block {
  margin-top: 1rem;
}

.legend-block {
  margin-top: 2rem;
}

.big {
  padding: 0rem 0;
  // margin-top: 1rem;
  font-size: 2rem;
  line-height: 3.75rem;
  font-weight: bold;
}

.anim {
  // background-color: #181919;
  pointer-events: auto;
}

.speed-label {
  font-size: 0.8rem;
  font-weight: bold;
}

.clock {
  grid-area: clock;
  width: 273px;
  background-color: #000000cc;
  border: 3px solid white;
  margin-bottom: 1.2rem;
  color: white;
}

.clock p {
  text-align: center;
  padding: 1rem 1rem;
}

.tooltip {
  padding: 5rem 5rem;
  background-color: #ccc;
  z-index: -1;
}

.panel-items {
  display: flex;
  flex-direction: column;
  margin: 0 0;
  max-height: 100%;
  height: 100%;
  width: 100%;
}

h3 {
  font-size: 1.2rem;
  padding: 0;
}

input {
  border: none;
  background-color: #235;
  color: #ccc;
}

.carrier {
  padding: 0.25rem 0.5rem;
  margin: 0 0rem;
  color: var(--text);
}

.carrier:nth-of-type(odd) {
  background: var(--bgPanel2);
}

.carrier-details {
  font-weight: normal;
  margin-left: 0.5rem;
  animation: slide-up 0.25s ease;
  color: white;
}

.carrier-details .carrier:hover {
  cursor: pointer;
  background-color: $themeColorPale; // var(--bgBold);
}

.carrier:hover {
  color: var(--link);
}

.carrier-title {
  margin-top: 0.1rem;
  display: flex;
  flex-direction: row;

  i {
    opacity: 0.3;
    margin-top: 0.2rem;
    margin-left: -0.2rem;
    margin-right: 0.4rem;
  }
}

.carrier-title:hover {
  i {
    opacity: 0.7;
  }
}

.filter-plans {
  margin: 1rem 0 1rem 0;
}

.show-everyone {
  margin: 0 0 1rem 0;
}

.carrier-list {
  position: relative;
  user-select: none;
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  cursor: pointer;
  background-color: var(--bgBold);
  border: var(--borderFaint);
}

.carrier.selected {
  font-weight: bold;
  background-color: var(--link);
  color: white;
}

.detail-area {
  user-select: none;
  // flex: 1;
  overflow-x: hidden;
  cursor: pointer;
  margin: 0 0.25rem 2rem 0.25rem;
}

.carrier-section {
  margin-top: 0.25rem;
  margin-bottom: 0.25rem;
}

@keyframes slide-up {
  0% {
    opacity: 0;
  }

  100% {
    opacity: 1;
  }
}

.playback-stuff {
  grid-area: playback;
  padding: 0rem 2rem 2rem 2rem;
  pointer-events: auto;
}

.leaf {
  padding-left: 1rem;
}

.leaf:hover {
  color: yellowgreen;
}

.tour.selected {
  background-color: var(--textFancy);
  font-weight: bold;
  color: var(--bgPanel3);
}

.shipment-in-tour {
  background-color: #497c7e;
}

.detail-list {
  width: 250px;
  overflow-y: auto;
  overflow-x: hidden;
}

.detail-list pre {
  font-family: 'Arial';
  padding: 0 0;
  line-height: 0.8rem;
  background-color: var(--bgPanel);
  color: var(--text);
}

.o-switch {
  color: var(--text);
  font-size: 0.9rem;
}

.switches {
  margin-top: 0.5rem;
  gap: 0.5rem 1rem;
  display: flex;
  flex-wrap: wrap; // the side panel is narrow: let the switches flow onto a second row
  // margin: 0.25rem 0.25rem;

  p {
    flex: 1;
    margin: auto 0;
  }
}

.slider {
  flex: 4;
  margin-right: 0 1rem;
}

.detail-buttons {
  margin: 0 0.25rem 0.5rem 0.25rem;
}

.switchbox {
  user-select: none;
  margin: 0 0.25rem 0.5rem 0.25rem;
}

.x-status-message {
  position: absolute;
  inset: 0 0 0 0;
  display: flex;
  flex-direction: column;
  z-index: 20000;
  pointer-events: none;

  h3 {
    background-color: var(--bgBold);
    // border: 1px solid var(--bgCream2);
    color: var(--link);
    margin: auto 0px;
    opacity: 0.95;
    padding: 2rem 2rem;
    text-align: center;
    user-select: none;
    filter: drop-shadow(0px 3px 5px #00000020);
  }
}

.dropdown {
  margin-bottom: 0.5rem;
}

.dragger {
  grid-row: 1 / 2;
  grid-column: 2 / 3;
  width: 4px;
  background-color: var(--bgBold);
  user-select: none;
}

.dragger:hover,
.dragger:active {
  background-color: var(--sliderThumb);
  transition: background-color 0.3s ease;
  transition-delay: 0.1s;
  cursor: ew-resize;
}

.speed-label {
  font-size: 0.8rem;
  font-weight: bold;
  text-transform: uppercase;
}

.mode-color {
  font-size: 0.9rem;
  font-weight: bold;
}

@media only screen and (max-width: 640px) {
  .nav {
    padding: 0.5rem 0.5rem;
  }

  .clock {
    text-align: center;
  }

  .right-side {
    font-size: 0.7rem;
    margin-right: 0.25rem;
  }

  .big {
    padding: 0 0rem;
    margin-top: 0.5rem;
    font-size: 1.3rem;
    line-height: 2rem;
  }

  .side-section {
    margin-left: 0;
  }

  .extra-buttons {
    margin-right: 1rem;
  }
}
</style>
