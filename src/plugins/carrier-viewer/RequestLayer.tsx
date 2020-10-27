import { ArcLayer } from '@deck.gl/layers'

const defaultProps = {
  currentTime: { type: 'number', value: 0, min: 0 },
  getTimeStart: { type: 'accessor', value: null },
  getTimeEnd: { type: 'accessor', value: null },
  searchFlag: { type: 'number', value: 0 },
}

export default class DrtRequestArcLayer extends ArcLayer {
  getShaders() {
    const shaders = super.getShaders()
    shaders.inject = {
      // Timestamp of the vertex
      'vs:#decl': `\
        attribute float timeStart;
        attribute float timeEnd;
        uniform float currentTime;
        uniform float searchFlag;
        varying float vTime;
      `,
      'vs:#main-start': `\
        if (searchFlag == 1.0) {
          vTime = 999.0;
        } else if (timeEnd == -1.0 || timeStart > currentTime || timeEnd < currentTime ) {
          vTime = -1.0;
          return;
        } else {
          float nearBeginning = currentTime - timeStart;
          float nearEnd = timeEnd - currentTime;
          vTime = min(nearBeginning, nearEnd);
        }
      `,
      'fs:#decl': `\
        uniform float currentTime;
        uniform float searchFlag;
        varying float vTime;
      `,
      'fs:#main-start': `\
      if (searchFlag == 0.0 && vTime == -1.0 ) discard;
      `,
      // fade the traces in and out
      'fs:DECKGL_FILTER_COLOR': `\
        if (vTime <= 10.0) color.a *= (vTime / 10.0);
      `,
    }
    return shaders
  }

  initializeState(params: any) {
    super.initializeState(params)

    const attributeManager = this.getAttributeManager()
    attributeManager.addInstanced({
      timeStart: { size: 1, accessor: 'getTimeStart' },
      timeEnd: { size: 1, accessor: 'getTimeEnd' },
    })
  }

  draw(params: any) {
    const { currentTime } = this.props

    params.uniforms = Object.assign({}, params.uniforms, {
      currentTime,
    })

    super.draw(params)
  }
}

DrtRequestArcLayer.layerName = 'DrtRequestArcLayer'
DrtRequestArcLayer.defaultProps = defaultProps
