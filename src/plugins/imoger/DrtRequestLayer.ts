import { ArcLayer } from '@deck.gl/layers'
import type { ShaderModule } from '@luma.gl/shadertools'

const defaultProps = {
  currentTime: { type: 'number', value: 0, min: 0 },
  getTimeStart: { type: 'accessor', value: null },
  getTimeEnd: { type: 'accessor', value: null },
  searchFlag: { type: 'number', value: 0 },
} as any

// Deckg. 9.x: Use Uniform block (UBO) instead of individual uniforms
const uniformBlock = `\
uniform udataUniforms {
  float currentTime;
  float searchFlag;
} udata;
`
const udataUniforms = {
  name: 'udata',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    currentTime: 'f32',
    searchFlag: 'f32',
  },
} as const satisfies ShaderModule

export default class DrtRequestArcLayer extends ArcLayer {
  getShaders() {
    const shaders = super.getShaders()
    shaders.modules = [...shaders.modules, udataUniforms]
    shaders.inject = {
      // Timestamp of the vertex
      'vs:#decl': `\
        in float timeStart;
        in float timeEnd;
        out float vTime;
      `,
      'vs:#main-start': `\
        if (udata.searchFlag == 1.0) {
          vTime = 999.0;
        } else if (timeEnd == -1.0 || timeStart > udata.currentTime || timeEnd < udata.currentTime ) {
          vTime = -1.0;
          return;
        } else {
          float nearBeginning = udata.currentTime - timeStart;
          float nearEnd = timeEnd - udata.currentTime;
          vTime = min(nearBeginning, nearEnd);
        }
      `,
      'fs:#decl': `\
        in float vTime;
      `,
      'fs:#main-start': `\
      if (udata.searchFlag == 0.0 && vTime == -1.0 ) discard;
      `,
      // fade the traces in and out
      'fs:DECKGL_FILTER_COLOR': `\
        if (vTime <= 10.0) color.a *= (vTime / 10.0);
      `,
    }
    return shaders
  }

  initializeState() {
    super.initializeState()

    const attributeManager = this.getAttributeManager()
    attributeManager?.addInstanced({
      timeStart: { size: 1, accessor: 'getTimeStart' },
      timeEnd: { size: 1, accessor: 'getTimeEnd' },
    })
  }

  updateState(state: any) {
    const { props, oldProps, changeFlags } = state
    super.updateState(state)

    // refresh uniforms
    const udata = {
      currentTime: props.currentTime,
      searchFlag: props.searchFlag,
    }

    for (const model of this.getModels()) {
      model.shaderInputs.setProps({ udata })
    }
  }
}

DrtRequestArcLayer.layerName = 'DrtRequestArcLayer'
DrtRequestArcLayer.defaultProps = defaultProps
