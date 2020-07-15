// fragment shader: pixel colors
uniform float simulationTime;

// passed in from vertex shader:
varying float skip;
varying float atRest;

vec4 getColor() {

    if (atRest == 1.0) {
        return vec4(0.0, 0.5, 0.2, 1.0);
    }

    return vec4(1.0, 1.0, 0.5, 1.0);
}


void main() {
    // don't do anything if this trip is currently out of time bounds
    if (skip == 1.0) {

        gl_FragColor = vec4(0,0,0,0);

    } else {

        gl_FragColor = getColor();

    }
}
