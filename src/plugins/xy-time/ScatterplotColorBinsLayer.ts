import { ScatterplotLayer } from '@deck.gl/layers'
import type { ShaderModule } from '@luma.gl/shadertools'

// uniform block object --------------------------
const uniformBlock = `\
uniform highlightUniforms {
  uniform vec4 numBreakpoints;
  uniform vec4 colors[21];
} highlight;
`
const highlightUniforms = {
  name: 'highlight',
  vs: uniformBlock,
  uniformTypes: {
    numBreakpoints: 'vec4<f32>',
    colors: 'vec4<f32>',
  },
} as const satisfies ShaderModule

// subclass ----------------------------------------
export default class ScatterplotColorBinsLayer extends ScatterplotLayer {
  // uniform cannot change size, so we pre-allocate the
  // max storage for colors and breakpoints here.
  private MAX_COLORS = 21
  private uniformColors = new Float32Array(this.MAX_COLORS * 4)

  public initializeState(context: any) {
    super.initializeState(context)
    this.getAttributeManager().addInstanced({
      instanceValue: {
        accessor: 'getValue',
        size: 1,
        defaultValue: 0.0,
        transition: true,
      },
    })
  }

  getShaders() {
    const shaders = super.getShaders()
    // custom shader code
    shaders.inject = {
      'vs:#decl': `
            #define MAX_COLORS 21
            #define MAX_BREAKPOINTS 20
            in float instanceValue;
            float breakpoints[MAX_BREAKPOINTS];
            `,

      'vs:DECKGL_FILTER_COLOR': `
            picking_setPickingColor(geometry.pickingColor);

            for(int i=0; i < MAX_BREAKPOINTS; ++i) {
              breakpoints[i] = highlight.colors[i].w;
            }

            int numBreakpoints = int(highlight.numBreakpoints.x);

            for(int i=0; i < MAX_BREAKPOINTS; ++i) {
              if (instanceValue < breakpoints[i]) {
                color = vec4(highlight.colors[i].x, highlight.colors[i].y, highlight.colors[i].z, 1.0);
                return;
              }
              if (i == numBreakpoints) {
                color = vec4(highlight.colors[i].x, highlight.colors[i].y, highlight.colors[i].z, 1.0);
                return;
              }
            }
            color = vec4(1.0, 0.0, 0.0, 1.0);
            return;
          `,
    }
    // add uniform binding: https://deck.gl/docs/developer-guide/custom-layers/layer-extensions
    shaders.modules = [...shaders.modules, highlightUniforms]
    return shaders
  }

  // TODO - do we neeed this? ---------------
  updateState(x: { props: any; oldProps: any; changeFlags: any }) {
    const { props, oldProps, changeFlags } = x
    super.updateState({ props, oldProps, changeFlags })

    props.colors.forEach((c: number[], i: number) => {
      // colors get packed into vec(xyz):
      this.uniformColors[i * 4] = c[0] / 255
      this.uniformColors[i * 4 + 1] = c[1] / 255
      this.uniformColors[i * 4 + 2] = c[2] / 255
      // breakpoint is packed as final value in vec4 color!
      if (i < props.breakpoints.length) {
        this.uniformColors[i * 4 + 3] = props.breakpoints[i]
      }
    })

    const highlight = {
      numBreakpoints: new Float32Array(4).fill(props.breakpoints.length),
      colors: this.uniformColors,
    }

    for (const model of this.getModels()) {
      model.shaderInputs.setProps({ highlight })
    }
  }
}

ScatterplotColorBinsLayer.layerName = 'ScatterplotColorBinsLayer'
ScatterplotColorBinsLayer.defaultProps = {
  colors: [
    [128, 128, 128],
    [128, 128, 128],
  ],
  breakpoints: [0.0],
}
