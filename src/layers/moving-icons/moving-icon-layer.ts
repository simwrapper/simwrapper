import { Layer, project32, picking } from '@deck.gl/core'
import GL from '@luma.gl/constants'
import { Model, Geometry } from '@luma.gl/core'

import IconManager from './icon-manager'

const vs = require('./icon-layer.glsl.vert').default
const fs = require('./icon-layer.glsl.frag').default

const DEFAULT_COLOR = [0, 0, 0, 255]
/*
 * @param {object} props
 * @param {Texture2D | string} props.iconAtlas - atlas image url or texture
 * @param {object} props.iconMapping - icon names mapped to icon definitions
 * @param {object} props.iconMapping[icon_name].x - x position of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].y - y position of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].width - width of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].height - height of icon on the atlas image
 * @param {object} props.iconMapping[icon_name].anchorX - x anchor of icon on the atlas image,
 *   default to width / 2
 * @param {object} props.iconMapping[icon_name].anchorY - y anchor of icon on the atlas image,
 *   default to height / 2
 * @param {object} props.iconMapping[icon_name].mask - whether icon is treated as a transparency
 *   mask. If true, user defined color is applied. If false, original color from the image is
 *   applied. Default to false.
 * @param {number} props.size - icon size in pixels
 * @param {func} props.getPosition - returns anchor position of the icon, in [lng, lat, z]
 * @param {func} props.getIcon - returns icon name as a string
 * @param {func} props.getSize - returns icon size multiplier as a number
 * @param {func} props.getColor - returns color of the icon in [r, g, b, a]. Only works on icons
 *   with mask: true.
 * @param {func} props.getAngle - returns rotating angle (in degree) of the icon.
 */
const defaultProps = {
  iconAtlas: { type: 'object', value: null, async: true },
  iconMapping: { type: 'object', value: {}, async: true },
  sizeScale: { type: 'number', value: 1, min: 0 },
  billboard: true,
  sizeUnits: 'pixels',
  sizeMinPixels: { type: 'number', min: 0, value: 0 }, //  min point radius in pixels
  sizeMaxPixels: { type: 'number', min: 0, value: Number.MAX_SAFE_INTEGER }, // max point radius in pixels
  alphaCutoff: { type: 'number', value: 0.05, min: 0, max: 1 },
  noAlloc: true,
  iconStill: { type: 'object', value: null },

  getIcon: { type: 'accessor', value: (x: any) => x.icon },
  getColor: { type: 'accessor', value: DEFAULT_COLOR },
  getSize: { type: 'accessor', value: 1 },
  getAngle: { type: 'accessor', value: 0 },
  getPixelOffset: { type: 'accessor', value: [0, 0] },

  getPathStart: { type: 'accessor', value: null },
  getPathEnd: { type: 'accessor', value: null },
  getTimeStart: { type: 'accessor', value: null },
  getTimeEnd: { type: 'accessor', value: null },

  currentTime: { type: 'number', value: 0 },
  pickable: { type: 'boolean', value: true },
}

export default class IconLayer extends Layer {
  getShaders() {
    return super.getShaders({ vs, fs, modules: [project32, picking] })
  }

  initializeState() {
    this.state = {
      iconManager: new IconManager(this.context.gl, { onUpdate: () => this._onUpdate() }),
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
      instanceOffsets: { size: 2, accessor: 'getIcon', transform: this.getInstanceOffset },
      instanceIconFrames: { size: 4, accessor: 'getIcon', transform: this.getInstanceIconFrame },
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
      instancePixelOffset: {
        size: 2,
        transition: true,
        accessor: 'getPixelOffset',
      },
    })
  }

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
      iconMappingChanged = true
    }

    if (iconMappingChanged) {
      attributeManager.invalidate('instanceOffsets')
      attributeManager.invalidate('instanceIconFrames')
      // attributeManager.invalidate('instanceColorModes')
    }

    if (changeFlags.extensionsChanged) {
      const { gl } = this.context
      if (this.state.model) {
        this.state.model.delete()
      }
      this.setState({ model: this._getModel(gl) })
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
    } = this.props

    const { iconManager } = this.state
    const { viewport } = this.context

    const iconsTexture = iconManager.getTexture()
    if (iconsTexture && iconsTexture.loaded) {
      this.state.model
        .setUniforms(
          Object.assign({}, uniforms, {
            iconsTexture,
            iconsTextureDim: [iconsTexture.width, iconsTexture.height],
            sizeScale: sizeScale * (sizeUnits === 'pixels' ? viewport.metersPerPixel : 1),
            sizeMinPixels,
            sizeMaxPixels,
            billboard,
            alphaCutoff,
            currentTime,
            pickable,
            iconStillOffsets: this.getInstanceOffset(iconStill),
            iconStillFrames: this.getInstanceIconFrame(iconStill),
            // iconStillColorModes: this.getInstanceColorMode(iconStill),
          })
        )
        .draw()
    }
  }

  _getModel(gl: any) {
    // The icon-layer vertex shader uses 2d positions
    // specifed via: attribute vec2 positions;
    const positions = [-1, -1, -1, 1, 1, 1, 1, -1]

    return new Model(
      gl,
      Object.assign({}, this.getShaders(), {
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
    )
  }

  _onUpdate() {
    this.setNeedsRedraw()
  }

  getInstanceOffset(icon: any) {
    const rect = this.state.iconManager.getIconMapping(icon)
    return [rect.width / 2 - rect.anchorX || 0, rect.height / 2 - rect.anchorY || 0]
  }

  // getInstanceColorMode(icon: any) {
  //   const mapping = this.state.iconManager.getIconMapping(icon)
  //   return mapping.mask ? 1 : 0
  // }

  getInstanceIconFrame(icon: any) {
    const rect = this.state.iconManager.getIconMapping(icon)
    return [rect.x || 0, rect.y || 0, rect.width || 0, rect.height || 0]
  }
}

IconLayer.layerName = 'MovingIconLayer'
IconLayer.defaultProps = defaultProps
