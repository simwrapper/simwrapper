import { ScatterplotLayer } from '@deck.gl/layers'

export default class ScatterplotColorBinsLayer extends ScatterplotLayer {
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

  public getShaders() {
    return {
      ...super.getShaders(),
      inject: {
        'vs:#decl': `
            #define MAX_COLORS 21
            #define MAX_BREAKPOINTS 20
            uniform int numBreakpoints;
            uniform vec3 colors[MAX_COLORS];
            uniform float breakpoints[MAX_BREAKPOINTS];
            attribute float instanceValue;
            `,
        'vs:DECKGL_FILTER_COLOR': `
            // geometry.pickingColor = instancePickingColors;
            picking_setPickingColor(geometry.pickingColor);

            int lastBreakpoint = numBreakpoints;

            for(int i=0; i < MAX_BREAKPOINTS; ++i) {
              if (instanceValue < breakpoints[i]) {
                color = vec4(colors[i], 1.0);
                return;
              }
              if (i == lastBreakpoint) {
                color = vec4(colors[i], 1.0);
                return;
              }
            }
            color = vec4(1.0, 0.0, 0.0, 1.0);
            return;
          `,
      },
    }
  }

  // uniform cannot change size, so we pre-allocate the
  // max storage for colors and breakpoints here.
  private MAX_COLORS = 21
  private uniformColors = new Array(this.MAX_COLORS * 3)
  private uniformBreakpoints = new Array(this.MAX_COLORS - 1)

  draw({ uniforms }: any) {
    const { colors, breakpoints } = this.props

    colors.map((c: number[], i: number) => {
      this.uniformColors[i * 3] = c[0] / 256
      this.uniformColors[i * 3 + 1] = c[1] / 256
      this.uniformColors[i * 3 + 2] = c[2] / 256
    })

    breakpoints.map((c: number, i: number) => {
      this.uniformBreakpoints[i] = c
    })

    const combinedUniforms = {
      ...uniforms,
      colors: this.uniformColors,
      breakpoints: this.uniformBreakpoints,
      numBreakpoints: breakpoints.length,
    }

    super.draw({
      uniforms: combinedUniforms,
    })
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
