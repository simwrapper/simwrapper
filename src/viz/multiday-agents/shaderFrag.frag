// fragment shader: pixel colors

uniform float simulationTime;
uniform vec3 cSusceptible;
uniform vec3 cInfectedButNotContagious;
uniform vec3 cContagious;
uniform vec3 cSymptomatic;
uniform vec3 cSeriouslyIll;
uniform vec3 cCritical;
uniform vec3 cRecovered;

// passed in from vertex shader:
varying float myInfectionStatus;
varying float skip;
varying float atRest;


vec4 getColor() {

    if (myInfectionStatus == 0.0) {
        return vec4(cSusceptible, 1.0);  // susceptible; not moving

    } else if (myInfectionStatus == 1.0) {

        return vec4(cInfectedButNotContagious, 1.0);  // infected; cyan

    } else if (myInfectionStatus == 2.0) {

        return vec4(cContagious, 1.0);  // contagious; red

    } else if (myInfectionStatus == 3.0) {

        return vec4(cSymptomatic, 1.0);

    } else if (myInfectionStatus == 4.0) {

        return vec4(cSeriouslyIll, 1.0);

    } else if (myInfectionStatus == 5.0) {

        return vec4(cCritical, 1.0);
    }
    return vec4(cRecovered, 1.0);
}


void main() {
    // don't do anything if this trip is currently out of time bounds
    if (skip == 1.0) {

        gl_FragColor = vec4(0,0,0,0);

    } else {

        gl_FragColor = getColor();

    }
}

/******
uniform vec3 color;
uniform vec3 selectedColor;
uniform float timestepFraction;

uniform sampler2D triangle;
uniform sampler2D circle;

varying float vRotation;
varying float vShouldInterpolate;
varying float vIsSelected;

vec2 rotateCoordinates() {
    mat2 rotationMatrix = mat2(cos(vRotation), sin(vRotation), -sin(vRotation), cos(vRotation));

    vec2 centerBasedCoord = vec2(gl_PointCoord.x -0.5, gl_PointCoord.y - 0.5);
    vec2 centerBasedRotatedCoord = centerBasedCoord * rotationMatrix;
    return centerBasedRotatedCoord + 0.5;
}

vec4 getColor() {

    vec4 result;

    if (vIsSelected >= 1.0) {
        result = vec4(selectedColor, 1.0);
    }
    else {
        result = vec4(color, 1.0);
    }
    return result;
}

void main() {

    vec4 opaqueColor = getColor();

    if (vShouldInterpolate >= 1.0) {
        vec2 coord = rotateCoordinates();
        gl_FragColor = opaqueColor * texture2D(triangle, coord);
    } else {
        opaqueColor.a = 1.0 - timestepFraction;
        gl_FragColor = opaqueColor * texture2D(circle, gl_PointCoord);
    }

    if ( gl_FragColor.a < ALPHATEST ) discard;
}
******/
