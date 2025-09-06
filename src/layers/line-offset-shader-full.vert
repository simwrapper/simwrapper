#version 300 es
#define SHADER_NAME line-layer-vertex-shader

in vec3 positions;
in vec3 instanceSourcePositions;
in vec3 instanceTargetPositions;
in vec3 instanceSourcePositions64Low;
in vec3 instanceTargetPositions64Low;
in vec4 instanceColors;
in vec3 instancePickingColors;
in float instanceWidths;

out vec4 vColor;
out vec2 uv;

// offset vector by strokeWidth pixels
// offset_direction is -1 (left) or 1 (right)
vec2 getExtrusionOffset(vec2 line_clipspace, float offset_direction, float width) {
  // normalized direction of the line
  vec2 dir_screenspace = normalize(line_clipspace * project.viewportSize);
  // rotate by 90 degrees
  dir_screenspace = vec2(-dir_screenspace.y, dir_screenspace.x);

  return dir_screenspace * offset_direction * width / 2.0;
}

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

  if (line.useShortestPath > 0.5 || line.useShortestPath < -0.5) {
    source_world.x = mod(source_world.x + 180., 360.0) - 180.;
    target_world.x = mod(target_world.x + 180., 360.0) - 180.;
    float deltaLng = target_world.x - source_world.x;

    if (deltaLng * line.useShortestPath > 180.) {
      source_world.x += 360. * line.useShortestPath;
      source_world = splitLine(source_world, target_world, 180. * line.useShortestPath);
      source_world_64low = vec3(0.0);
    } else if (deltaLng * line.useShortestPath < -180.) {
      target_world.x += 360. * line.useShortestPath;
      target_world = splitLine(source_world, target_world, 180. * line.useShortestPath);
      target_world_64low = vec3(0.0);
    } else if (line.useShortestPath < 0.) {
      // Line is not split, abort
      gl_Position = vec4(0.);
      return;
    }
  }

  // Position
  vec4 source_commonspace;
  vec4 target_commonspace;
  vec4 source = project_position_to_clipspace(source_world, source_world_64low, vec3(0.), source_commonspace);
  vec4 target = project_position_to_clipspace(target_world, target_world_64low, vec3(0.), target_commonspace);

  // linear interpolation of source & target to pick right coord
  float segmentIndex = positions.x;
  vec4 p = mix(source, target, segmentIndex);
  geometry.position = mix(source_commonspace, target_commonspace, segmentIndex);
  uv = positions.xy;
  geometry.uv = uv;
  geometry.pickingColor = instancePickingColors;

  // Multiply out width and clamp to limits
  float widthPixels = clamp(
    project_size_to_pixel(instanceWidths * line.widthScale, line.widthUnits),
    line.widthMinPixels, line.widthMaxPixels
  );

  // --- extrude: shift the whole stroke to the RIGHT so inner edge sits on the centerline ---
  // Compute screen-space normal (pixels)
  vec2 dir_clipspace = target.xy - source.xy;
  vec2 dir_screenspace = normalize(dir_clipspace * project.viewportSize);
  vec2 normal_screenspace = vec2(-dir_screenspace.y, dir_screenspace.x);

  // Map positions.y (-1 or +1) -> sideFactor (0 or 1):
  //  - positions.y == -1 => sideFactor = 0  (inner edge, on the centerline)
  //  - positions.y == +1 => sideFactor = 1  (outer edge, widthPixels away to the right)
  float sideFactor = udata.offsetDirection * (positions.y + 1.0) * 0.5;

  // Final offset in *pixels*
  vec2 offset_pixels = normal_screenspace * sideFactor * widthPixels;

  // If the stroke ends up on the left instead of the right, flip the normal:
  // offset_pixels = -offset_pixels;

  vec3 offset = vec3(offset_pixels, 0.0);
  DECKGL_FILTER_SIZE(offset, geometry);
  DECKGL_FILTER_GL_POSITION(p, geometry);
  gl_Position = p + vec4(project_pixel_size_to_clipspace(offset.xy), 0.0, 0.0);

  // Color
  vColor = vec4(instanceColors.rgb, instanceColors.a * layer.opacity);
  DECKGL_FILTER_COLOR(vColor, geometry);
}
