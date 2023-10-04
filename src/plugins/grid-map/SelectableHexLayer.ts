import { HexagonLayer } from '@deck.gl/aggregation-layers'
import { ColumnLayer } from '@deck.gl/layers'

export default class SelectableHexagonLayer extends HexagonLayer {
  constructor(...args: any) {
    super(...args)
  }

  renderLayers() {
    const {
      selectedHexStats,
      elevationScale,
      extruded,
      coverage,
      material,
      transitions,
    } = this.props
    const { angle, radius, cpuAggregator, vertices } = this.state

    const SubLayerClass = this.getSubLayerClass('hexagon-cell', ColumnLayer)
    const updateTriggers = this._getSublayerUpdateTriggers()

    const geometry = vertices && vertices.length ? { vertices, radius: 1 } : { radius, angle }
    return new SubLayerClass(
      {
        ...geometry,
        diskResolution: 6,
        elevationScale,
        extruded,
        coverage,
        material,
        getElevation: this._onGetSublayerElevation.bind(this),
        transitions: transitions && {
          getFillColor: transitions.getColorValue || transitions.getColorWeight,
          getElevation: transitions.getElevationValue || transitions.getElevationWeight,
        },
        getFillColor: (d: any) => {
          if (selectedHexStats && selectedHexStats.selectedHexagonIds.indexOf(d.index) > -1) {
            return [255, 64, 255]
          }
          return this._onGetSublayerColor.bind(this)(d)
        },
      },
      this.getSubLayerProps({
        id: 'hexagon-cell',
        updateTriggers,
      }),
      {
        data: cpuAggregator.state.layerData.data,
      }
    )
  }
}
