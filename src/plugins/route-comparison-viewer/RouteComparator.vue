<template lang="pug">
.route-comparator-map-view(:class="{'hide-thumbnail': !thumbnail}" oncontextmenu="return false" :id="`id-${id}`")

    MapComponent(
        v-if="!thumbnail"
        v-bind="mapProps"

    )

    //- .tooltip(v-if="tooltip" v-html="tooltip.html" :style="tooltip.style")

</template>

<script lang="ts">
import Vue from 'vue'
import { defineComponent } from 'vue'
import type { PropType } from 'vue'

import GUI from 'lil-gui'
import { ToggleButton } from 'vue-js-toggle-button'
import YAML from 'yaml'
import colormap from 'colormap'

import avro from '@/js/avro'
import globalStore from '@/store'
import util from '@/js/util'
import { hexToRgb, getColorRampHexCodes, Ramp } from '@/js/ColorsAndWidths'

import { ColorScheme, FileSystemConfig, Status } from '@/Globals'
import HTTPFileSystem from '@/js/HTTPFileSystem'
import Coords from '@/js/Coords'

import MapComponent from './MapComponent.vue'
import DashboardDataManager from '@/js/DashboardDataManager'
import CollapsiblePanel from '@/components/CollapsiblePanel.vue'
import DrawingTool from '@/components/DrawingTool/DrawingTool.vue'
import ZoomButtons from '@/components/ZoomButtons.vue'
import BackgroundLayers from '@/js/BackgroundLayers'


interface VizDetail {
    colorRamp: any
    title: string
    description?: string
    file: string
    projection: any
    thumbnail?: string
    elements?: string
    buildings3d?: boolean
    show3dBuildings?: boolean
    cellSize: number
    maxHeight: number
    userColorRamp: string
    opacity: number
    center: any
    zoom: number
    mapIsIndependent?: boolean
    breakpoints?: string
}

interface StandaloneYAMLconfig {
    title: String
    description: String
    file: String
    projection: String
    thumbnail: String
    cellSize: number
    opacity: number
    maxHeight: number
    userColorRamp: string
    center: number[]
    zoom: number
    mapIsIndependent: boolean
}

interface MapProps {
    viewId: number
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


const RouteComparator = defineComponent({
    name: 'GridMapPlugin',
    i18n,
    components: {
        CollapsiblePanel,
        DrawingTool,
        MapComponent,
        ToggleButton,
        ZoomButtons,
    },

    props: {
        root: { type: String, required: true },
        subfolder: { type: String, required: true },
        yamlConfig: String,
        config: Object,
        thumbnail: Boolean,
        datamanager: { type: Object as PropType<DashboardDataManager> },
    },

    data() {
        return {
            // mymap: null as maplibregl.Map | null,
            // deckOverlay: null as InstanceType<typeof MapboxOverlay> | null,
            clearTooltip: null as any,
            tooltipHTML: '',
            origin: [0, 0] as [number, number],
            destination: [0, 0] as [number, number],
            tooltipStyle: {
                padding: '4px 8px',
                display: 'block',
                top: 0,
                left: 0,
            } as any,
            id: Math.floor(1e12 * Math.random()),
            // standaloneYAMLconfig: {
            //     title: '',
            //     description: '',
            //     file: '',
            //     projection: '',
            //     thumbnail: '',
            //     cellSize: 250,
            //     opacity: 0.7,
            //     maxHeight: 0,
            //     userColorRamp: 'Viridis',
            //     center: null as any,
            //     zoom: 9,
            //     mapIsIndependent: false,
            // } as StandaloneYAMLconfig,
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

        // urlThumbnail(): any {
        //     return this.thumbnailUrl
        // },

        mapProps(): MapProps {
            //@ts-ignore
            window.__testdata__ = this.data

            return {
                viewId: this.id,

            }
        },
    }

})

export default RouteComparator
</script>

<style scoped lang="scss">
@import '@/styles.scss';

.grid-map-view {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 0;
    right: 0;
    display: flex;
    flex-direction: column;
    min-height: $thumbnailHeight;
    background: url('assets/thumbnail.jpg') center / cover no-repeat;
    z-index: -1;
}

.grid-map-view.hide-thumbnail {
    background: none;
    z-index: 0;
}
</style>
