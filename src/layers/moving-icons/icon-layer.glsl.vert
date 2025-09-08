#version 300 es
#define SHADER_NAME icon-layer-vertex-shader

in vec2 positions;

in vec3 instancePositions;
in vec3 instancePositions64Low;
in float instanceSizes;
in float instanceAngles;
in vec4 instanceColors;
in vec3 instancePickingColors;
in vec4 instanceIconFrames;
in float instanceColorModes;
in vec2 instanceOffsets;
in vec2 instancePixelOffset;
in float instanceColorCodes;

in float instanceTimestamps;
in float instanceTimestampsNext;
in vec2 instanceStartPositions;
in vec2 instanceEndPositions;

out float vColorMode;
out vec4 vColor;
out vec2 vTextureCoords;
out vec2 uv;

vec2 rotate_by_angle(vec2 vertex, float angle_radian) {
  float cos_angle = cos(angle_radian);
  float sin_angle = sin(angle_radian);
  mat2 rotationMatrix = mat2(cos_angle, -sin_angle, sin_angle, cos_angle);
  return rotationMatrix * vertex;
}

vec3 interpolate(in vec3 point1, in vec3 point2, in float timestepFraction) {
  if (timestepFraction <= 0.0) {
        return point1;
  } else if (timestepFraction >= 1.0 ) {
        return point2;
  } else {
        vec3 direction = point2 - point1;
        return point1 + (direction * timestepFraction);
  }
}

// // small random perturbance
// float rand(vec2 co) {
//   return 0.05 * (fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453) - 0.5);
// }

void main(void) {

  // Calculate progress:
  // Skip everything else if this vertex is outside the time window
  // Vertex shader has no "discard()" so we move the vertex outside "clipspace"
  float percentComplete;
  if (icon.currentTime < instanceTimestamps) {
    gl_Position = vec4(2.0,2.0,2.0,1.0);
    return;
  } else if (icon.currentTime >= instanceTimestampsNext) {
    gl_Position = vec4(2.0,2.0,2.0,1.0);
    return;
  } else {
    percentComplete = (icon.currentTime - instanceTimestamps) /
                       (instanceTimestampsNext - instanceTimestamps);
  }

  geometry.pickingColor = instancePickingColors;

  // float z = 5.0 + rand(instancePositions.xy);

  vec3 startPosition = vec3(instanceStartPositions, 5);
  vec3 endPosition = vec3(instanceEndPositions, 5);

  // are we stationary/still
  bool still = (instanceStartPositions == instanceEndPositions);

  vec2 iconSize = still ? icon.iconStillFrames.zw : instanceIconFrames.zw;
  // convert size in meters to pixels, then scaled and clamp
  // project meters to pixels and clamp to limits
  int sizeUnits = int(icon.sizeUnits);
  float sizePixels = clamp(
    project_size_to_pixel(instanceSizes * icon.sizeScale, sizeUnits),
    icon.sizeMinPixels, icon.sizeMaxPixels
  );

  // scale icon height to match instanceSize
  float instanceScale = iconSize.y == 0.0 ? 0.0 : sizePixels / iconSize.y;

  // // figure out angle based on motion direction - mind the latitude!
  float angle = 0.0;
  if (!still) {
    vec2 direction = endPosition.xy - startPosition.xy;
    angle = atan(direction.y , direction.x * icon.latitudeCorrectionFactor);
  }

  // scale and rotate vertex in "pixel" value and convert back to fraction in clipspace
  vec2 pixelOffset = positions / 2.0 * iconSize + (still ? icon.iconStillOffsets : instanceOffsets);
  pixelOffset = rotate_by_angle(pixelOffset, angle) * instanceScale;
  pixelOffset += instancePixelOffset;
  pixelOffset.y *= -1.0;

  vec3 newPosition = interpolate(startPosition, endPosition, percentComplete);

  if (icon.billboard)  {
    // billboard mode
    gl_Position = project_position_to_clipspace(newPosition, vec3(0.0), vec3(0.0), geometry.position);
    vec3 offset = vec3(pixelOffset, 0.0);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  } else {
    // flat-against-map mode
    vec3 offset_common = vec3(project_pixel_size(pixelOffset), 0.0);
    DECKGL_FILTER_SIZE(offset_common, geometry);
    gl_Position = project_position_to_clipspace(newPosition, vec3(0.0), offset_common, geometry.position);
  }
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // get the icon from the iconFrames
  vec2 upperleft = (still ? icon.iconStillFrames.xy : instanceIconFrames.xy);

  vTextureCoords = mix(
    upperleft,
    upperleft + iconSize,
    (positions.xy + 1.0) / 2.0
  ) / icon.iconsTextureDim;

  if (icon.colorDepiction == 1.0) {
    // COLORS: RELATIVE SPEED
    vColor = instanceColors;
    float bp1 = 0.20;
    float bp2 = 0.40;

    vec4 col1 = vec4(0.95, 0.0, 0.2, 1.0);
    vec4 col2 = vec4(0.90, 0.80, 0.0, 0.8);
    vec4 col3 = vec4(0.00, 0.75, 0.20, 1.0);
    vec4 col4 = vec4(0.15, 0.45, 0.98, 1.0);

    if (instanceColorCodes < bp1) {
      float t = instanceColorCodes / bp1;
      vColor = mix(col1, col2, t);
    } else if (instanceColorCodes < bp2) {
      float t = (instanceColorCodes - bp2 + bp1) / (bp2 - bp1);
      vColor =  mix(col2, col3, t);
    } else {
      float t = (instanceColorCodes - bp2) / (1.0 - bp2);
      vColor =  mix(col3, col4,  t);
    }
  } else {
  // COLORS: OCCUPANCY
    vColor = still ? vec4(0.5,0.5,0.5,1.0) : instanceColors;

    if (instanceColorCodes  == 1.0) {
      // green
      // vColor = vec4(0.0, 0.65, 0.0, 1.0);
      vColor = vec4(0.0, 0.75, 0.22, 1.0);
    } else if (instanceColorCodes == 2.0) {
      // yellow
      // vColor = vec4(0.85, 0.65, 0.0, 1.0);
      vColor = vec4(0.90, 0.80, 0.0, 1.0);
    } else if (instanceColorCodes == 3.0 ) {
      // red
      vColor = vec4(0.95, 0.0, 0.2, 1.0);
    }
  }

  DECKGL_FILTER_COLOR(vColor, geometry);

  vColorMode = instanceColorModes;
}
