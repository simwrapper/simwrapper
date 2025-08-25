import { PathLayer } from '@deck.gl/layers'

const OFFSET_TYPE = {
  NONE: 0,
  LEFT: 1,
  RIGHT: 2,
}

export default class PathOffsetLayer extends PathLayer {
  initializeState(context: any) {
    super.initializeState(context)

    this.getAttributeManager().addInstanced({
      instanceOffset: {
        size: 1,
        accessor: 'getOffset',
      },
    })
  }

  getShaders() {
    return {
      ...super.getShaders(),
      inject: {
        'vs:#decl': `
            in float instanceOffset;
            out float offset;
            `,
        'vs:#main-start': `
            offset = instanceOffset;
            `,
        'fs:#decl': `
            in float offset;
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

PathOffsetLayer.layerName = 'PathOffsetLayer'
PathOffsetLayer.defaultProps = {
  getOffset: { type: 'accessor', value: OFFSET_TYPE.RIGHT },
}
