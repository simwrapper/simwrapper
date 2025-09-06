// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

import type { ShaderModule } from '@luma.gl/shadertools'
import { Texture } from '@luma.gl/core'

const uniformBlock = `\
uniform iconUniforms {
  float sizeScale;
  vec2 iconsTextureDim;
  float sizeMinPixels;
  float sizeMaxPixels;
  bool billboard;
  float sizeUnits;
  float alphaCutoff;
  float currentTime;
  float latitudeCorrectionFactor;
  vec2 iconStillOffsets;
  vec4 iconStillFrames;
  bool pickable;
  float colorDepiction;
} icon;
`

type IconBindingProps = {
  iconsTexture: Texture
}

type IconUniformProps = {
  sizeScale: number
  iconsTextureDim: [number, number]
  sizeMinPixels: number
  sizeMaxPixels: number
  billboard: boolean
  sizeUnits: number
  alphaCutoff: number
  currentTime: number
  latitudeCorrectionFactor: number
  iconStillOffsets: [number, number]
  iconStillFrames: [number, number, number, number]
  pickable: boolean
  colorDepiction: number
}

export type IconProps = IconBindingProps & IconUniformProps

export const iconUniforms = {
  name: 'icon',
  vs: uniformBlock,
  fs: uniformBlock,
  uniformTypes: {
    sizeScale: 'f32',
    iconsTextureDim: 'vec2<f32>',
    sizeMinPixels: 'f32',
    sizeMaxPixels: 'f32',
    billboard: 'f32',
    sizeUnits: 'f32',
    alphaCutoff: 'f32',
    currentTime: 'f32',
    latitudeCorrectionFactor: 'f32',
    iconStillOffsets: 'vec2<f32>',
    iconStillFrames: 'vec4<f32>',
    pickable: 'f32',
    colorDepiction: 'f32',
  },
} as const satisfies ShaderModule<IconProps>
