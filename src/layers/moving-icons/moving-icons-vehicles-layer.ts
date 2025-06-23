// BC 2021-04-30: this file forked from https://github.com/visgl/deck.gl
//
// Copyright (c) 2015 - 2017 Uber Technologies, Inc.
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.

import { Layer, project32, picking, log } from '@deck.gl/core'
import GL from '@luma.gl/constants'
import { Model, Geometry } from '@luma.gl/core'

import vertShader from './icon-layer.glsl.vert?raw'
import fragShader from './icon-layer.glsl.frag?raw'

import IconManager from './icon-manager'

const DEFAULT_COLOR = [25, 220, 64, 255] // greenish

const defaultProps = {
  iconAtlas: { type: 'image', value: null, async: true },
  iconMapping: { type: 'object', value: {}, async: true },
  sizeScale: { type: 'number', value: 1, min: 0 },
  billboard: false,
  sizeUnits: 'pixels',
  sizeMinPixels: { type: 'number', min: 0, value: 0 }, //  min point radius in pixels
  sizeMaxPixels: { type: 'number', min: 0, value: Number.MAX_SAFE_INTEGER }, // max point radius in pixels
  alphaCutoff: { type: 'number', value: 0.05, min: 0, max: 1 },
  iconStill: { type: 'object', value: null },
  latitudeCorrectionFactor: 0.8,

  getIcon: { type: 'accessor', value: 'vehicle' }, // (x: any) => x.icon },
  getBOffsets: { type: 'accessor', value: [0, 0] }, // (x: any) => x.icon },
  getBIconFrames: { type: 'accessor', value: [0, 0, 256, 256] }, // (x: any) => x.icon },
  getBColorModes: { type: 'accessor', value: 1 }, // (x: any) => x.icon },

  // [rgba]
  getColor: { type: 'accessor', value: DEFAULT_COLOR },
  // color codes map code to a color
  getColorCode: { type: 'accessor', value: 0 },

  getSize: { type: 'accessor', value: 1 },
  getAngle: { type: 'accessor', value: 0 },
  getPixelOffset: { type: 'accessor', value: [0, 0] },

  getPathStart: { type: 'accessor', value: null },
  getPathEnd: { type: 'accessor', value: null },
  getTimeStart: { type: 'accessor', value: null },
  getTimeEnd: { type: 'accessor', value: null },
  currentTime: { type: 'number', value: 0 },

  pickable: { type: 'boolean', value: true },
  onIconError: { type: 'function', value: null, compare: false, optional: true },
}

export default class IconLayer extends Layer {
  getShaders() {
    return super.getShaders({ vs: vertShader, fs: fragShader, modules: [project32, picking] })
  }

  initializeState() {
    this.state = {
      iconManager: new IconManager(this.context.gl, {
        onUpdate: this._onUpdate.bind(this),
        onError: this._onError.bind(this) as any,
      }),
    }

    const attributeManager = this.getAttributeManager()

    /* eslint-disable max-len */
    attributeManager.addInstanced({
      instanceTimestamps: {
        size: 1,
        accessor: 'getTimeStart',
      },
      instanceTimestampsNext: {
        size: 1,
        accessor: 'getTimeEnd',
      },
      instanceStartPositions: {
        size: 2,
        accessor: 'getPathStart',
      },
      instanceEndPositions: {
        size: 2,
        accessor: 'getPathEnd',
      },
      instanceSizes: {
        size: 1,
        transition: true,
        accessor: 'getSize',
        defaultValue: 1,
      },
      instanceOffsets: {
        size: 2,
        defaultValue: [0, 0],
        accessor: 'getBOffsets',
        // transform: this.getInstanceOffset
      },
      instanceIconFrames: {
        size: 4,
        defaultValue: [0, 0, 256, 256],
        accessor: 'getBIconFrames',
        // transform: this.getInstanceIconFrame
      },
      instanceColorModes: {
        size: 1,
        type: GL.UNSIGNED_BYTE,
        defaultValue: 1,
        accessor: 'getBColorModes',
        // accessor: 'getIcon',
        // transform: this.getInstanceColorMode,
      },

      // instanceOffsets: { size: 2, accessor: 'getIcon', transform: this.getInstanceOffset },
      // instanceIconFrames: { size: 4, accessor: 'getIcon', transform: this.getInstanceIconFrame },
      // instanceColorModes: {
      //   size: 1,
      //   type: GL.UNSIGNED_BYTE,
      //   accessor: 'getIcon',
      //   transform: this.getInstanceColorMode,
      // },
      instanceColors: {
        size: this.props.colorFormat.length,
        type: GL.UNSIGNED_BYTE,
        normalized: true,
        transition: true,
        accessor: 'getColor',
        defaultValue: DEFAULT_COLOR,
      },
      instanceColorCodes: {
        size: 1,
        accessor: 'getColorCode',
        defaultValue: 0,
      },

      instanceAngles: {
        size: 1,
        transition: true,
        accessor: 'getAngle',
      },
      instancePixelOffset: {
        size: 2,
        transition: true,
        accessor: 'getPixelOffset',
      },
    })
    /* eslint-enable max-len */
  }

  /* eslint-disable max-statements, complexity */
  updateState({ oldProps, props, changeFlags }: any) {
    super.updateState({ props, oldProps, changeFlags })

    const attributeManager = this.getAttributeManager()
    const { iconAtlas, iconMapping, data, getIcon } = props
    const { iconManager } = this.state

    iconManager.setProps({ loadOptions: props.loadOptions })

    let iconMappingChanged = false
    const prePacked = iconAtlas || this.internalState.isAsyncPropLoading('iconAtlas')

    // prepacked iconAtlas from user
    if (prePacked) {
      if (oldProps.iconAtlas !== props.iconAtlas) {
        iconManager.setProps({ iconAtlas, autoPacking: false })
      }

      if (oldProps.iconMapping !== props.iconMapping) {
        iconManager.setProps({ iconMapping })
        iconMappingChanged = true
      }
    } else {
      // otherwise, use autoPacking
      iconManager.setProps({ autoPacking: true })
    }

    // handle data changed
    if (
      changeFlags.dataChanged ||
      (changeFlags.updateTriggersChanged &&
        (changeFlags.updateTriggersChanged.all || changeFlags.updateTriggersChanged.getIcon))
    ) {
      iconManager.setProps({ data, getIcon })
    }

    if (iconMappingChanged) {
      attributeManager.invalidate('instanceOffsets')
      attributeManager.invalidate('instanceIconFrames')
      attributeManager.invalidate('instanceColorModes')
      attributeManager.invalidate('instanceColorCodes')
    }

    if (changeFlags.extensionsChanged) {
      const { gl } = this.context
      this.state.model?.delete()
      this.state.model = this._getModel(gl)
      attributeManager.invalidateAll()
    }
  }
  /* eslint-enable max-statements, complexity */

  get isLoaded() {
    return super.isLoaded && this.state.iconManager.isLoaded
  }

  finalizeState() {
    super.finalizeState()
    // Release resources held by the icon manager
    this.state.iconManager.finalize()
  }

  draw({ uniforms }: any) {
    const {
      sizeScale,
      sizeMinPixels,
      sizeMaxPixels,
      sizeUnits,
      billboard,
      alphaCutoff,
      currentTime,
      iconStill,
      pickable,
      latitudeCorrectionFactor,
    } = this.props

    const { iconManager } = this.state
    const { viewport } = this.context

    const iconsTexture = iconManager.getTexture()
    if (iconsTexture) {
      this.state.model
        .setUniforms(uniforms)
        .setUniforms({
          iconsTexture,
          iconsTextureDim: [iconsTexture.width, iconsTexture.height],
          sizeScale: sizeScale * (sizeUnits === 'pixels' ? viewport.metersPerPixel : 1),
          sizeMinPixels,
          sizeMaxPixels,
          billboard,
          alphaCutoff,
          currentTime,
          pickable,
          latitudeCorrectionFactor,
          iconStillOffsets: this.getInstanceOffset(iconStill),
          iconStillFrames: this.getInstanceIconFrame(iconStill),
        })
        .draw()
    }
  }

  _getModel(gl: any) {
    // The icon-layer vertex shader uses 2d positions
    // specifed via: attribute vec2 positions;
    const positions = [-1, -1, -1, 1, 1, 1, 1, -1]

    return new Model(gl, {
      ...this.getShaders(),
      id: this.props.id,
      geometry: new Geometry({
        drawMode: GL.TRIANGLE_FAN,
        attributes: {
          // The size must be explicitly passed here otherwise luma.gl
          // will default to assuming that positions are 3D (x,y,z)
          positions: {
            size: 2,
            value: new Float32Array(positions),
          },
        },
      }),
      isInstanced: true,
    })
  }

  _onUpdate() {
    this.setNeedsRedraw()
  }

  _onError(evt: any) {
    const { onIconError } = this.getCurrentLayer().props
    if (onIconError) {
      onIconError(evt)
    } else {
      log.error(evt.error)()
    }
  }

  getInstanceOffset(icon: any) {
    const rect = this.state.iconManager.getIconMapping(icon)
    return [rect.width / 2 - rect.anchorX || 0, rect.height / 2 - rect.anchorY || 0]
  }

  getInstanceColorMode(icon: any) {
    const mapping = this.state.iconManager.getIconMapping(icon)
    return mapping.mask ? 1 : 0
  }

  getInstanceIconFrame(icon: any) {
    const rect = this.state.iconManager.getIconMapping(icon)
    return [rect.x || 0, rect.y || 0, rect.width || 0, rect.height || 0]
  }
}

IconLayer.layerName = 'MovingVehicleLayer'
IconLayer.defaultProps = defaultProps
