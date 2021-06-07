// BILLY:  this file comes almost wholesale from the Carto demo example project.
// There is no license file on that project!

import { Deck } from '@deck.gl/core'
import mapboxgl from 'mapbox-gl'

import globalStore from '@/store'
import { MAP_STYLES } from '@/Globals'

const DEFAULT_MAP_PROPS = {
  layers: [],
  mapStyle: globalStore.state.isDarkMode ? MAP_STYLES.dark : MAP_STYLES.light,
  // initialViewState: {
  //   longitude: 13.5,
  //   latitude: 52.5,
  //   zoom: 5,
  // },
  controller: true,
  useDevicePixels: 2,
  getCursor: ({ isDragging, isHovering }: any) =>
    isDragging ? 'grabbing' : isHovering ? 'pointer' : '',
}

const CANVAS_STYLE = {
  position: 'absolute',
  left: 0,
  top: 0,
  width: '100%',
  height: '100%',
}

const TOOLTIP_STYLE = {
  color: '#fff',
  opacity: '0.9',
  borderRadius: '0.25rem',
  textTransform: 'capitalize',
  //   fontFamily: 'Montserrat, "Open Sans", sans-serif',
  fontSize: '0.7rem',
}

function getTooltip(pickingInfo: any) {
  if (pickingInfo.object) {
    let html = `<div style="font-size: 0.9rem;"><strong>${pickingInfo.layer.id}</strong></div>`

    for (const [name, value] of Object.entries(pickingInfo.object.properties)) {
      if (name !== 'layerName' && name !== 'cartodb_id') {
        html += `<div><strong>${name}: </strong>${value}</div>`
      }
    }

    return {
      html,
      style: TOOLTIP_STYLE,
    }
  }
  return null
}

// Create canvas elements for mapbox and deck
function createCanvas(props: any) {
  let { container = document.body } = props

  if (typeof container === 'string') {
    container = document.querySelector(container)
  }

  if (!container) {
    throw new Error('[DeckMap] container not found')
  }

  const containerStyle = window.getComputedStyle(container)
  if (containerStyle.position === 'static') {
    container.style.position = 'relative'
  }

  const mapboxCanvas = document.createElement('div')
  container.appendChild(mapboxCanvas)
  Object.assign(mapboxCanvas.style, CANVAS_STYLE)

  const deckCanvas = document.createElement('canvas')
  deckCanvas.oncontextmenu = () => false // this disables right click on map
  container.appendChild(deckCanvas)
  Object.assign(deckCanvas.style, CANVAS_STYLE)

  return { container, mapboxCanvas, deckCanvas }
}

/**
 * @params container (Element) - DOM element to add deck.gl canvas to
 * @params map (Object) - map API. Set to falsy to disable
 */
export default class DeckMap extends Deck {
  constructor(props = {} as any) {
    props = {
      ...DEFAULT_MAP_PROPS,
      onResize: () => {
        if (this._map) {
          this._map.resize()
        }
      },
      ...props,
    }
    const { mapboxCanvas, deckCanvas } = createCanvas(props)

    const viewState = props.viewState // || props.initialViewState
    const basemap = props.basemap

    super({ canvas: deckCanvas, ...props })

    if (basemap) {
      this._map = basemap
    } else {
      this._map = new mapboxgl.Map({
        container: mapboxCanvas,
        style: props.mapStyle,
        interactive: false,
        center: [viewState.longitude, viewState.latitude],
        zoom: viewState.zoom,
        bearing: viewState.bearing || 0,
        pitch: viewState.pitch || 0,
      })
    }

    // Update base map
    this._onBeforeRender = (params: any) => {
      this.onBeforeRender(params)
      if (this._map) {
        const viewport = this.getViewports()[0]
        this._map.jumpTo({
          center: [viewport.longitude, viewport.latitude],
          zoom: viewport.zoom,
          bearing: viewport.bearing,
          pitch: viewport.pitch,
        })
        this.redrawMapbox()
      }
    }
  }

  // code taken from here: https://github.com/visgl/react-map-gl/blob/ce6f6662ca34f8765cf0f515039e316adb52a957/src/mapbox/mapbox.js#L421
  // Force redraw the map now. Typically resize() and jumpTo() is reflected in the next
  // render cycle, which is managed by Mapbox's animation loop.
  // This removes the synchronization issue caused by requestAnimationFrame.
  redrawMapbox() {
    const map = this._map
    // map._render will throw error if style does not exist
    // https://github.com/mapbox/mapbox-gl-js/blob/fb9fc316da14e99ff4368f3e4faa3888fb43c513/src/ui/map.js#L1834
    if (map.style) {
      // cancel the scheduled update
      if (map._frame) {
        map._frame.cancel()
        map._frame = null
      }
      // the order is important - render() may schedule another update
      map._render()
    }
  }

  getMapboxMap() {
    return this._map
  }

  finalize() {
    if (this._map) {
      this._map.remove()
    }
    super.finalize()
  }

  setProps(props: any) {
    // Replace user callback with our own
    // `setProps` is first called in parent class constructor
    // During which this._onBeforeRender is not defined
    // It is called a second time in _onRendererInitialized with all current props
    if (
      'onBeforeRender' in props &&
      this._onBeforeRender &&
      props.onBeforeRender !== this._onBeforeRender
    ) {
      this.onBeforeRender = props.onBeforeRender
      props.onBeforeRender = this._onBeforeRender
    }

    super.setProps(props)
  }
}
