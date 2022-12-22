// BILLY:  this file comes almost wholesale from the Carto demo example project.
// There is no license file on that project!

import { Deck } from '@deck.gl/core'
import maplibregl from 'maplibre-gl'

import globalStore from '@/store'
import { ColorScheme } from '@/Globals'

const DEFAULT_MAP_PROPS = {
  layers: [],
  mapStyle: globalStore.getters.mapStyle,
  controller: true,
  screenshotFilename: '',
  useDevicePixels: false, // don't need 4X retina pixels!
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
  fontSize: '0.7rem',
  position: 'absolute',
  top: 50,
  left: 50,
  backgroundColor: globalStore.state.colorScheme === ColorScheme.DarkMode ? 'black' : 'white',
  //   fontFamily: 'Montserrat, "Open Sans", sans-serif',
}

function getTooltip(pickingInfo: any) {
  // console.log(pickingInfo)
  if (!pickingInfo.object) return

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
  deckCanvas.width = window.innerWidth
  deckCanvas.height = window.innerHeight

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
      onAfterRender: () => {
        if (this.props.screenshotFilename) {
          this.savePNGcallback()
          this.props.screenshotFilename = ''
        }
      },
      ...props,
    }
    const { mapboxCanvas, deckCanvas } = createCanvas(props)

    const viewState = props.viewState
    const basemap = props.basemap

    super({ canvas: deckCanvas, ...props })

    if (basemap) {
      this._map = basemap
    } else {
      this._map = new maplibregl.Map({
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

  setMapStyle(style: string) {
    if (this._map) this._map.setStyle(style)
  }

  getMapboxMap() {
    return this._map
  }

  finalize() {
    if (this._map) this._map.remove()
    this._map = null

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

  takeScreenshot() {
    // set useDevicePixels:true before screenshot, or screenshot dimensions
    // are 2X wrong on HiDPI screens
    this.props.useDevicePixels = true
    this.props.screenshotFilename = 'screenshot1.png'
    this.redraw()
  }

  savePNGcallback() {
    // convert deck+map to image URL
    const backgroundMap = this._map._canvas.toDataURL('image/png')
    const deckLayer = this.canvas.toDataURL('image/png')

    // merge images together with watermark
    const mergedImage = this.mergeImageURIs({
      width: this.canvas.width,
      height: this.canvas.height,
      imageDataURLs: [backgroundMap, deckLayer],
    })

    // set useDevicePixels back to off, after screenshot is taken
    this.props.useDevicePixels = false

    mergedImage.then(image => {
      var element = document.createElement('a')
      element.setAttribute('href', image)
      element.setAttribute('download', 'screenshot.png')
      element.style.display = 'none'
      document.body.appendChild(element)

      element.click()

      document.body.removeChild(element)
    })
  }

  // copypasta from
  // https://stackoverflow.com/questions/32096540/merge-two-datauris-to-create-a-single-image
  mergeImageURIs(props: { width: number; height: number; imageDataURLs: string[] }) {
    return new Promise<any>((resolve, reject) => {
      var canvas = document.createElement('canvas')
      canvas.width = props.width
      canvas.height = props.height

      Promise.all(props.imageDataURLs.map(dataURL => this.add2canvas(canvas, dataURL))).then(() => {
        // add watermark
        const ctx = canvas.getContext('2d') as any
        const boxLeft = canvas.width - 152
        const boxTop = canvas.height - 8
        ctx.beginPath()
        ctx.rect(boxLeft - 4, boxTop - 14, 158, 22)
        ctx.fillStyle = '#ffffff44'
        ctx.fill()
        ctx.font = '11px Arial'
        ctx.fillStyle = '#888'
        ctx.fillText('© Mapbox  © OpenStreetMap', boxLeft, boxTop)

        // return final dataURL with fully-built image
        resolve(canvas.toDataURL('image/png'))
      })
    })
  }

  add2canvas(canvas: any, dataURL: string) {
    return new Promise((resolve, reject) => {
      if (!canvas) reject()
      if (!dataURL) reject()

      var image = new Image()

      image.onload = function () {
        canvas.getContext('2d').drawImage(this, 0, 0)
        resolve(true)
      }
      image.src = dataURL
    })
  }
}
