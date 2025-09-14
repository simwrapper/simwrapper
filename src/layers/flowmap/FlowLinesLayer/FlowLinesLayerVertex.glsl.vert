#version 300 es
/*
 * Copyright (c) Flowmap.gl contributors
 * Copyright (c) 2018-2020 Teralytics
 * SPDX-License-Identifier: Apache-2.0
 */
#define SHADER_NAME flow-line-layer-vertex-shader

in vec3 positions;
in vec3 normals;
in vec4 instanceColors;
in float instanceThickness;    // 0..0.5
in vec3 instanceSourcePositions;
in vec3 instanceTargetPositions;
in vec3 instanceSourcePositions64Low;
in vec3 instanceTargetPositions64Low;
in vec3 instancePickingColors;
in vec2 instanceEndpointOffsets;
in float instancePickable;

// uniform vec4 outlineColor;
// uniform float thicknessUnit;
// uniform float gap;
// uniform float opacity;

out vec4 vColor;
out vec2 uv;

void main(void) {
  geometry.worldPosition = instanceSourcePositions;
  geometry.worldPositionAlt = instanceTargetPositions;

  // Position
  vec4 source_commonspace;
  vec4 target_commonspace;
  vec4 source = project_position_to_clipspace(instanceSourcePositions, instanceSourcePositions64Low, vec3(0.), source_commonspace);
  vec4 target = project_position_to_clipspace(instanceTargetPositions, instanceTargetPositions64Low, vec3(0.), target_commonspace);

  // linear interpolation of source & target to pick right coord
  float sourceOrTarget = positions.x;
  geometry.position = mix(source_commonspace, target_commonspace, sourceOrTarget);
  uv = positions.xy;
  geometry.uv = uv;
  if (instancePickable > 0.5) {
    geometry.pickingColor = instancePickingColors;
  }

  // set the clamp limits in pixel size
  float lengthCommon = length(target_commonspace - source_commonspace);
  vec2 offsetDistances = project_pixel_size(positions.yz) * uni.thicknessUnit;

  vec2 limitedOffsetDistances = clamp(
    project_pixel_size(positions.yz) * uni.thicknessUnit,
    -lengthCommon*.8, lengthCommon*.8
  );
  float startOffsetCommon = project_pixel_size(instanceEndpointOffsets[0]);
  float endOffsetCommon = project_pixel_size(instanceEndpointOffsets[1]);
  float endpointOffset = mix(
    clamp(startOffsetCommon, 0.0, lengthCommon*.2),
    -clamp(endOffsetCommon, 0.0, lengthCommon*.2),
    positions.x
  );

  vec2 flowlineDir = normalize(target_commonspace.xy - source_commonspace.xy);
  vec2 perpendicularDir = vec2(-flowlineDir.y, flowlineDir.x);
  vec2 normalsCommon = project_pixel_size(normals.xy);
  float gapCommon = project_pixel_size(uni.gap);
  vec3 offsetCommon = vec3(
    flowlineDir * (instanceThickness * limitedOffsetDistances[1] + normalsCommon.y + endpointOffset * 1.05) -
    perpendicularDir * (instanceThickness * limitedOffsetDistances[0] + gapCommon + normalsCommon.x),
    0.0
  );

  DECKGL_FILTER_SIZE(offsetCommon, geometry);
  vec4 position_commonspace = mix(source_commonspace, target_commonspace, sourceOrTarget);
  vec4 offset_commonspace = vec4(offsetCommon, 0.0);
  gl_Position = project_common_position_to_clipspace(position_commonspace + offset_commonspace);

  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  vec4 fillColor = vec4(instanceColors.rgb, instanceColors.a * uni.opacity) / 255.;
  vColor = mix(fillColor, vec4(uni.outlineColor.xyz, uni.outlineColor.w * fillColor.w), normals.z);
  DECKGL_FILTER_COLOR(vColor, geometry);
}
