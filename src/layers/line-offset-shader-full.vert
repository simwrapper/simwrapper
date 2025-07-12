#define SHADER_NAME line-layer-vertex-shader

attribute vec3 positions;
attribute vec3 instanceSourcePositions;
attribute vec3 instanceTargetPositions;
attribute vec3 instanceSourcePositions64Low;
attribute vec3 instanceTargetPositions64Low;
attribute vec4 instanceColors;
attribute vec3 instancePickingColors;
attribute float instanceWidths;

uniform float opacity;
uniform float widthScale;
uniform float widthMinPixels;
uniform float widthMaxPixels;
uniform float useShortestPath;
uniform int widthUnits;

uniform float offsetDirection;
uniform float bearing;

varying vec4 vColor;
varying vec2 uv;

vec3 splitLine(vec3 a, vec3 b, float x) {
  float t = (x - a.x) / (b.x - a.x);
  return vec3(x, mix(a.yz, b.yz, t));
}

void main(void) {
  geometry.worldPosition = instanceSourcePositions;
  geometry.worldPositionAlt = instanceTargetPositions;

  vec3 source_world = instanceSourcePositions;
  vec3 target_world = instanceTargetPositions;
  vec3 source_world_64low = instanceSourcePositions64Low;
  vec3 target_world_64low = instanceTargetPositions64Low;

  if (useShortestPath > 0.5 || useShortestPath < -0.5) {
    source_world.x = mod(source_world.x + 180., 360.0) - 180.;
    target_world.x = mod(target_world.x + 180., 360.0) - 180.;
    float deltaLng = target_world.x - source_world.x;
    if (deltaLng * useShortestPath > 180.) {
      source_world.x += 360. * useShortestPath;
      source_world = splitLine(source_world, target_world, 180. * useShortestPath);
      source_world_64low = vec3(0.0);
    } else if (deltaLng * useShortestPath < -180.) {
      target_world.x += 360. * useShortestPath;
      target_world = splitLine(source_world, target_world, 180. * useShortestPath);
      target_world_64low = vec3(0.0);
    } else if (useShortestPath < 0.) {
      // Line is not split, abort
      gl_Position = vec4(0.);
      return;
    }
  }

  // Linear interpolation to get the current vertex position along the line
  float segmentIndex = positions.x;
  vec3 current_world = mix(source_world, target_world, segmentIndex);

  // Project positions to common space to get the line direction in projected coordinates
  vec4 source_commonspace;
  vec4 target_commonspace;
  vec4 current_commonspace;

  project_position_to_clipspace(source_world, source_world_64low, vec3(0.), source_commonspace);
  project_position_to_clipspace(target_world, target_world_64low, vec3(0.), target_commonspace);
  project_position_to_clipspace(current_world, vec3(0.), vec3(0.), current_commonspace);

  // Calculate line direction in projected common space
  vec3 line_direction = normalize(target_commonspace.xyz - source_commonspace.xyz);

  // Get perpendicular direction in projected space (rotate 90 degrees in XY plane)
  vec3 perpendicular = vec3(-line_direction.y, line_direction.x, 0.0);

  // Compatibility factor makes widths approx what they used to be when the calcs were wrong
  float compatFactor = 0.25;

  // Calculate width in common space units
  float width_commonspace = project_size_to_pixel(instanceWidths * widthScale * compatFactor, widthUnits);
  width_commonspace = clamp(width_commonspace, widthMinPixels, widthMaxPixels);
  width_commonspace = project_pixel_size(width_commonspace);

  // Calculate offsets in common space
  vec3 lineWidthOffset = perpendicular * positions.y * width_commonspace;
  vec3 drivingSideOffset = perpendicular * offsetDirection * width_commonspace;

  // Apply offsets to the current position in common space
  vec3 offset_commonspace_position = current_commonspace.xyz + lineWidthOffset + drivingSideOffset;

  // Project the final position
  vec4 final_position = project_common_position_to_clipspace(vec4(offset_commonspace_position, 1.0));

  geometry.position = current_commonspace;
  uv = positions.xy;
  geometry.uv = uv;
  geometry.pickingColor = instancePickingColors;

  gl_Position = final_position;
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // Color
  vColor = vec4(instanceColors.rgb, instanceColors.a * opacity);
  DECKGL_FILTER_COLOR(vColor, geometry);
}