import { LineLayer } from '@deck.gl/layers'

import globalStore from '@/store'
import SHADER_VERTEX_FULL from './line-offset-shader-full.vert?raw'

export const OFFSET_DIRECTION = {
  NONE: 0,
  LEFT: 1,
  RIGHT: -1,
}

export class LineOffsetLayer extends LineLayer {
  initializeState(context: any) {
    super.initializeState(context)
  }

  getShaders() {
    return {
      ...super.getShaders(),
      vs: SHADER_VERTEX_FULL,
    }
  }

  draw({ uniforms }: any) {
    const { offsetDirection } = this.props

    const combinedUniforms = {
      ...uniforms,
      offsetDirection,
      bearing: (globalStore.state.viewState.bearing * Math.PI) / 180.0,
    }

    super.draw({
      uniforms: combinedUniforms,
    })
  }
}

LineOffsetLayer.layerName = 'LineOffsetLayer'
LineOffsetLayer.defaultProps = {
  bearing: 0,
  offsetDirection: OFFSET_DIRECTION.RIGHT,
}
