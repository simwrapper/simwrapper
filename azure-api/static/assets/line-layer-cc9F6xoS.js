import{_ as s,a as l,p as d,b as u,U as g,M as p,G as _}from"./set-rtl-text-plugin-_unXPnRK.js";const h=`#define SHADER_NAME line-layer-vertex-shader

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

varying vec4 vColor;
varying vec2 uv;

// offset vector by strokeWidth pixels
// offset_direction is -1 (left) or 1 (right)
vec2 getExtrusionOffset(vec2 line_clipspace, float offset_direction, float width) {
  // normalized direction of the line
  vec2 dir_screenspace = normalize(line_clipspace * project_uViewportSize);
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
    project_size_to_pixel(instanceWidths * widthScale, widthUnits),
    widthMinPixels, widthMaxPixels
  );

  // extrude
  vec3 offset = vec3(
    getExtrusionOffset(target.xy - source.xy, positions.y, widthPixels),
    0.0);
  DECKGL_FILTER_SIZE(offset, geometry);
  gl_Position = p + vec4(project_pixel_size_to_clipspace(offset.xy), 0.0, 0.0);
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // Color
  vColor = vec4(instanceColors.rgb, instanceColors.a * opacity);
  DECKGL_FILTER_COLOR(vColor, geometry);
}
`,v=`#define SHADER_NAME line-layer-fragment-shader

precision highp float;

varying vec4 vColor;
varying vec2 uv;

void main(void) {
  geometry.uv = uv;

  gl_FragColor = vColor;

  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`,w=[0,0,0,255],f={getSourcePosition:{type:"accessor",value:o=>o.sourcePosition},getTargetPosition:{type:"accessor",value:o=>o.targetPosition},getColor:{type:"accessor",value:w},getWidth:{type:"accessor",value:1},widthUnits:"pixels",widthScale:{type:"number",value:1,min:0},widthMinPixels:{type:"number",value:0,min:0},widthMaxPixels:{type:"number",value:Number.MAX_SAFE_INTEGER,min:0}};class r extends l{getShaders(){return super.getShaders({vs:h,fs:v,modules:[d,u]})}get wrapLongitude(){return!1}initializeState(){this.getAttributeManager().addInstanced({instanceSourcePositions:{size:3,type:5130,fp64:this.use64bitPositions(),transition:!0,accessor:"getSourcePosition"},instanceTargetPositions:{size:3,type:5130,fp64:this.use64bitPositions(),transition:!0,accessor:"getTargetPosition"},instanceColors:{size:this.props.colorFormat.length,type:5121,normalized:!0,transition:!0,accessor:"getColor",defaultValue:[0,0,0,255]},instanceWidths:{size:1,transition:!0,accessor:"getWidth",defaultValue:1}})}updateState(e){if(super.updateState(e),e.changeFlags.extensionsChanged){var t;const{gl:n}=this.context;(t=this.state.model)===null||t===void 0||t.delete(),this.state.model=this._getModel(n),this.getAttributeManager().invalidateAll()}}draw({uniforms:e}){const{widthUnits:t,widthScale:n,widthMinPixels:a,widthMaxPixels:c,wrapLongitude:i}=this.props;this.state.model.setUniforms(e).setUniforms({widthUnits:g[t],widthScale:n,widthMinPixels:a,widthMaxPixels:c,useShortestPath:i?1:0}).draw(),i&&this.state.model.setUniforms({useShortestPath:-1}).draw()}_getModel(e){const t=[0,-1,0,0,1,0,1,-1,0,1,1,0];return new p(e,{...this.getShaders(),id:this.props.id,geometry:new _({drawMode:5,attributes:{positions:new Float32Array(t)}}),isInstanced:!0})}}s(r,"layerName","LineLayer");s(r,"defaultProps",f);export{r as L};
