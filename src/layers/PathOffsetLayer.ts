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

PathOffsetLayer.layerName = 'PathOffsetLayer'
PathOffsetLayer.defaultProps = {
  getOffset: { type: 'accessor', value: 0 },
}

// /** DeckGL **/
// new deck.DeckGL({
//   container: 'container',
//   mapboxApiAccessToken: '',
//   longitude: -122.408,
//   latitude: 37.785,
//   zoom: 16,
//   pitch: 0,
//   layers: [
//     new deck.PathLayer({
//       data:
//         'https://raw.githubusercontent.com/uber-common/deck.gl-data/master/website/bart-lines.json',
//       getPath: d => d.path,
//       getColor: [0, 0, 0],
//       getWidth: 50,
//     }),
//     new MyPathLayer({
//       data:
//         'https://raw.githubusercontent.com/uber-common/deck.gl-data/master/website/bart-lines.json',
//       getPath: d => d.path,
//       getColor: [255, 0, 0],
//       getOffset: (d, { index }) => index % 3,
//       getWidth: 50,
//       pickable: true,
//       autoHighlight: true,
//     }),
//   ],
// })
