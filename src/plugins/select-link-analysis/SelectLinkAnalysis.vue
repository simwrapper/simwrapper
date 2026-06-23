<template lang="pug">
.select-link-viewer(
                oncontextmenu="return false")

  .container-1
    .main-panel
        .new-rightside-info-panel(v-show="showLegend")
            .legend-panel.scrolly
                p(v-if="!legendStore.state?.sections?.length" style="font-size: 1.3rem; margin-left: 5px;"): b INFO PANEL
                .dbSelector
                    h4(style="margin-left: 5px;"): b Select database format:
                    .button-group
                        button.button-toggle(
                        v-for="format in ['Parquet', 'Csv']"
                        :key="format"
                        :class="{ 'button-active': chosenFormat === format }"
                        @click="chosenFormat = format"
                        ) {{ format }}
                .query-info(v-if="selectedLink.link && queryTime > 0")
                    h4 Selected Link: {{ selectedLink.link.id }}
                    p Count of all link traversals: {{ Object.values(selectedLinkTraversals).reduce((a, b) => a + b, 0) }}
                    p Number of legs traversing this link: {{ selectedLinkTraversals[selectedLink.link.id] || 0 }}
                    p Query time: {{ Math.round(queryTime * 100) / 100 }} ms
                    p avg. traversals per leg: {{ Math.round((Object.values(selectedLinkTraversals).reduce((a, b) => a + b, 0) / (selectedLinkTraversals[selectedLink.link.id] || 0) || 0) * 100) / 100 }}
                .filter-box(v-if="queriedAgents && Object.keys(queriedAgents).length")
                    ul
                        h4 Economic Groups
                        li(v-for="group in economicGroups" :key="group" @click="filterAgentGroups(group)") {{ group }}

                legend-box(:legendStore="legendStore")
                .agent-list.scrolly(v-if="queriedAgents && Object.keys(queriedAgents).length")
                    .agent-header: b Agents traversing selected link:
                      table.agent-table
                        thead
                            tr
                                th Agent ID
                                th(v-for="prop in allProps" :key="prop") {{ prop }}
                        tbody
                        tr(v-for="(agent, agentId) in queriedAgents" :key="agentId")
                            td {{ agentId }}
                            td(v-for="prop in allProps" :key="prop") {{ agent[prop] }}
        //-         //- .bglayer-section.flex-col(v-if="Object.keys(bgLayers).length")
        //-         //- h5 Layers
        //-         //- b-checkbox.simple-checkbox(v-for="layer in Object.keys(bgLayers)" :key="
        //-         @mouseover="wantToClearTooltip=false" @mouseout="wantToClearTooltip=true"
        //-     )
        //-         .the-html(v-html="tooltipHtml")
        //-         .edit-hint(v-if="tooltipDesiredColumns.length" style="text-align: right;")
        //-         a(@click="showTooltipConfigurator=true") Show/hide...
        MapComponent.anim(v-if="!needsInitialMapExtent"
        :features="boundaries"
        :mapIsIndependent="true"
                    :dark="true"
                    :data="data"
                    :viewId="linkLayerId"
                    :cbTooltip="cbTooltip"
                    :lineWidths="dataLineWidths"
                    :selectedLinkPaths="selectedLinkTraversals"
                    @selectedLink="updateParentValue"
                )
            .status-box(v-if="statusText")
                p {{ statusText }}
                b-progress.load-progress(v-if="loadProgress > 0"
                :value="loadProgress" :rounded="false" type='is-success')
        click-through-times.time-slider-area(
        :allTimes="allTimes"
        :range="timeRange"
        @timeUpdate="handleDiscreteTimeValues"
        )


        //- zoom-buttons(
        //-     v-if="!thumbnail && isLoaded"
        //-     corner="top-left"
        //-     :show3dToggle="true"
        //-     :is3dBuildings="show3dBuildings"
        //-     :onToggle3dBuildings="toggle3dBuildings"
        //- )

        .tooltip(v-if="tooltip" v-html="tooltip.html" :style="tooltip.style")

</template>

<script lang="ts">
import { defineComponent } from 'vue'
import type { PropType } from 'vue'
import YAML from 'yaml'
import readBlob from 'read-blob'
import { arrayBufferToBase64, debounce } from '@/js/util'
import * as turf from '@turf/turf'
import LegendBox from '@/components/viz-configurator/LegendBox.vue'
import { ref } from 'vue';
import GUI from 'lil-gui'
import { ToggleButton } from 'vue-js-toggle-button'
import globalStore from '@/store'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import DashboardDataManager from '@/js/DashboardDataManager'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import ClickThroughTimes from '@/components/ClickThroughTimes.vue'
import TimeSlider from '@/components/TimeSliderV2.vue'
import MapComponent from './MapComponent.vue'
import * as duckdb from '@duckdb/duckdb-wasm';
import duckdb_wasm from '@duckdb/duckdb-wasm/dist/duckdb-mvp.wasm?url';
import mvp_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-mvp.worker.js?url';
import duckdb_wasm_eh from '@duckdb/duckdb-wasm/dist/duckdb-eh.wasm?url';
import eh_worker from '@duckdb/duckdb-wasm/dist/duckdb-browser-eh.worker.js?url';
import RoadNetworkLoader from '@/workers/RoadNetworkLoader.worker.ts?worker'
import sqlite3InitModule from '@sqlite.org/sqlite-wasm';
import type { Sqlite3Static } from '@sqlite.org/sqlite-wasm';
import Papa from '@simwrapper/papaparse'



import {
    FileSystem,
    LegendItem,
    LegendItemType,
    FileSystemConfig,
    VisualizationPlugin,
    LIGHT_MODE,
    DARK_MODE,
    REACT_VIEW_HANDLES,
    MAP_STYLES_OFFLINE,
    ColorScheme,
    DataTable,
} from '@/Globals'
import LegendStore from '@/js/LegendStore'

export interface MapData {
    linkId: String
    agentId: String
    legId: String
    hour: Number
    mode: String
}



const i18n = {
    messages: {
        en: {
            loading: 'Loading data...',
            sorting: 'Sorting into bins...',
            aggregate: 'Summary',
            maxHeight: '3D Height',
            showDetails: 'Show Details',
            selection: 'Selection',
            areas: 'Areas',
            count: 'Count',
        },
        de: {
            loading: 'Dateien laden...',
            sorting: 'Sortieren...',
            aggregate: 'Daten',
            maxHeight: '3-D Höhe',
            showDetails: 'Details anzeigen',
            selection: 'Ausgewählt',
            areas: 'Orte',
            count: 'Anzahl',
        },
    },
}

interface NetworkLinks {
    source: Float32Array
    dest: Float32Array
    linkId: any[]
    projection: String
}

const MANUAL_BUNDLES: duckdb.DuckDBBundles = {
    mvp: {
        mainModule: duckdb_wasm,
        mainWorker: mvp_worker,
    },
    eh: {
        mainModule: duckdb_wasm_eh,
        mainWorker: eh_worker,
    },
};


const SelectLinkAnalysis = defineComponent({
    name: 'SelectLinkAnalysis',
    i18n,

    components: {
        LegendBox,
        CollapsiblePanel,
        DrawingTool,
        MapComponent,
        ToggleButton,
        ZoomButtons,
        ClickThroughTimes,
        TimeSlider,
    },

    props: {
        root: { type: String, required: true },
        subfolder: { type: String, required: true },
        yamlConfig: String,
        config: Object as any,
        thumbnail: Boolean,
        datamanager: { type: Object as PropType<DashboardDataManager> },
    },


    data() {
        return {
            linkLayerId: Math.floor(1e12 * Math.random()),
            isAreaMode: false,
            db: null as duckdb.AsyncDuckDB | null,
            dbCsv: null as any,
            worker: null as Worker | null,
            logger: null as duckdb.ConsoleLogger | null,
            bundle: null as duckdb.DuckDBBundle | null,
            bundleCsv: null as duckdb.DuckDBBundle | null,
            workerCsv: null as Worker | null,
            loggerCsv: null as duckdb.ConsoleLogger | null,
            conn: null as duckdb.AsyncDuckDBConnection | null,
            connCsv: null as duckdb.AsyncDuckDBConnection | null,
            globalState: globalStore.state,
            isLoaded: false,
            show3dBuildings: false,
            data: [] as any[],
            network: [] as any[],
            guiController: null as GUI | null,
            boundaries: [] as any[],
            centroids: [] as any[],
            cbDatasetJoined: undefined as any,
            // legendStore: new LegendStore(),
            chosenNewFilterColumn: '',
            boundaryDataTable: {} as DataTable,
            dataFillColors: '#888' as string | Uint8ClampedArray,
            dataLineColors: '' as string | Uint8ClampedArray,
            dataLineWidths: 1 as number | Float32Array,
            dataPointRadii: 5 as number | Float32Array,
            dataFillHeights: 0 as number | Float32Array,
            dataCalculatedValues: null as Float32Array | null,
            dataNormalizedValues: null as Float32Array | null,
            constantLineWidth: null as null | number,
            dataCalculatedValueLabel: '',
            dbClearTooltip: {} as any,
            selectedLink: ref({}) as any,
            selectedHour: ref(6) as any,
            timeRange: [8, 14] as Number[],
            allTimes: [8 * 3600, 9 * 3600, 10 * 3600, 11 * 3600, 12 * 3600, 13 * 3600, 14 * 3600] as any[],
            queryTime: 0 as number,

            originalAgents: {} as any,
            originalTraversals: {} as any,

            tooltipHtml: '' as string,
            tooltipIsFixed: false as boolean,
            tooltipDesiredColumns: [] as { col: string; enabled: boolean }[],
            showTooltipConfigurator: false,
            showLegend: false,
            legendStore: new LegendStore(),
            // legendSectionWidth: 200,
            statusText: 'Loading...',
            loadProgress: 0,
            loadSteps: 0,
            totalLoadSteps: 6,

            needsInitialMapExtent: true,
            initialView: null as null | { center: [number, number]; zoom: number },

            highlightedLinkIndex: -1 as number,
            wantToClearTooltip: false,

            // demograpic data
            economicGroups: ['low', 'medium', 'high'] as String[],
            selectedEconomicGroup: '',
            filteredAgents: [] as string[],
            currentlyQueriedLinkId: null as number | null,
            currentlyQueriedHour: null as number | null,

            vizDetails: {
                network: '',
                projection: '',
                title: '',
                description: '',
                thumbnail: '',
                tooltip: [] as string[],
                mapIsIndependent: false,
                zoom: null as number | null,
                bearing: null as number | null,
                pitch: null as number | null,
                center: null as any,
                timeSelector: null as string | null,
            },

            myState: {
                statusMessage: '',
                isRunning: false,
                subfolder: '',
                yamlConfig: '',
                thumbnail: true,
                data: [] as any[],
            },

            links: null as any,
            selectedLinkTraversals: new Map<number, number>() as any,
            queriedAgents: new Map<number, any>() as any,
            sqlite3: null as Sqlite3Static | null,

            chosenFormat: 'Parquet' as string,

            myMap: new Map<string, number[]>(),

            thumbnailUrl: "url('assets/thumbnail.jpg') no-repeat;",

            csvLinkTraversalData: [] as any[],

            // DataManager might be passed in from the dashboard; or we might be
            // in single-view mode, in which case we need to create one for ourselves
            myDataManager: this.datamanager || new DashboardDataManager(this.root, this.subfolder),
        }
    },

    computed: {

        tooltip() {

        },
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
            // else {console.log('found project', )}
            // svnProject[0].baseURL = svnProject[0].baseURL + "/" + this.subfolder
            console.log('Using file system config:', svnProject[0])
            console.log('subfolder:', this.subfolder)
            console.log('full URL for file system:', svnProject[0].baseURL + '/' + this.subfolder)
            return svnProject[0]
        },
        allProps() {
            const props = new Set();
            Object.values(this.queriedAgents).forEach(agent => {
                Object.keys(agent).forEach(prop => props.add(prop));
            });
            return Array.from(props).sort();
        },
    },

    watch: {
        '$store.state.viewState'() {
            if (!REACT_VIEW_HANDLES[this.linkLayerId]) return
            REACT_VIEW_HANDLES[this.linkLayerId]()
        },

        'globalState.isDarkMode'() {
            this.updateLegendColors()
        },

        async 'globalState.authAttempts'() {
            console.log('AUTH CHANGED - Reload')
            // if (!this.yamlConfig) this.buildRouteFromUrl()
            await this.getVizDetails()
        }

    },

    methods: {
        toggle3dBuildings() {
            this.show3dBuildings = !this.show3dBuildings
        },

        async updateParentValue(value: any) {
            this.selectedLink = value;
            let results = await this.queryLinksForSelectedLink(this.selectedLink.link.id, this.selectedHour)
            let agentResults = await this.queryAgentsForSelectedLink(this.selectedLink.link.id, this.selectedHour)
            this.selectedLinkTraversals = results
            this.queriedAgents = agentResults
        },

        async loadAndPrepareData() {
            this.logger = new duckdb.ConsoleLogger();
            await this.loadParquetData()
            // await this.loadSQLiteData()
            await this.loadAndPrepareCSVData()
            console.log('CSV data loaded and prepared:', this.csvLinkTraversalData)
        },

        // async loadSQLiteData() {

        //     if (this.dbSql) {
        //         this.dbSql.close();
        //         this.dbSql = null;
        //     }

        //     // Only initialize once
        //     if (!this.sqlite3) {
        //         this.sqlite3 = await sqlite3InitModule();
        //     }
        //     const sqlite3 = this.sqlite3;


        //     // Load sla.db as a blob
        //     const blob = await this.fileApi.getFileBlob('sla.db');
        //     const arrayBuffer = await blob.arrayBuffer();
        //     const uint8Array = new Uint8Array(arrayBuffer);

        //     // Create a new database in memory
        //     this.dbSql = new sqlite3.oo1.DB('/mydb', 'c');

        //     // Import the sla.db file into the in-memory database
        //     const pDb = sqlite3.wasm.allocFromTypedArray(uint8Array);
        //     sqlite3.capi.sqlite3_deserialize(
        //         this.dbSql.pointer,
        //         'main',
        //         pDb,
        //         uint8Array.byteLength,
        //         uint8Array.byteLength,
        //         sqlite3.capi.SQLITE_DESERIALIZE_FREEONCLOSE | sqlite3.capi.SQLITE_DESERIALIZE_RESIZEABLE
        //     );

        // },


        // csv will be loaded as direct path for the moment - will work on incorporating it into dashboard structure after Zwischenpräsi
        async loadAndPrepareCSVData() {
            this.bundleCsv = await duckdb.selectBundle(MANUAL_BUNDLES);
            this.workerCsv = new Worker(this.bundleCsv.mainWorker!);
            this.dbCsv = new duckdb.AsyncDuckDB(this.loggerCsv ?? new duckdb.ConsoleLogger(), this.workerCsv)
            await this.dbCsv.instantiate(this.bundleCsv.mainModule, this.bundleCsv.pthreadWorker);
            this.connCsv = await this.dbCsv.connect();

            const traversalsUrl = this.fileApi.cleanURL(this.subfolder + '/link-traversals-sorted.csv.zst')
            const legSeqUrl = this.fileApi.cleanURL(this.subfolder + '/leg-sequences-sorted.csv.zst')

            await this.dbCsv.registerFileURL(
                'link-traversals-sorted.csv.zst',
                traversalsUrl,
                duckdb.DuckDBDataProtocol.HTTP,
                false
            )
            await this.dbCsv.registerFileURL(
                'leg-sequences-sorted.csv.zst',
                legSeqUrl,
                duckdb.DuckDBDataProtocol.HTTP,
                false
            )

            // if (this.connCsv) {
            //     try {
            //         const initialResult = await this.connCsv.query(`
            //             SELECT COUNT(*) AS count
            //             FROM "link-traversals-sorted.csv.zst"
            //             WHERE hour = ${this.selectedHour}
            //         `)
            //         console.log('caching csv to allow for faster subsequent queries:', initialResult.toArray())

            //     } catch (e) {
            //         console.error('Error querying CSV data:', e)
            //     }
            // }


        },

        async loadParquetData() {
            this.bundle = await duckdb.selectBundle(MANUAL_BUNDLES);
            this.worker = new Worker(this.bundle.mainWorker!);
            this.db = new duckdb.AsyncDuckDB(this.logger ?? new duckdb.ConsoleLogger(), this.worker);
            await this.db.instantiate(this.bundle.mainModule, this.bundle.pthreadWorker);
            this.conn = await this.db.connect();


            const traversalsUrl = this.fileApi.cleanURL(this.subfolder + '/link-traversals-sorted.parquet')
            const legSeqUrl = this.fileApi.cleanURL(this.subfolder + '/leg-sequences-sorted.parquet')
            const agentsUrl = this.fileApi.cleanURL(this.subfolder + '/agents-sorted.parquet')

            console.log('Registering:', traversalsUrl, legSeqUrl, agentsUrl)

            await this.db.registerFileURL('link-traversals-sorted.parquet', traversalsUrl, duckdb.DuckDBDataProtocol.HTTP, false)
            await this.db.registerFileURL('leg-sequences-sorted.parquet', legSeqUrl, duckdb.DuckDBDataProtocol.HTTP, false)
            await this.db.registerFileURL('agents-sorted.parquet', agentsUrl, duckdb.DuckDBDataProtocol.HTTP, false)

            // // initial query to warm up the system; also gives us a count of total traversals for the selected hour, which is useful info to have right away
            // const initialResult = await this.conn.query(`
            //     SELECT COUNT(*) AS count
            //     FROM "link-traversals-sorted.parquet"
            //     WHERE hour = ${this.selectedHour}
            // `)

            // console.log('caching parquet to allow for faster subsequent queries:', initialResult.toArray())

        },

        splitString(str: string, delimiter: string): string[] {
            return str.split(delimiter);
        },

        async queryLinksForSelectedLink(linkId: number, hour: number) {
            const start = performance.now();
            try {
                if (this.conn && this.chosenFormat === 'Parquet') {

                    // old query with link traversals table:
                    // const result = await this.conn.query(`
                    //                         WITH sequences AS (
                    //                         SELECT UNNEST(string_split(ls.leg_sequence, '|')) AS link_id
                    //                         FROM "leg-sequences.parquet" ls
                    //                         INNER JOIN "link-index.parquet" lt
                    //                             ON ls.leg_id = lt.leg_id
                    //                         WHERE lt.link_id = '${linkId}' AND lt.hour = ${hour}
                    //                     )
                    //                     SELECT link_id, COUNT(*) AS count
                    //                     FROM sequences
                    //                     GROUP BY link_id
                    //                         `)

                    // const result = await this.conn.query(`
                    // SELECT co_link_id, count AS traversal_count
                    // FROM "link-index.parquet"
                    // WHERE link_id = '${linkId}'AND hour = ${hour} `)

                    const result = await this.conn.query(`
                        WITH sequences AS (
                            SELECT UNNEST(string_split(ls.leg_sequence, '|')) AS co_link_id
                            FROM 'link-traversals-sorted.parquet' lt
                            INNER JOIN 'leg-sequences-sorted.parquet' ls ON lt.leg_id = ls.leg_id
                            WHERE lt.link_id = '${linkId}' AND lt.hour = ${hour}
                        )
                        SELECT co_link_id, COUNT(*) AS traversal_count
                        FROM sequences
                        GROUP BY co_link_id
                        ORDER BY traversal_count DESC
                    `)

                    this.queryTime = performance.now() - start;

                    this.originalTraversals = Object.fromEntries(
                        result.toArray().map(row => [row.co_link_id.toString(), Number(row.traversal_count)])
                    )

                    return this.originalTraversals
                }
                if (this.connCsv && this.dbCsv && this.chosenFormat === 'Csv') {
                    const start = performance.now();

                    const result = await this.connCsv.query(`
                        WITH sequences AS (
                            SELECT UNNEST(string_split(ls.leg_sequence, '|')) AS co_link_id
                            FROM 'link-traversals-sorted.csv.zst' lt
                            INNER JOIN 'leg-sequences-sorted.csv.zst' ls ON lt.leg_id = ls.leg_id
                            WHERE lt.link_id = '${linkId}' AND lt.hour = ${hour}
                        )
                        SELECT co_link_id, COUNT(*) AS traversal_count
                        FROM sequences
                        GROUP BY co_link_id
                        ORDER BY traversal_count DESC
                    `)

                    this.queryTime = performance.now() - start;

                    return Object.fromEntries(
                        result.toArray().map(row => [row.co_link_id.toString(), Number(row.traversal_count)])
                    );
                }
            } catch (e) {
                console.error('Error querying links for selected link:', e);
                return {};
            }
        },

        async queryAgentsForSelectedLink(linkId: number, hour: number) {
            this.currentlyQueriedLinkId = linkId
            this.currentlyQueriedHour = hour
            try {
                if (this.conn) {
                    const result = await this.conn.query(`
                        SELECT a.*
                        FROM "agents-sorted.parquet" a
                        INNER JOIN "link-traversals-sorted.parquet" lt
                            ON a.agent_id = lt.agent_id
                        WHERE lt.link_id = '${linkId}' AND lt.hour = ${hour}
                    `)

                    this.originalAgents = Object.fromEntries(
                        result.toArray().map(row => {
                            for (let key in row) {
                                row[key] = typeof row[key] === 'bigint' ? Number(row[key]) : row[key];
                            }
                            return [row.agent_id.toString(), row];
                        })
                    )
                    return this.originalAgents
                }
            } catch (e) {
                console.error('Error querying agents for selected link:', e);
                return {};
            }
            return {} // agent details are not implemented yet, but this is where that query would go
        },

        async filterAgentGroups(group: string) {
            this.selectedEconomicGroup = group
            // this is where we would apply filters to the queriedAgents based on economicGroups or other demographic data
            // for now, it just logs the selected groups and doesn't actually filter anything
            // console.log('Filtering agents based on selected economic groups:', this.economicGroups)
            // if (!this.queriedAgents || Object.keys(this.queriedAgents).length === 0) return

            // if (!this.economicGroups || this.economicGroups.length === 0) {
            //     return
            // }

            // console.log('Filtering agents based on economic status:', this.selectedEconomicGroup)
            // console.log('Queried agents before filtering:', this.queriedAgents)
            this.queriedAgents = Object.fromEntries(
                Object.entries(this.originalAgents)
                    .filter(([agentId, agent]) => {
                        const matches = agent.economic_status === this.selectedEconomicGroup
                        if (matches) {
                            this.filteredAgents.push(agentId) // keep track of filtered agents so we can show them in the UI if needed
                        }
                        return matches
                    })
            )
            if (this.conn) {
                try {
                    const result = await this.conn.query(`
                        WITH sequences AS (
                            SELECT UNNEST(string_split(ls.leg_sequence, '|')) AS co_link_id
                            FROM 'link-traversals-sorted.parquet' lt
                            INNER JOIN 'leg-sequences-sorted.parquet' ls
                                ON lt.leg_id = ls.leg_id
                            WHERE lt.link_id = '${this.currentlyQueriedLinkId}'
                            AND lt.hour = ${this.currentlyQueriedHour}
                            AND lt.agent_id IN (
                                SELECT UNNEST(string_split('${this.filteredAgents.join("|")}', '|'))
                            )
                        )
                        SELECT co_link_id, COUNT(*) AS traversal_count
                        FROM sequences
                        GROUP BY co_link_id
                        ORDER BY traversal_count DESC
                    `);
                    this.selectedLinkTraversals = Object.fromEntries(
                        result.toArray().map(row => [row.co_link_id.toString(), Number(row.traversal_count)])
                    );

                } catch (e) {
                    console.error('Error querying links for selected link:', e);
                    return {};
                }
            }

        },


        // this happens if viz is the full page, not a thumbnail on a project page
        buildRouteFromUrl() {
            const params = this.$route.params
            console.log('ROUTE PARAMS', params)
            if (!params.project || !params.pathMatch) {
                console.log('I CANT EVEN: NO PROJECT/PARHMATCH')
                return
            }


            // subfolder and config file
            const sep = 1 + params.pathMatch.lastIndexOf('/')
            const subfolder = params.pathMatch.substring(0, sep)
            const config = params.pathMatch.substring(sep)

            this.myState.subfolder = subfolder
            // this.myState.yamlConfig = config
        },

        async getVizDetails() {
            // are we in a dashboard?
            if (this.config) {
                // Merge config into existing vizDetails to preserve required shape
                Object.assign(this.vizDetails, this.config)
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
                    if (this.vizDetails.title) {
                        this.$emit('title', this.vizDetails.title)
                    }

                    return
                } catch (e) {
                    console.log('failed' + e)
                    // maybe it failed because password?
                    const err = e as any
                    if (this.fileSystem.needPassword && err.status === 401) {
                        globalStore.commit('requestLogin', this.fileSystem.slug)
                    } else {
                        this.$emit('error', '' + e)
                    }
                    return
                }
            }

            // Fine, build the config based on folder contents -------------------------
            const title = this.myState.yamlConfig.substring(
                0,
                15 + this.myState.yamlConfig.indexOf('selectLink')
            )

            // Road network: first try the most obvious network filename:
            const { files } = await this.fileApi.getDirectory(this.myState.subfolder)

            let network = this.myState.yamlConfig.replaceAll('selectLink', 'network')
            // if the obvious network file doesn't exist, just grab... the first network file:
            if (files.indexOf(network) == -1) {
                const allNetworks = files.filter(f => f.indexOf('network') > -1)
                if (allNetworks.length) network = allNetworks[0]
                else {
                    this.myState.statusMessage = 'No road network found.'
                    network = ''
                }
            }


            const t = 'Select Link Analysis'
            this.$emit('title', t)

            this.buildThumbnail()
        },

        async loadNetwork() {
            console.log('LOADING NETWORK')
            this.myState.statusMessage = 'Loading network...'

            if (
                this.vizDetails.network.indexOf('.xml.') > -1 ||
                this.vizDetails.network.endsWith('.avro')
            ) {
                const network = (await this.myDataManager.getRoadNetwork(
                    this.vizDetails.network,
                    this.subfolder,
                    this.vizDetails,
                    null,
                    true
                )) as any

                console.log('network keys:', Object.keys(network))
                console.log('linkId sample:', Array.from(network.linkId).slice(0, 5))
                console.log('id sample?:', network.id ? Array.from(network.id).slice(0, 5) : 'no id field')
                console.log('linkAttributes:', network.linkAttributes)

                // Build features with geometry, but no properties yet
                // (properties get added in setFeaturePropertiesAsDataSource)
                const numLinks = network.linkId.length
                const features = [] as any[]

                for (let i = 0; i < numLinks; i++) {
                    const linkID = network.linkId[i]
                    const coords = [
                        network.source.slice(i * 2, i * 2 + 2),
                        network.dest.slice(i * 2, i * 2 + 2),
                    ]
                    const feature = {
                        id: linkID,
                        type: 'Feature',
                        properties: {},
                        geometry: { type: 'LineString', coordinates: coords },
                    }
                    features.push(feature)
                }

                this.network = network
                // this.isAvroFile = true
                console.log('features loaded', features)
                return features
            } else {
                // pre-converted JSON output from create_network.py
                const jsonNetwork = await this.fileApi.getFileJson(
                    this.myState.subfolder + '/' + this.vizDetails.network
                )

                // geojson is ALWAYS in long/lat
                this.vizDetails.projection = 'EPSG:4326'

                return jsonNetwork
            }
        },

        incrementLoadProgress() {
            this.loadSteps += 1
            this.loadProgress = (100 * this.loadSteps) / this.totalLoadSteps
        },

        async fetchNetwork(path: string, vizDetails: any) {
            return new Promise<NetworkLinks>((resolve, reject) => {
                const thread = new RoadNetworkLoader()
                try {
                    thread.postMessage({
                        filePath: path,
                        fileSystem: this.fileSystem,
                        vizDetails,
                    })

                    thread.onmessage = e => {
                        // perhaps network has no CRS and we need to ask user
                        if (e.data.promptUserForCRS) {
                            let crs =
                                prompt('Enter the coordinate reference system, e.g. EPSG:25832') || 'EPSG:31468'

                            if (Number.isFinite(parseInt(crs))) crs = `EPSG:${crs}`

                            thread.postMessage({ crs })
                            return
                        }

                        if (e.data.status) {
                            this.myState.statusMessage = '' + e.data.status
                            return
                        }

                        // normal exit
                        thread.terminate()

                        if (e.data.error) {
                            console.error(e.data.error)
                            globalStore.commit('error', e.data.error)
                            this.myState.statusMessage = e.data.error
                            reject(e.data.error)
                        }
                        resolve(e.data.links)
                    }
                } catch (err) {
                    thread.terminate()
                    console.error(err)
                    reject(err)
                }
            })
        },


        handleDiscreteTimeValues(timeUpdate: { extent: number; index: number }) {
            this.selectedHour = timeUpdate.extent / 3600
            console.log('Selected hour updated:', this.selectedHour)
        },

        async loadBoundaries() {
            const shapeConfig =
                this.config.boundaries ||
                this.config.shapes ||
                this.config.geojson ||
                this.config.network ||
                this.config.features

            if (!shapeConfig) return

            // shapes could be a string or an object: shape.file=blah
            let filename: string = this.config.features ? 'shapes' : shapeConfig.file || shapeConfig

            let featureProperties = [] as any[]
            let boundaries: any[]

            try {
                this.statusText = 'Loading features...'
                this.incrementLoadProgress()
                // avro network!
                console.log('--AVRO')
                boundaries = await this.loadNetwork()

                await this.$nextTick()
                this.statusText = 'Processing data...'
                this.incrementLoadProgress()
                await this.$nextTick()
                await this.$nextTick()

                let hasNoLines = true
                let hasNoPolygons = true
                let hasPoints = false

                // for a big speedup, move properties to its own nabob
                boundaries.forEach(b => {
                    const properties = b.properties ?? {}
                    // geojson sometimes has "id" outside of properties:
                    if ('id' in b) properties.id = b.id
                    // create a new properties object for each row;
                    // push this new property object to the featureProperties array
                    featureProperties.push({ ...properties })
                    // clear out actual feature properties; they are now in featureProperties instead
                    b.properties = {}

                    // points?
                    if (b.geometry.type == 'Point' || b.geometry.type == 'MultiPoint') {
                        hasPoints = true
                    }

                    // check if we have linestrings: network mode !
                    if (
                        hasNoLines &&
                        (b.geometry.type == 'LineString' || b.geometry.type == 'MultiLineString')
                    ) {
                        hasNoLines = false
                    }

                    // check if we have polygons: area-map mode !
                    if (
                        hasNoPolygons &&
                        (b.geometry.type == 'Polygon' || b.geometry.type == 'MultiPolygon')
                    ) {
                        hasNoPolygons = false
                    }
                })

                // set feature properties as a data source
                // await this.setFeaturePropertiesAsDataSource(filename, [...featureProperties], shapeConfig)
                this.incrementLoadProgress()

                // hide polygon/point buttons and opacity if we have no polygons or we do have points
                if (hasPoints || !hasNoPolygons) this.isAreaMode = true

                this.statusText = 'Adding boundaries to map'
                await this.$nextTick()
                this.incrementLoadProgress()

                this.boundaries = boundaries
                this.incrementLoadProgress()

                // generate centroids if we have polygons
                // if (!hasNoPolygons || hasPoints) {
                //   await this.generateCentroidsAndMapCenter()
                // }

                // Need to wait one tick so Vue inserts the Deck.gl view AFTER center is calculated
                // (not everyone lives in Berlin)
                // await this.$nextTick()
            } catch (e) {
                const err = e as any
                const message = err.statusText || 'Could not load'
                const fullError = `${message}: "${filename}"`
                this.statusText = ''
                this.$emit('isLoaded')
                throw Error(fullError)
            }

            if (!this.boundaries || this.boundaries.length === 0) {
                throw Error(`No "features" found in shapes file`)
            }
        },

        async handleClickEvent(event: any) {
            if (event.index != -1) {
                let offset = event?.object?.feature_idx || -1
                this.cbTooltip(offset, event, true)
                this.tooltipIsFixed = true
                this.highlightedLinkIndex = event.index
            } else {
                this.tooltipIsFixed = false
                this.highlightedLinkIndex = -1
                this.tooltipHtml = ''
            }
        },


        clearTooltip() {
            if (this.wantToClearTooltip && this.highlightedLinkIndex == -1) {
                this.tooltipHtml = ''
            }
        },

        cbTooltip(index: number, object: any, forceUpdate: boolean = false) {
            if (this.tooltipIsFixed && !forceUpdate) return

            if (object === null || !this.boundaries[index]?.properties) {
                this.wantToClearTooltip = true
                this.dbClearTooltip()
                return
            }

            // tooltip will show values for color settings and for width settings.
            // if there is base data, it will also show values and diff vs. base
            // for both color and width.

            this.wantToClearTooltip = false
            const PRECISION = 4
            let propList = []

            // If user DID NOT provide any tooltip settings, show some useful things:
            if (!this.vizDetails.tooltip?.length) {
                // normalized value first
                if (this.dataNormalizedValues) {
                    const label = this.dataCalculatedValueLabel || 'Normalized Value'
                    let value = this.truncateFractionalPart(this.dataNormalizedValues[index], PRECISION)
                    propList.push(
                        `<tr><td style="text-align: right; padding-right: 0.5rem;">${label}</td><td><b>${value}</b></td></tr>`
                    )
                }
                // calculated value
                if (this.dataCalculatedValues) {
                    let cLabel = this.dataCalculatedValueLabel || 'Value'
                    const label = this.dataNormalizedValues
                        ? cLabel.substring(0, cLabel.lastIndexOf('/'))
                        : cLabel
                    let value = this.truncateFractionalPart(this.dataCalculatedValues[index], PRECISION)
                    if (this.dataCalculatedValueLabel.startsWith('%')) value = `${value} %`
                    propList.push(
                        `<tr><td style="text-align: right; padding-right: 0.5rem;">${label}</td><td><b>${value}</b></td></tr>
            <tr><td>&nbsp;</td></tr>`
                    )
                }
            }

            // --- dataset tooltip lines ---
            let datasetProps = ''
            const featureTips = Object.entries(this.boundaries[index].properties)

            for (const [tipKey, tipValue] of featureTips) {
                if (tipValue === null) continue

                // Truncate fractional digits IF it is a simple number that has a fraction
                let value = this.truncateFractionalPart(tipValue, PRECISION)
                datasetProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${tipKey}</td><td><b>${value}</b></td></tr>`
            }
            if (datasetProps) propList.push(datasetProps)

            // --- boundary feature tooltip lines ---
            let columns
            if (this.tooltipDesiredColumns.length) {
                columns = this.tooltipDesiredColumns.filter(m => m.enabled).map(m => m.col)
            } else {
                columns = Object.keys(this.boundaryDataTable)
            }

            // dont show nodes or coordinates
            const hide = new Set(['id', 'from', 'to', 'source', 'dest', 'nodeCoordinates', 'nodeId'])
            columns = columns.filter(m => !hide.has(m))

            if (this.vizDetails.tooltip?.length) {
                const delim = this.vizDetails.tooltip[0].indexOf(':') > -1 ? ':' : '.'
                columns = this.vizDetails.tooltip.map(tip => tip.substring(tip.indexOf(delim) + 1))
            }

            // nice sort order puts useful network fields at the top
            const sortColumns = ['id', 'from', 'to', ...columns]

            let featureProps = ''
            sortColumns.forEach(column => {
                if (this.boundaryDataTable[column]) {
                    let value = this.boundaryDataTable[column].values[index]
                    if (value == null) return
                    if (typeof value == 'number') value = this.truncateFractionalPart(value, PRECISION)
                    featureProps += `<tr><td style="text-align: right; padding-right: 0.5rem;">${column}</td><td><b>${value}</b></td></tr>`
                }
            })
            if (featureProps) propList.push(featureProps)

            // nothing to show? no tooltip
            if (!propList.length) {
                this.tooltipHtml = ''
                return
            }

            let finalHTML = propList.join('')
            const html = `<table>${finalHTML}</table>`
            this.tooltipHtml = html
        },

        async calculateAndMoveToCenter() {
            let centerLong = 0
            let centerLat = 0
            let numCoords = 0
            const numFeatures = this.boundaries.length

            for (let idx = 0; idx < numFeatures; idx += 256) {
                try {
                    const centroid = turf.centerOfMass(this.boundaries[idx])
                    if (centroid?.geometry?.coordinates) {
                        centerLong += centroid.geometry.coordinates[0]
                        centerLat += centroid.geometry.coordinates[1]
                        numCoords += 1
                    }
                } catch (e) {
                    // who cares
                }
            }

            centerLong /= numCoords
            centerLat /= numCoords
            let zoom = 9

            console.log('--- CALCULATED CENTER', centerLong, centerLat)
            // console.log('SMC: calculateAndMoveToCenter')
            if (centerLong == undefined || centerLat == undefined) {
                centerLong = 30
                centerLat = 30
                zoom = 5
            }

            const view = {
                center: [centerLong, centerLat],
                bearing: 0,
                pitch: 0,
                zoom,
            } as any
            this.initialView = view

            if (!this.vizDetails.mapIsIndependent) {
                this.$store.commit('setMapCamera', view)
            }
        },

        // this will only round a number if it is a plain old regular number with
        // a fractional part to the right of the decimal point.
        truncateFractionalPart(value: any, precision: number) {
            if (typeof value !== 'number') return value

            let printValue = '' + value
            if (printValue.includes('.') && printValue.indexOf('.') === printValue.lastIndexOf('.')) {
                if (/\d$/.test(printValue))
                    return printValue.substring(0, 1 + precision + printValue.lastIndexOf('.')) // precise(value, precision)
            }
            return value
        },

        async generateCentroidsAndMapCenter() {
            this.statusText = 'Calculating centroids...'
            await this.$nextTick()
            const idField = this.config?.shapes?.join || 'id'

            // Find the map center while we're here
            let centerLong = 0
            let centerLat = 0
            let count = 0

            for (const feature of this.boundaries) {
                let centroid = {} as any
                try {
                    centroid = turf.centerOfMass(feature as any)
                } catch (e) {
                    console.warn('no coordinates:')
                    console.warn(feature)
                    continue
                }

                if (!centroid.properties) centroid.properties = {}

                if (feature.properties[this.config.boundariesLabel]) {
                    centroid.properties.label = feature.properties[this.config.boundariesLabel]
                }

                centroid.properties.id = feature.properties[idField]
                if (centroid.properties.id === undefined) centroid.properties.id = feature[idField]

                this.centroids.push(centroid)

                if (centroid.geometry) {
                    centerLong += centroid.geometry.coordinates[0]
                    centerLat += centroid.geometry.coordinates[1]
                    count++
                }
            }

            centerLong /= count
            centerLat /= count

            console.log('CENTER', centerLong, centerLat)
            if (this.needsInitialMapExtent && !this.vizDetails.center) {
                this.$store.commit('setMapCamera', {
                    center: [centerLong, centerLat],
                    bearing: 0,
                    pitch: 0,
                    zoom: 9,
                    initial: true,
                })
                this.needsInitialMapExtent = false
            }
        },

        updateLegendColors() { },

        async buildThumbnail() {
            if (this.thumbnail && this.vizDetails.thumbnail) {
                try {
                    const blob = await this.fileApi.getFileBlob(
                        this.myState.subfolder + '/' + this.vizDetails.thumbnail
                    )
                    const buffer = await readBlob.arraybuffer(blob)
                    const base64 = arrayBufferToBase64(buffer)
                    if (base64)
                        this.thumbnailUrl = `center / cover no-repeat url(data:image/png;base64,${base64})`
                } catch (e) {
                    console.error(e)
                }
            }
        },


    },

    async mounted() {

        this.dbClearTooltip = debounce(this.clearTooltip, 1000)


        globalStore.commit('setFullScreen', !this.thumbnail)
        this.buildRouteFromUrl()

        this.myState.thumbnail = this.thumbnail
        this.myState.subfolder = this.subfolder

        // if (!this.yamlConfig) {
        //     console.log(this.yamlConfig, this.yamlConfig)

        // } else {
        //     this.myState.yamlConfig = this.yamlConfig
        // }
        await this.getVizDetails()

        if (this.vizDetails.center && typeof this.vizDetails.center === 'string') {
            this.vizDetails.center = this.vizDetails.center
                //@ts-ignore
                .split(',')
                .map((coord: any) => parseFloat(coord))
            this.config.center = this.config.center.split(',').map((coord: any) => parseFloat(coord))
        }
        // sometimes user doesn't use long/lat
        if (
            this.config.center &&
            (Math.abs(this.config.center[0]) > 180 || Math.abs(this.config.center[1]) > 90)
        ) {
            this.$emit(
                'error',
                `Invalid map center, doesn't look like longitude/latitude: ${this.config.center}`
            )
            const initialView = this.globalState.viewState
            this.vizDetails.center = [initialView.longitude, initialView.latitude]
            this.config.center = [initialView.longitude, initialView.latitude]
            this.vizDetails.zoom = initialView.zoom
            this.config.zoom = initialView.zoom
        }
        await this.$nextTick() // update UI update before network load begins
        await this.loadAndPrepareData()

        // if we have a USER-SUPPLIED center, move there now
        // (otherwise we will calc it after the shapes are loaded)
        if (this.needsInitialMapExtent && this.vizDetails.center) {
            this.needsInitialMapExtent = false
            const view = {
                center: this.vizDetails.center,
                zoom: this.vizDetails.zoom || 9,
                bearing: this.vizDetails.bearing || 0,
                pitch: this.vizDetails.pitch || 0,
                initial: true,
            } as any

            if (this.vizDetails.mapIsIndependent) {
                this.initialView = view
            } else {
                this.$store.commit('setMapCamera', view)
            }
        }
        await this.loadBoundaries()

        // console.log('data', this.data)
        // this.data = []
        if (this.needsInitialMapExtent && !this.vizDetails.center) {
            await this.calculateAndMoveToCenter()
            this.needsInitialMapExtent = false
        }
        await this.$nextTick()
        console.log('about to set isLoaded, boundaries:', this.boundaries.length)

        this.isLoaded = true
        this.$emit('isLoaded')
        this.showLegend = true
    },

    beforeDestroy() {

        this.selectedLinkTraversals.clear();
        this.queriedAgents.clear();

        // Close DuckDB connections and databases
        if (this.conn) {
            this.conn.close().catch(console.error);
        }
        if (this.db) {
            this.db.terminate().catch(console.error);
        }
        if (this.dbCsv) {
            this.dbCsv.close().catch(console.error);
        }
        if (this.worker) {
            this.worker.terminate();
        }

        // Clean up other resources
        // delete window.__testdata__;
        this.data = [];
        this.guiController?.destroy();
        this.$store.commit('setFullScreen', false);
        //@ts-ignore
        delete window.__testdata__

        this.data = []
        this.guiController?.destroy()

        this.$store.commit('setFullScreen', false)
    },
})

export default SelectLinkAnalysis
</script>

<style lang="scss" scoped>
*::-webkit-scrollbar {
    width: 10px;
}

.select-link-viewer {
    position: absolute;
    top: 0;
    bottom: 0;
    pointer-events: none;
}

.container-1 {
    display: grid;
    height: 100%;
    grid-template-columns: 1fr auto auto;
    grid-template-rows: 1fr;
    pointer-events: auto;
    height: 100%;
}

// .select-link-viewer.hide-thumbnail {
//     background: none;
// }

.main-panel {
    position: relative;
    // flex: 1;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    background-color: var(--bgBold);
    height: 100%;
    z-index: 0;
}

.query-info {
    // position: absolute;
    margin-top: 0.5rem;
    margin-left: 0.5rem;
    // background-color: var(--bgCardFrame);
    padding: 0.25rem 0.5rem;
    // border-radius: 4px;
    border: #FFF 1px solid;
    // font-size: 0.8rem;
    // z-index: 2;
}

.filter-box {
    // position: absolute;
    margin-top: 0.5rem;
    margin-left: 0.5rem;
    // background-color: var(--bgCardFrame);
    padding: 0.25rem 0.5rem;
    // border-radius: 4px;
    border: #FFF 1px solid;
    // font-size: 0.8rem;
    // z-index: 2;
}


.agent-list {
    // margin-top: 1rem;
    // padding: 0.5rem;
    padding: 0 0.5rem;
    bottom: 0;
    background-color: var(--bgCardFrame);
    border-radius: 4px;
    position: absolute;
    height: 30%;
}

.agent-list.scrolly {
    width: 100%;
    max-height: 40%;
    /* or whatever height you want */
    overflow: auto;
    /* enables scrolling if content overflows */
    //   border: 1px solid #ddd;
    //   border-radius: 4px;
    //   padding: 8px;
    box-sizing: border-box;
}

.agent-list.scrolly.p.b {
    top: 0;
}


.agent-table {
    width: 100%;
    border-collapse: collapse;
    // table-layout: fixed;
}

.agent-table th,
.agent-table td {
    border: 1px solid #ddd;
    padding: 8px;
    text-align: left;
    word-wrap: break-word;
}

.agent-table th {
    background-color: #f2f2f2;
    position: sticky;
    top: 0;
}

.agent-list.scrolly .agent-header {
    font-weight: bold;
    margin-bottom: 0.5rem;
    color: var(--text);
    position: sticky;
    top: 0;
}

.new-rightside-info-panel {
    // grid-row: 1 / 2;
    grid-column: 3;
    background-color: var(--bgCardFrame);
    position: relative;
    height: 100%;
    z-index: 1;

    .legend-panel {
        position: absolute;
        top: 2px;
        left: 0;
        right: 0;
        bottom: 0;
        display: flex;
        flex-direction: column;
        background-color: var(--bgCardFrame);

        .description {
            margin-top: 0.5rem;
        }
    }

    .tooltip-html {
        font-size: 0.8rem;
        padding: 0.25rem;
        text-align: left;
        background-color: var(--bgCardFrame);
        position: absolute;
        bottom: 0;
        left: 0;
        right: 0;
        border-top: 1px solid #88888880;
        max-height: 50%;
    }
}

.time-slider-area {
    position: absolute;
    bottom: 0.5rem;
    left: 0;
    right: 0;
    margin: 0 9rem 0 0.5rem;
    z-index: 2;
}

.button-group {
    margin-left: 5px;
    display: flex;
    gap: 8px;
}

.button-toggle {
    padding: 4px 8px;
    border: 1px solid #ccc;
    border-radius: 2px;
    background: #f9f9f9;
    cursor: pointer;
    transition: all 0.2s;
    font-size: 0.9rem;
    color: #333;
}

.button-toggle:hover {
    background: #e9e9e9;
}

.button-toggle.button-active {
    background: #007bff;
    color: white;
    border-color: #007bff;
}
</style>
