import { LineLayer } from '@deck.gl/layers'
import type { ShaderModule } from '@luma.gl/shadertools'

import globalStore from '@/store'
import SHADER_VERTEX_FULL from './line-offset-shader-full.vert?raw'

export const OFFSET_DIRECTION = {
  NONE: 0,
  LEFT: 1,
  RIGHT: -1,
}

// Uniform block (UBO)
const uniformBlock = `\
uniform udataUniforms {
  float offsetDirection;
} udata;
`
const udataUniforms = {
  name: 'udata',
  vs: uniformBlock,
  uniformTypes: {
    offsetDirection: 'f32',
  },
} as const satisfies ShaderModule

export class LineOffsetLayer extends LineLayer {
  initializeState() {
    super.initializeState()
  }

  getShaders() {
    const shaders = super.getShaders()
    shaders.vs = SHADER_VERTEX_FULL
    shaders.modules = [...shaders.modules, udataUniforms]
    return shaders
  }

  updateState(state: any) {
    const { props, oldProps, changeFlags } = state
    super.updateState(state)

    // refresh uniforms
    const udata = {
      offsetDirection: props.offsetDirection,
    }

    for (const model of this.getModels()) {
      model.shaderInputs.setProps({ udata })
    }
  }
}

LineOffsetLayer.layerName = 'LineOffsetLayer'
LineOffsetLayer.defaultProps = {
  bearing: 0,
  offsetDirection: OFFSET_DIRECTION.RIGHT,
} as any
