import { GeoJsonLayer } from '@deck.gl/layers'
import PathOffsetLayer from '@/layers/PathOffsetLayer'
import { forwardProps } from '@/../node_modules/@deck.gl/layers/src/geojson-layer/sub-layer-map'

const OFFSET_TYPE = {
  NONE: 0,
  LEFT: 1,
  RIGHT: 2,
}

export const LINE_LAYER = {
  type: PathOffsetLayer,
  props: {
    lineWidthUnits: 'widthUnits',
    lineWidthScale: 'widthScale',
    lineWidthMinPixels: 'widthMinPixels',
    lineWidthMaxPixels: 'widthMaxPixels',
    lineJointRounded: 'jointRounded',
    lineCapRounded: 'capRounded',
    lineMiterLimit: 'miterLimit',
    lineBillboard: 'billboard',
    getLineColor: 'getColor',
    getLineWidth: 'getWidth',
  },
}

export default class GeojsonOffsetLayer extends GeoJsonLayer {
  constructor(props: any) {
    super(props)
  }

  // this is copied directly from @deck.gl/layers/geojson-layer
  _renderLineLayers() {
    const { extruded, stroked } = this.props
    const { layerProps } = this.state
    const polygonStrokeLayerId = 'polygons-stroke'
    const lineStringsLayerId = 'linestrings'

    const PolygonStrokeLayer =
      !extruded &&
      stroked &&
      this.shouldRenderSubLayer(polygonStrokeLayerId, layerProps.polygonsOutline.data) &&
      this.getSubLayerClass(polygonStrokeLayerId, LINE_LAYER.type)
    const LineStringsLayer =
      this.shouldRenderSubLayer(lineStringsLayerId, layerProps.lines.data) &&
      this.getSubLayerClass(lineStringsLayerId, LINE_LAYER.type)

    if (PolygonStrokeLayer || LineStringsLayer) {
      const forwardedProps = forwardProps(this, LINE_LAYER.props)

      return [
        PolygonStrokeLayer &&
          new PolygonStrokeLayer(
            forwardedProps,
            this.getSubLayerProps({
              id: polygonStrokeLayerId,
              updateTriggers: forwardedProps.updateTriggers,
            }),
            layerProps.polygonsOutline
          ),

        LineStringsLayer &&
          new LineStringsLayer(
            forwardedProps,
            this.getSubLayerProps({
              id: lineStringsLayerId,
              updateTriggers: forwardedProps.updateTriggers,
            }),
            layerProps.lines
          ),
      ]
    }
    return null
  }

  getShaders() {
    return {
      ...super.getShaders(),
      inject: {
        'vs:#decl': `
            attribute float instanceOffset;
            varying float offset;
            `,
        'vs:#main-start': `
            offset = instanceOffset;
            `,
        'fs:#decl': `
            varying float offset;
            `,
        'fs:#main-start': `
            if (offset == 1.0 && vPathPosition.x < 0.0) {
                discard;
            }
            if (offset == 2.0 && vPathPosition.x > 0.0) {
                discard;
            }
            if (offset == 0.0 && abs(vPathPosition.x) > 0.5) {
                discard;
            }
        `,
      },
    }
  }
}

GeojsonOffsetLayer.layerName = 'GeojsonOffsetLayer'
GeojsonOffsetLayer.defaultProps = {
  getOffset: { type: 'accessor', value: OFFSET_TYPE.RIGHT },
}
