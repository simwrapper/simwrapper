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

vec4 getColor() {

    float opacity = 0.3;

    if (myInfectionStatus == 0.0) {
        return vec4(cSusceptible, opacity);  // susceptible; not moving

    } else if (myInfectionStatus == 1.0) {

        return vec4(cInfectedButNotContagious, opacity);  // infected; cyan

    } else if (myInfectionStatus == 2.0) {

        return vec4(cContagious, opacity);  // contagious; red

    } else if (myInfectionStatus == 3.0) {

        return vec4(cSymptomatic, opacity);

    } else if (myInfectionStatus == 4.0) {

        return vec4(cSeriouslyIll, opacity);

    } else if (myInfectionStatus == 5.0) {

        return vec4(cCritical, opacity);
    }
    return vec4(cRecovered, opacity);
}


void main() {
    // don't do anything if this trip is currently out of time bounds
    if (skip == 1.0) {

        gl_FragColor = vec4(0,0,0,0);

    } else {

        gl_FragColor = getColor();

    }
}
