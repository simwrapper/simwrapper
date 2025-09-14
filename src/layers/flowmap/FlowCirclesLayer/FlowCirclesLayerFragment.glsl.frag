#version 300 es
/*
 * Copyright (c) Flowmap.gl contributors
 * Copyright (c) 2018-2020 Teralytics
 * SPDX-License-Identifier: Apache-2.0
 */
#define SHADER_NAME flow-circles-layer-fragment-shader
#define SOFT_OUTLINE 0.05

precision highp float;

in vec4 vColor;
in vec2 unitPosition;
in float unitInRadius;
in float unitOutRadius;

out vec4 fragColor;

void main(void) {
  geometry.uv = unitPosition;
  float distToCenter = length(unitPosition);

  // Discard fragments outside the circle
  if (distToCenter > 1.0) {
    discard;
  }

  vec4 finalColor = vColor;
  float alpha = vColor.a;

  // // Determine if this is a filled circle or a ring
  // bool isRing = unitInRadius < unitOutRadius;
  // float innerRadius = min(unitInRadius, unitOutRadius);
  // float outerRadius = max(unitInRadius, unitOutRadius);


  // if (isRing) {
  //   // Ring mode: hollow in the center
  //   if (distToCenter < innerRadius - SOFT_OUTLINE) {
  //     // Inside the inner circle - use empty color
  //     finalColor = vec4(uni.emptyColor.rgb / 255.0, 0.0);
  //     alpha = 0.0;
  //   } else if (distToCenter < innerRadius) {
  //     // Soft transition at inner edge
  //     float t = smoothstep(innerRadius - SOFT_OUTLINE, innerRadius, distToCenter);
  //     finalColor = mix(vec4(0., 0., 0., 0.0), vColor, t);
  //     alpha = vColor.a * t;
  //   } else if (distToCenter <= outerRadius) {
  //     // In the ring area
  //     finalColor = vColor;
  //     alpha = vColor.a;
  //   } else {
  //     // Outside the outer radius
  //     alpha = 0.0;
  //   }
  // } else {
  //   // Filled circle mode
  //   finalColor = vColor;
  //   alpha = vColor.a;
  // }

  // Apply soft edge anti-aliasing at the outer boundary
  if (distToCenter > 1.0 - SOFT_OUTLINE) {
    alpha *= smoothstep(1.0, 1.0 - SOFT_OUTLINE, distToCenter);
  }

  fragColor = vec4(finalColor.rgb, alpha);
  DECKGL_FILTER_COLOR(fragColor, geometry);
}