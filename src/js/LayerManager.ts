import DeckMap from './DeckMap'
import globalStore from '@/store'

export default class LayerManager {
  layers: any
  deckInstance: any

  constructor() {
    this.layers = {}
    this.deckInstance = null
  }

  init(deckProps: any) {
    this.deckInstance = new DeckMap({ ...deckProps, map: '' })
    if (deckProps.mapStyle !== null) {
      const style = globalStore.getters.mapStyle
      this.deckInstance.setMapStyle(style)
    }
  }

  destroy() {
    if (!this.deckInstance) return
    this.deckInstance.finalize()
    delete this.deckInstance
  }

  hasLayer(id: string) {
    return !!this.layers[id]
  }

  getLayers() {
    return this.layers
  }

  isVisible(id: string) {
    // visible = undefined is treated by deckgl as visible = true
    return this.layers[id] && this.layers[id].props.visible !== false
  }

  updateDeckInstance() {
    if (!this.deckInstance) return

    const layers = [...Object.values(this.layers)]
    this.deckInstance.setProps({ layers })
  }

  updateStyle() {
    if (!this.deckInstance) return

    const style = globalStore.getters.mapStyle
    this.deckInstance.setMapStyle(style)
  }

  addLayer(layer: { id: string }) {
    if (!layer.id) {
      throw new Error(
        `[layerManager.addLayer] layer id must defined. Received "${layer.id}" instead`
      )
    }
    this.layers[layer.id] = layer
    this.updateDeckInstance()
  }

  updateLayer(id: string, props: any) {
    if (!this.layers[id]) return

    const layer = this.layers[id]
    this.layers[id] = layer.clone(props)
    this.updateDeckInstance()
  }

  removeLayer(id: string) {
    if (this.hasLayer(id)) {
      delete this.layers[id]
      this.updateDeckInstance()
    }
  }

  hideLayer(id: string) {
    if (this.hasLayer(id)) {
      this.updateLayer(id, { visible: false })
    }
  }

  showLayer(id: string) {
    if (this.hasLayer(id)) {
      this.updateLayer(id, { visible: true })
    }
  }

  takeScreenshot() {
    this.deckInstance.takeScreenshot()
  }
}
