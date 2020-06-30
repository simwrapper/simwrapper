// vertex shader: agent positions

uniform float simulationTime;
uniform float showSusceptible;

attribute vec3 position2;  // x,y,t

/**
 * First, second, third infection statuses are in .xyz each
 */
attribute vec3 infectionTime;
attribute vec3 infectionStatus;

// this gets passed from vertex to fragment shader
varying float myInfectionStatus;
varying float skip;
varying float atRest;

float calculateStatus() {

    // are we before the first infection state?
    if (simulationTime < infectionTime.x) return 0.0;

    // is there only one infection state?
    if (infectionStatus.y == -1.0) return infectionStatus.x;

    // are we before the second infection state?
    if (simulationTime < infectionTime.y) return infectionStatus.x;

    // are there only two infection states?
    if (infectionTime.z == -1.0) return infectionStatus.y;

    // are we before the third infection state?
    if (simulationTime < infectionTime.z) return infectionStatus.y;

    // there can only be three infection states, and we are at the end
    return infectionStatus.z;
}


float calculateSize() {

    float small = 2.0;
    float med = 5.0;
    float big = 8.0;

    if (myInfectionStatus == 0.0) return small;
    else if (myInfectionStatus == 1.0) return big;
    else if (myInfectionStatus < 6.0) return med;
    return med;
}

float calculateTimestep(in vec3 point1, in vec3 point2) {

    atRest = 0.0;

    if (point1 == point2) {
        atRest = 1.0;
        return 0.0;
    }

    // position vars have time in the .z to save some space
    if (simulationTime < position.z) return 0.0;
    if (simulationTime > position2.z) return 1.0;

    float progress = simulationTime - position.z;
    float duration = position2.z - position.z;

    return progress / duration;
}


vec3 interpolate(in vec3 point1, in vec3 point2, in float timestepFraction) {

    if (timestepFraction == 0.0) {

        return point1;

    } else if (timestepFraction >= 1.0 ) {

        return point2;

    } else {

        vec3 direction = point2 - point1;

        return (direction * timestepFraction) + point1;
    }
}


void main() {

    // don't do anything if person is unaffected all day
    if (showSusceptible == 0.0 && infectionStatus.x == 0.0 && infectionStatus.y == -1.0) {
        gl_PointSize = 0.0;
        gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
        skip = 1.0;
        return;
    }

    myInfectionStatus = calculateStatus();

    // don't do anything if this trip is currently out of time bounds
    if (simulationTime < position.z || simulationTime > position2.z) {
        gl_PointSize = 0.0;
        gl_Position = vec4(0.0, 0.0, 0.0, 0.0);
        skip = 1.0;
        return;

    } else {

        // figure out z-index based on infection status
        float zIndex = 0.2;
        if (myInfectionStatus == 0.0) zIndex = 0.1;
        else if (myInfectionStatus == 1.0) zIndex = 0.3;
        else if (myInfectionStatus == 2.0) zIndex = 0.4;

        // unpack coords from position buffers - x,y,time. Deal w/ z later
        vec3 point1 = vec3(position.xy, zIndex);
        vec3 point2 = vec3(position2.xy, zIndex);

        float timestepFraction = calculateTimestep(point1, point2);

        vec3 newPosition = interpolate(point1, point2, timestepFraction);

        gl_PointSize = calculateSize();
        gl_Position = projectionMatrix * modelViewMatrix * vec4(newPosition, 1.0);

        skip = 0.0;
   }
}
