/*
 * Copyright (c) Flowmap.gl contributors
 * Copyright (c) 2018-2020 Teralytics
 * SPDX-License-Identifier: Apache-2.0
 */

import { Layer, picking, project32 } from '@deck.gl/core'
import { Geometry, Model } from '@luma.gl/engine'
import VertexShader from './FlowCirclesLayerVertex.glsl.vert?raw'
import FragmentShader from './FlowCirclesLayerFragment.glsl.frag?raw'
import { FlowCirclesLayerAttributes, RGBA } from '@flowmap.gl/data'
import type { ShaderModule } from '@luma.gl/shadertools'
import { LayerProps } from '../types'

export type FlowCirclesDatum = Record<string, unknown>

export interface Props extends LayerProps {
  id: string
  opacity?: number
  pickable?: boolean
  emptyColor?: RGBA
  outlineEmptyMix?: number
  getColor?: (d: FlowCirclesDatum) => RGBA
  getPosition?: (d: FlowCirclesDatum) => [number, number]
  getInRadius?: (d: FlowCirclesDatum) => number
  getOutRadius?: (d: FlowCirclesDatum) => number
  data: FlowCirclesDatum[] | FlowCirclesLayerAttributes
  updateTriggers?: { [key: string]: Record<string, unknown> }
}

const uniformBlock = `\
uniform uniUniforms {
  float opacity;
  vec4 emptyColor;
  float outlineEmptyMix;
} uni;
`
export type UniProps = {
  opacity: number
  emptyColor: [number, number, number, number]
  outlineEmptyMix: number
}
export const uniUniforms = {
  name: 'uni',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    opacity: 'f32',
    emptyColor: 'vec4<f32>',
    outlineEmptyMix: 'f32',
  },
} as const satisfies ShaderModule<UniProps>

const DEFAULT_COLOR = [0, 0, 0, 255]
const DEFAULT_EMPTY_COLOR = [255, 255, 255, 255]
const DEFAULT_OUTLINE_EMPTY_MIX = 0.4

class FlowCirclesLayer extends Layer {
  static layerName = 'FlowCirclesLayer'

  static defaultProps = {
    getColor: { type: 'accessor', value: DEFAULT_COLOR },
    emptyColor: { type: 'accessor', value: DEFAULT_EMPTY_COLOR },
    outlineEmptyMix: { type: 'accessor', value: DEFAULT_OUTLINE_EMPTY_MIX },
    getPosition: { type: 'accessor', value: (d: FlowCirclesDatum) => d.position },
    getInRadius: { type: 'accessor', value: 1 },
    getOutRadius: { type: 'accessor', value: 1 },
    parameters: { depthTest: false },
  }

  constructor(props: Props) {
    super(props)
  }

  getShaders() {
    return super.getShaders({
      vs: VertexShader,
      fs: FragmentShader,
      modules: [project32, picking, uniUniforms],
      //@ts-ignore
      shaderCache: this.context.shaderCache, // maybe?
    })
  }

  initializeState() {
    this.getAttributeManager()?.addInstanced({
      instancePositions: {
        size: 3,
        type: 'float64',
        fp64: this.use64bitPositions(),
        transition: true,
        accessor: 'getPosition',
      },
      instanceInRadius: {
        size: 1,
        transition: true,
        accessor: 'getInRadius',
        defaultValue: 1,
      },
      instanceOutRadius: {
        size: 1,
        transition: true,
        accessor: 'getOutRadius',
        defaultValue: 1,
      },
      instanceColors: {
        size: 4,
        transition: true,
        type: 'uint8',
        accessor: 'getColor',
        defaultValue: DEFAULT_COLOR,
      },
    })
  }

  updateState({ props, oldProps, changeFlags }: any) {
    super.updateState({ props, oldProps, changeFlags } as any)
    if (changeFlags.extensionsChanged) {
      //@ts-ignore
      if (this.state.model) this.state.model.delete()
      this.setState({ model: this._getModel() })
      this.getAttributeManager()?.invalidateAll()
    }
  }

  draw() {
    const { opacity, emptyColor, outlineEmptyMix } = this.props as any

    const uni: UniProps = {
      opacity,
      emptyColor,
      outlineEmptyMix,
    }

    const model = this.state.model! as any
    model?.shaderInputs.setProps({ uni })
    model?.draw(this.context.renderPass)
  }

  _getModel() {
    // a square that minimally cover the unit circle
    const positions = [-1, -1, 1, -1, -1, 1, 1, 1]

    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      geometry: new Geometry({
        topology: 'triangle-strip',
        // vertexCount: 4,
        attributes: {
          positions: { size: 2, value: new Float32Array(positions) },
        },
      }),
      isInstanced: true,
    } as any)
  }
}

export default FlowCirclesLayer
