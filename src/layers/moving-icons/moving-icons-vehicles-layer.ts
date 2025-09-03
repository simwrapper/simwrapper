// deck.gl
// SPDX-License-Identifier: MIT
// Copyright (c) vis.gl contributors

// BC - 2025-08-30 forked from https://github.com/visgl/deck.gl

import { Layer, project32, picking, log, UNIT } from '@deck.gl/core'
import { SamplerProps, Texture } from '@luma.gl/core'
import { Model, Geometry } from '@luma.gl/engine'

import { iconUniforms, IconProps } from './icon-layer-uniforms'
import vs from './icon-layer.glsl.vert?raw'
import fs from './icon-layer.glsl.frag?raw'
import IconManager from './icon-manager'

import type {
  LayerProps,
  LayerDataSource,
  Accessor,
  AccessorFunction,
  Position,
  Color,
  Unit,
  UpdateParameters,
  LayerContext,
  DefaultProps,
} from '@deck.gl/core'

import type { UnpackedIcon, IconMapping, LoadIconErrorContext } from './icon-manager'

export enum ColorDepiction {
  REL_SPEED = 1,
  VEH_OCCUPANCY = 2,
}

type _IconLayerProps<DataT> = {
  data: LayerDataSource<DataT>
  /** A prepacked image that contains all icons. */
  iconAtlas?: string | Texture
  /** Icon names mapped to icon definitions, or a URL to load such mapping from a JSON file. */
  iconMapping?: string | IconMapping

  /** Icon size multiplier.
   * @default 1
   */
  sizeScale?: number
  /**
   * The units of the icon size, one of `meters`, `common`, and `pixels`.
   *
   * @default 'pixels'
   */
  sizeUnits?: Unit
  /**
   * The minimum size in pixels. When using non-pixel `sizeUnits`, this prop can be used to prevent the icon from getting too small when zoomed out.
   */
  sizeMinPixels?: number
  /**
   * The maximum size in pixels. When using non-pixel `sizeUnits`, this prop can be used to prevent the icon from getting too big when zoomed in.
   */
  sizeMaxPixels?: number
  /** If `true`, the icon always faces camera. Otherwise the icon faces up (z)
   * @default true
   */
  billboard?: boolean
  /**
   * Discard pixels whose opacity is below this threshold.
   * A discarded pixel would create a "hole" in the icon that is not considered part of the object.
   * @default 0.05
   */
  alphaCutoff?: number

  /**
   * Simulation time in seconds
   */
  currentTime?: number

  /**
   * Latitude affects the icon bearing angle
   */
  latitudeCorrectionFactor?: number

  /**
   * colorDepiction: 1=rel speeds; 2=veh occupancy
   * @default ColorDepiction.REL_SPEED
   */
  colorDepiction?: number

  /** If `true`, the icon is pickable
   * @default true
   */
  pickable?: boolean

  /**
   * iconStill - this is an ... object
   */
  iconStill?: any

  /** Icon definition accessor.
   * Should return the icon id if using pre-packed icons (`iconAtlas` + `iconMapping`).
   * Return an object that defines the icon if using auto-packing.
   */
  getIcon?: AccessorFunction<DataT, string> | AccessorFunction<DataT, UnpackedIcon>
  /** Icon color accessor.
   * @default [0, 0, 0, 255]
   */
  getColor?: Accessor<DataT, Color>
  /** Icon size accessor.
   * @default 1
   */
  getSize?: Accessor<DataT, number>
  /** Icon rotation accessor, in degrees.
   * @default 0
   */
  getAngle?: Accessor<DataT, number>
  /**
   * Icon offsest accessor, in pixels.
   * @default [0, 0]
   */
  getPixelOffset?: Accessor<DataT, [number, number]>
  /**
   * Callback called if the attempt to fetch an icon returned by `getIcon` fails.
   */
  onIconError?: ((context: LoadIconErrorContext) => void) | null

  /** Customize the [texture parameters](https://developer.mozilla.org/en-US/docs/Web/API/WebGLRenderingContext/texParameter). */
  textureParameters?: SamplerProps | null

  /** Icon color mode - outline vs texture
   * @default 1
   */
  getBColorModes?: Accessor<DataT, number>

  /** Icon color CODE - code maps to a color in shader
   * @default 0
   */
  getColorCode?: Accessor<DataT, number>

  /** Icon offset in the icon pack
   * @default [0,0]
   */
  getBOffsets?: Accessor<DataT, [number, number]>

  /** Icon position in the icon tile pack
   * @default [0,0,256,256]
   */
  getBIconFrames?: Accessor<DataT, [number, number, number, number]>

  /** Icon position in the icon tile pack
   * @default [0,0,256,256]
   */
  getPathStart?: Accessor<DataT, null | [number, number]>

  /** Icon position in the icon tile pack
   * @default [0,0,256,256]
   */
  getPathEnd?: Accessor<DataT, null | [number, number]>

  /** Icon position in the icon tile pack
   * @default [0,0,256,256]
   */
  getTimeStart?: Accessor<DataT, null | number>

  /** Icon position in the icon tile pack
   * @default [0,0,256,256]
   */
  getTimeEnd?: Accessor<DataT, null | number>
}

export type IconLayerProps<DataT = unknown> = _IconLayerProps<DataT> & LayerProps

// green-ish
const DEFAULT_COLOR: [number, number, number, number] = [25, 220, 64, 255]

const defaultProps: DefaultProps<IconLayerProps> = {
  iconAtlas: { type: 'image', value: null, async: true },
  iconMapping: { type: 'object', value: {}, async: true },
  sizeScale: { type: 'number', value: 1, min: 0 },
  billboard: true,
  sizeUnits: 'pixels',
  sizeMinPixels: { type: 'number', min: 0, value: 0 }, //  min point radius in pixels
  sizeMaxPixels: { type: 'number', min: 0, value: Number.MAX_SAFE_INTEGER }, // max point radius in pixels
  alphaCutoff: { type: 'number', value: 0.05, min: 0, max: 1 },
  currentTime: { type: 'number', value: 0 },
  latitudeCorrectionFactor: { type: 'number', value: 0.8 },
  colorDepiction: { type: 'number', value: ColorDepiction.REL_SPEED },
  pickable: true,

  getIcon: { type: 'accessor', value: (x: any) => x.icon },
  getColor: { type: 'accessor', value: DEFAULT_COLOR },
  getSize: { type: 'accessor', value: 1 },
  getAngle: { type: 'accessor', value: 0 },
  getPixelOffset: { type: 'accessor', value: [0, 0] },
  onIconError: { type: 'function', value: null, optional: true },
  textureParameters: { type: 'object', ignore: true, value: null },

  getBOffsets: { type: 'accessor', value: [0, 0] }, // (x: any) => x.icon },
  getBIconFrames: { type: 'accessor', value: [0, 0, 256, 256] }, // (x: any) => x.icon },
  getBColorModes: { type: 'accessor', value: 1 }, // (x: any) => x.icon },
  getColorCode: { type: 'accessor', value: 0 },

  getPathStart: { type: 'accessor', value: null },
  getPathEnd: { type: 'accessor', value: null },
  getTimeStart: { type: 'accessor', value: null },
  getTimeEnd: { type: 'accessor', value: null },

  iconStill: { type: 'object', value: null, optional: true },
}

/** Render raster icons at given coordinates. */
export default class IconLayer<DataT = any, ExtraPropsT extends {} = {}> extends Layer<
  ExtraPropsT & Required<_IconLayerProps<DataT>>
> {
  static defaultProps = defaultProps
  static layerName = 'IconLayer'

  declare state: {
    model?: Model
    iconManager: IconManager
  }

  getShaders() {
    // const vertShader = this.props.isColorOccupancy == 1 ? vs : vsOcc
    return super.getShaders({ vs, fs, modules: [project32, picking, iconUniforms] })
  }

  initializeState() {
    this.state = {
      iconManager: new IconManager(this.context.device, {
        onUpdate: this._onUpdate.bind(this),
        onError: this._onError.bind(this),
      }),
    }

    const attributeManager = this.getAttributeManager()
    /* eslint-disable max-len */
    attributeManager!.addInstanced({
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
      },
      instanceIconFrames: {
        size: 4,
        defaultValue: [0, 0, 256, 256],
        accessor: 'getBIconFrames',
      },
      instanceColorModes: {
        size: 1,
        type: 'uint8',
        defaultValue: 1,
        accessor: 'getBColorModes',
      },
      instanceColors: {
        size: this.props.colorFormat.length,
        type: 'unorm8',
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
  updateState(params: UpdateParameters<this>) {
    super.updateState(params)
    const { props, oldProps, changeFlags } = params

    const attributeManager = this.getAttributeManager()
    const { iconAtlas, iconMapping, data, getIcon, textureParameters } = props
    const { iconManager } = this.state

    if (typeof iconAtlas === 'string') {
      return
    }

    // internalState is always defined during updateState
    const prePacked = iconAtlas || this.internalState!.isAsyncPropLoading('iconAtlas')
    iconManager.setProps({
      loadOptions: props.loadOptions,
      autoPacking: !prePacked,
      iconAtlas,
      iconMapping: prePacked ? (iconMapping as IconMapping) : null,
      textureParameters,
    })

    // prepacked iconAtlas from user
    if (prePacked) {
      if (oldProps.iconMapping !== props.iconMapping) {
        attributeManager!.invalidate('getIcon')
      }
    } else if (
      changeFlags.dataChanged ||
      (changeFlags.updateTriggersChanged &&
        (changeFlags.updateTriggersChanged.all || changeFlags.updateTriggersChanged.getIcon))
    ) {
      // Auto packing - getIcon is expected to return an object
      attributeManager!.invalidate('instanceOffsets')
      attributeManager!.invalidate('instanceIconFrames')
      attributeManager!.invalidate('instanceColorModes')
      attributeManager!.invalidate('instanceColorCodes')
      iconManager.packIcons(data, getIcon as AccessorFunction<any, UnpackedIcon>)
    }

    if (changeFlags.extensionsChanged) {
      this.state.model?.destroy()
      this.state.model = this._getModel()
      attributeManager!.invalidateAll()
    }
  }
  /* eslint-enable max-statements, complexity */

  get isLoaded(): boolean {
    return super.isLoaded && this.state.iconManager.isLoaded
  }

  finalizeState(context: LayerContext): void {
    super.finalizeState(context)
    // Release resources held by the icon manager
    this.state.iconManager.finalize()
  }

  // draw( { uniforms }): void {
  draw(): void {
    const {
      sizeScale,
      sizeMinPixels,
      sizeMaxPixels,
      sizeUnits,
      billboard,
      alphaCutoff,
      currentTime,
      latitudeCorrectionFactor,
      iconStill,
      pickable,
      colorDepiction,
    } = this.props
    const { iconManager } = this.state

    const iconsTexture = iconManager.getTexture()
    if (iconsTexture) {
      const model = this.state.model!
      const iconProps: IconProps = {
        iconsTexture,
        iconsTextureDim: [iconsTexture.width, iconsTexture.height],
        sizeUnits: UNIT[sizeUnits],
        sizeScale,
        sizeMinPixels,
        sizeMaxPixels,
        billboard,
        alphaCutoff,
        currentTime,
        latitudeCorrectionFactor,
        iconStillOffsets: this.getInstanceOffset(iconStill),
        iconStillFrames: this.getInstanceIconFrame(iconStill),
        pickable,
        colorDepiction,
      }

      model.shaderInputs.setProps({ icon: iconProps })
      model.draw(this.context.renderPass)
    }
  }

  protected _getModel(): Model {
    // The icon-layer vertex shader uses 2d positions
    // specifed via: in vec2 positions;
    const positions = [-1, -1, 1, -1, -1, 1, 1, 1]

    return new Model(this.context.device, {
      ...this.getShaders(),
      id: this.props.id,
      bufferLayout: this.getAttributeManager()!.getBufferLayouts(),
      geometry: new Geometry({
        topology: 'triangle-strip',
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

  private _onUpdate(): void {
    this.setNeedsRedraw()
  }

  private _onError(evt: LoadIconErrorContext): void {
    const onIconError = this.getCurrentLayer()?.props.onIconError
    if (onIconError) {
      onIconError(evt)
    } else {
      log.error(evt.error.message)()
    }
  }

  protected getInstanceOffset(icon: string): [number, number] {
    const {
      width,
      height,
      anchorX = width / 2,
      anchorY = height / 2,
    } = this.state.iconManager.getIconMapping(icon)
    return [width / 2 - anchorX || 0, height / 2 - anchorY || 0]
  }

  protected getInstanceColorMode(icon: string): number {
    const mapping = this.state.iconManager.getIconMapping(icon)
    return mapping.mask ? 1 : 0
  }

  protected getInstanceIconFrame(icon: string): [number, number, number, number] {
    const { x, y, width, height } = this.state.iconManager.getIconMapping(icon)
    return [x || 0, y || 0, width || 0, height || 0]
  }
}
