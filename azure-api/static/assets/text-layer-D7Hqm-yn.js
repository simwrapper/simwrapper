import{_ as h,a as W,f as ye,g as Ce,T as le,h as Pe,I as be,j as Le,k as ce,p as D,b as N,U as R,M as H,G,l as B}from"./set-rtl-text-plugin-_unXPnRK.js";import{b as Se}from"./index-DuMxCAme.js";const Me="compositeLayer.renderLayers";class ge extends W{get isComposite(){return!0}get isLoaded(){return super.isLoaded&&this.getSubLayers().every(e=>e.isLoaded)}getSubLayers(){return this.internalState&&this.internalState.subLayers||[]}initializeState(e){}setState(e){super.setState(e),this.setNeedsUpdate()}getPickingInfo({info:e}){const{object:t}=e;return t&&t.__source&&t.__source.parent&&t.__source.parent.id===this.id&&(e.object=t.__source.object,e.index=t.__source.index),e}filterSubLayer(e){return!0}shouldRenderSubLayer(e,t){return t&&t.length}getSubLayerClass(e,t){const{_subLayerProps:n}=this.props;return n&&n[e]&&n[e].type||t}getSubLayerRow(e,t,n){return e.__source={parent:this,object:t,index:n},e}getSubLayerAccessor(e){if(typeof e=="function"){const t={index:-1,data:this.props.data,target:[]};return(n,i)=>n&&n.__source?(t.index=n.__source.index,e(n.__source.object,t)):e(n,i)}return e}getSubLayerProps(e={}){var t;const{opacity:n,pickable:i,visible:o,parameters:a,getPolygonOffset:s,highlightedObjectIndex:l,autoHighlight:c,highlightColor:g,coordinateSystem:u,coordinateOrigin:d,wrapLongitude:f,positionFormat:p,modelMatrix:x,extensions:y,fetch:v,operation:S,_subLayerProps:_}=this.props,P={id:"",updateTriggers:{},opacity:n,pickable:i,visible:o,parameters:a,getPolygonOffset:s,highlightedObjectIndex:l,autoHighlight:c,highlightColor:g,coordinateSystem:u,coordinateOrigin:d,wrapLongitude:f,positionFormat:p,modelMatrix:x,extensions:y,fetch:v,operation:S},C=_&&e.id&&_[e.id],b=C&&C.updateTriggers,E=e.id||"sublayer";if(C){const T=this.constructor._propTypes,M=e.type?e.type._propTypes:{};for(const z in C){const I=M[z]||T[z];I&&I.type==="accessor"&&(C[z]=this.getSubLayerAccessor(C[z]))}}Object.assign(P,e,C),P.id="".concat(this.props.id,"-").concat(E),P.updateTriggers={all:(t=this.props.updateTriggers)===null||t===void 0?void 0:t.all,...e.updateTriggers,...b};for(const T of y){const M=T.getSubLayerProps.call(this,T);M&&Object.assign(P,M,{updateTriggers:Object.assign(P.updateTriggers,M.updateTriggers)})}return P}_updateAutoHighlight(e){for(const t of this.getSubLayers())t.updateAutoHighlight(e)}_getAttributeManager(){return null}_postUpdate(e,t){let n=this.internalState.subLayers;const i=!n||this.needsUpdate();if(i){const o=this.renderLayers();n=ye(o,Boolean),this.internalState.subLayers=n}Ce(Me,this,i,n);for(const o of n)o.parent=this}}h(ge,"layerName","CompositeLayer");const Te=`#define SHADER_NAME icon-layer-vertex-shader

attribute vec2 positions;

attribute vec3 instancePositions;
attribute vec3 instancePositions64Low;
attribute float instanceSizes;
attribute float instanceAngles;
attribute vec4 instanceColors;
attribute vec3 instancePickingColors;
attribute vec4 instanceIconFrames;
attribute float instanceColorModes;
attribute vec2 instanceOffsets;
attribute vec2 instancePixelOffset;

uniform float sizeScale;
uniform vec2 iconsTextureDim;
uniform float sizeMinPixels;
uniform float sizeMaxPixels;
uniform bool billboard;
uniform int sizeUnits;

varying float vColorMode;
varying vec4 vColor;
varying vec2 vTextureCoords;
varying vec2 uv;

vec2 rotate_by_angle(vec2 vertex, float angle) {
  float angle_radian = angle * PI / 180.0;
  float cos_angle = cos(angle_radian);
  float sin_angle = sin(angle_radian);
  mat2 rotationMatrix = mat2(cos_angle, -sin_angle, sin_angle, cos_angle);
  return rotationMatrix * vertex;
}

void main(void) {
  geometry.worldPosition = instancePositions;
  geometry.uv = positions;
  geometry.pickingColor = instancePickingColors;
  uv = positions;

  vec2 iconSize = instanceIconFrames.zw;
  // convert size in meters to pixels, then scaled and clamp
 
  // project meters to pixels and clamp to limits 
  float sizePixels = clamp(
    project_size_to_pixel(instanceSizes * sizeScale, sizeUnits), 
    sizeMinPixels, sizeMaxPixels
  );

  // scale icon height to match instanceSize
  float instanceScale = iconSize.y == 0.0 ? 0.0 : sizePixels / iconSize.y;

  // scale and rotate vertex in "pixel" value and convert back to fraction in clipspace
  vec2 pixelOffset = positions / 2.0 * iconSize + instanceOffsets;
  pixelOffset = rotate_by_angle(pixelOffset, instanceAngles) * instanceScale;
  pixelOffset += instancePixelOffset;
  pixelOffset.y *= -1.0;

  if (billboard)  {
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
    vec3 offset = vec3(pixelOffset, 0.0);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);

  } else {
    vec3 offset_common = vec3(project_pixel_size(pixelOffset), 0.0);
    DECKGL_FILTER_SIZE(offset_common, geometry);
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset_common, geometry.position); 
  }
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  vTextureCoords = mix(
    instanceIconFrames.xy,
    instanceIconFrames.xy + iconSize,
    (positions.xy + 1.0) / 2.0
  ) / iconsTextureDim;

  vColor = instanceColors;
  DECKGL_FILTER_COLOR(vColor, geometry);

  vColorMode = instanceColorModes;
}
`,ze=`#define SHADER_NAME icon-layer-fragment-shader

precision highp float;

uniform float opacity;
uniform sampler2D iconsTexture;
uniform float alphaCutoff;

varying float vColorMode;
varying vec4 vColor;
varying vec2 vTextureCoords;
varying vec2 uv;

void main(void) {
  geometry.uv = uv;

  vec4 texColor = texture2D(iconsTexture, vTextureCoords);

  // if colorMode == 0, use pixel color from the texture
  // if colorMode == 1 or rendering picking buffer, use texture as transparency mask
  vec3 color = mix(texColor.rgb, vColor.rgb, vColorMode);
  // Take the global opacity and the alpha from vColor into account for the alpha component
  float a = texColor.a * opacity * vColor.a;

  if (a < alphaCutoff) {
    discard;
  }

  gl_FragColor = vec4(color, a);
  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`,Ae=1024,Ee=4,Y=()=>{},Z={10241:9987,10240:9729,10242:33071,10243:33071};function Ie(r){return Math.pow(2,Math.ceil(Math.log2(r)))}function we(r,e,t,n){return t===e.width&&n===e.height?e:(r.canvas.height=n,r.canvas.width=t,r.clearRect(0,0,r.canvas.width,r.canvas.height),r.drawImage(e,0,0,e.width,e.height,0,0,t,n),r.canvas)}function F(r){return r&&(r.id||r.url)}function Fe(r,e,t,n){const i=r.width,o=r.height,a=new le(r.gl,{width:e,height:t,parameters:n});return Le(r,a,{targetY:0,width:i,height:o}),r.delete(),a}function q(r,e,t){for(let n=0;n<e.length;n++){const{icon:i,xOffset:o}=e[n],a=F(i);r[a]={...i,x:o,y:t}}}function Oe({icons:r,buffer:e,mapping:t={},xOffset:n=0,yOffset:i=0,rowHeight:o=0,canvasWidth:a}){let s=[];for(let l=0;l<r.length;l++){const c=r[l],g=F(c);if(!t[g]){const{height:u,width:d}=c;n+d+e>a&&(q(t,s,i),n=0,i=o+i+e,o=0,s=[]),s.push({icon:c,xOffset:n}),n=n+d+e,o=Math.max(o,u)}}return s.length>0&&q(t,s,i),{mapping:t,rowHeight:o,xOffset:n,yOffset:i,canvasWidth:a,canvasHeight:Ie(o+i+e)}}function Re(r,e,t){if(!r||!e)return null;t=t||{};const n={},{iterable:i,objectInfo:o}=ce(r);for(const a of i){o.index++;const s=e(a,o),l=F(s);if(!s)throw new Error("Icon is missing.");if(!s.url)throw new Error("Icon url is missing.");!n[l]&&(!t[l]||s.url!==t[l].url)&&(n[l]={...s,source:a,sourceIndex:o.index})}return n}class ke{constructor(e,{onUpdate:t=Y,onError:n=Y}){h(this,"gl",void 0),h(this,"onUpdate",void 0),h(this,"onError",void 0),h(this,"_loadOptions",null),h(this,"_texture",null),h(this,"_externalTexture",null),h(this,"_mapping",{}),h(this,"_textureParameters",null),h(this,"_pendingCount",0),h(this,"_autoPacking",!1),h(this,"_xOffset",0),h(this,"_yOffset",0),h(this,"_rowHeight",0),h(this,"_buffer",Ee),h(this,"_canvasWidth",Ae),h(this,"_canvasHeight",0),h(this,"_canvas",null),this.gl=e,this.onUpdate=t,this.onError=n}finalize(){var e;(e=this._texture)===null||e===void 0||e.delete()}getTexture(){return this._texture||this._externalTexture}getIconMapping(e){const t=this._autoPacking?F(e):e;return this._mapping[t]||{}}setProps({loadOptions:e,autoPacking:t,iconAtlas:n,iconMapping:i,textureParameters:o}){if(e&&(this._loadOptions=e),t!==void 0&&(this._autoPacking=t),i&&(this._mapping=i),n){var a;(a=this._texture)===null||a===void 0||a.delete(),this._texture=null,this._externalTexture=n}o&&(this._textureParameters=o)}get isLoaded(){return this._pendingCount===0}packIcons(e,t){if(!this._autoPacking||typeof document>"u")return;const n=Object.values(Re(e,t,this._mapping)||{});if(n.length>0){const{mapping:i,xOffset:o,yOffset:a,rowHeight:s,canvasHeight:l}=Oe({icons:n,buffer:this._buffer,canvasWidth:this._canvasWidth,mapping:this._mapping,rowHeight:this._rowHeight,xOffset:this._xOffset,yOffset:this._yOffset});this._rowHeight=s,this._mapping=i,this._xOffset=o,this._yOffset=a,this._canvasHeight=l,this._texture||(this._texture=new le(this.gl,{width:this._canvasWidth,height:this._canvasHeight,parameters:this._textureParameters||Z})),this._texture.height!==this._canvasHeight&&(this._texture=Fe(this._texture,this._canvasWidth,this._canvasHeight,this._textureParameters||Z)),this.onUpdate(),this._canvas=this._canvas||document.createElement("canvas"),this._loadIcons(n)}}_loadIcons(e){const t=this._canvas.getContext("2d");for(const n of e)this._pendingCount++,Pe(n.url,be,this._loadOptions).then(i=>{const o=F(n),{x:a,y:s,width:l,height:c}=this._mapping[o],g=we(t,i,l,c);this._texture.setSubImageData({data:g,x:a,y:s,width:l,height:c}),this._texture.generateMipmap(),this.onUpdate()}).catch(i=>{this.onError({url:n.url,source:n.source,sourceIndex:n.sourceIndex,loadOptions:this._loadOptions,error:i})}).finally(()=>{this._pendingCount--})}}const ue=[0,0,0,255],We={iconAtlas:{type:"image",value:null,async:!0},iconMapping:{type:"object",value:{},async:!0},sizeScale:{type:"number",value:1,min:0},billboard:!0,sizeUnits:"pixels",sizeMinPixels:{type:"number",min:0,value:0},sizeMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},alphaCutoff:{type:"number",value:.05,min:0,max:1},getPosition:{type:"accessor",value:r=>r.position},getIcon:{type:"accessor",value:r=>r.icon},getColor:{type:"accessor",value:ue},getSize:{type:"accessor",value:1},getAngle:{type:"accessor",value:0},getPixelOffset:{type:"accessor",value:[0,0]},onIconError:{type:"function",value:null,compare:!1,optional:!0}};class j extends W{constructor(...e){super(...e),h(this,"state",void 0)}getShaders(){return super.getShaders({vs:Te,fs:ze,modules:[D,N]})}initializeState(){this.state={iconManager:new ke(this.context.gl,{onUpdate:this._onUpdate.bind(this),onError:this._onError.bind(this)})},this.getAttributeManager().addInstanced({instancePositions:{size:3,type:5130,fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceSizes:{size:1,transition:!0,accessor:"getSize",defaultValue:1},instanceOffsets:{size:2,accessor:"getIcon",transform:this.getInstanceOffset},instanceIconFrames:{size:4,accessor:"getIcon",transform:this.getInstanceIconFrame},instanceColorModes:{size:1,type:5121,accessor:"getIcon",transform:this.getInstanceColorMode},instanceColors:{size:this.props.colorFormat.length,type:5121,normalized:!0,transition:!0,accessor:"getColor",defaultValue:ue},instanceAngles:{size:1,transition:!0,accessor:"getAngle"},instancePixelOffset:{size:2,transition:!0,accessor:"getPixelOffset"}})}updateState(e){super.updateState(e);const{props:t,oldProps:n,changeFlags:i}=e,o=this.getAttributeManager(),{iconAtlas:a,iconMapping:s,data:l,getIcon:c,textureParameters:g}=t,{iconManager:u}=this.state,d=a||this.internalState.isAsyncPropLoading("iconAtlas");if(u.setProps({loadOptions:t.loadOptions,autoPacking:!d,iconAtlas:a,iconMapping:d?s:null,textureParameters:g}),d?n.iconMapping!==t.iconMapping&&o.invalidate("getIcon"):(i.dataChanged||i.updateTriggersChanged&&(i.updateTriggersChanged.all||i.updateTriggersChanged.getIcon))&&u.packIcons(l,c),i.extensionsChanged){var f;const{gl:p}=this.context;(f=this.state.model)===null||f===void 0||f.delete(),this.state.model=this._getModel(p),o.invalidateAll()}}get isLoaded(){return super.isLoaded&&this.state.iconManager.isLoaded}finalizeState(e){super.finalizeState(e),this.state.iconManager.finalize()}draw({uniforms:e}){const{sizeScale:t,sizeMinPixels:n,sizeMaxPixels:i,sizeUnits:o,billboard:a,alphaCutoff:s}=this.props,{iconManager:l}=this.state,c=l.getTexture();c&&this.state.model.setUniforms(e).setUniforms({iconsTexture:c,iconsTextureDim:[c.width,c.height],sizeUnits:R[o],sizeScale:t,sizeMinPixels:n,sizeMaxPixels:i,billboard:a,alphaCutoff:s}).draw()}_getModel(e){const t=[-1,-1,-1,1,1,1,1,-1];return new H(e,{...this.getShaders(),id:this.props.id,geometry:new G({drawMode:6,attributes:{positions:{size:2,value:new Float32Array(t)}}}),isInstanced:!0})}_onUpdate(){this.setNeedsRedraw()}_onError(e){var t;const n=(t=this.getCurrentLayer())===null||t===void 0?void 0:t.props.onIconError;n?n(e):B.error(e.error.message)()}getInstanceOffset(e){const{width:t,height:n,anchorX:i=t/2,anchorY:o=n/2}=this.state.iconManager.getIconMapping(e);return[t/2-i,n/2-o]}getInstanceColorMode(e){return this.state.iconManager.getIconMapping(e).mask?1:0}getInstanceIconFrame(e){const{x:t,y:n,width:i,height:o}=this.state.iconManager.getIconMapping(e);return[t,n,i,o]}}h(j,"defaultProps",We);h(j,"layerName","IconLayer");const Be=`#define SHADER_NAME scatterplot-layer-vertex-shader

attribute vec3 positions;

attribute vec3 instancePositions;
attribute vec3 instancePositions64Low;
attribute float instanceRadius;
attribute float instanceLineWidths;
attribute vec4 instanceFillColors;
attribute vec4 instanceLineColors;
attribute vec3 instancePickingColors;

uniform float opacity;
uniform float radiusScale;
uniform float radiusMinPixels;
uniform float radiusMaxPixels;
uniform float lineWidthScale;
uniform float lineWidthMinPixels;
uniform float lineWidthMaxPixels;
uniform float stroked;
uniform bool filled;
uniform bool antialiasing;
uniform bool billboard;
uniform int radiusUnits;
uniform int lineWidthUnits;

varying vec4 vFillColor;
varying vec4 vLineColor;
varying vec2 unitPosition;
varying float innerUnitRadius;
varying float outerRadiusPixels;


void main(void) {
  geometry.worldPosition = instancePositions;

  // Multiply out radius and clamp to limits
  outerRadiusPixels = clamp(
    project_size_to_pixel(radiusScale * instanceRadius, radiusUnits),
    radiusMinPixels, radiusMaxPixels
  );
  
  // Multiply out line width and clamp to limits
  float lineWidthPixels = clamp(
    project_size_to_pixel(lineWidthScale * instanceLineWidths, lineWidthUnits),
    lineWidthMinPixels, lineWidthMaxPixels
  );

  // outer radius needs to offset by half stroke width
  outerRadiusPixels += stroked * lineWidthPixels / 2.0;

  // Expand geometry to accomodate edge smoothing
  float edgePadding = antialiasing ? (outerRadiusPixels + SMOOTH_EDGE_RADIUS) / outerRadiusPixels : 1.0;

  // position on the containing square in [-1, 1] space
  unitPosition = edgePadding * positions.xy;
  geometry.uv = unitPosition;
  geometry.pickingColor = instancePickingColors;

  innerUnitRadius = 1.0 - stroked * lineWidthPixels / outerRadiusPixels;
  
  if (billboard) {
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
    vec3 offset = edgePadding * positions * outerRadiusPixels;
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  } else {
    vec3 offset = edgePadding * positions * project_pixel_size(outerRadiusPixels);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset, geometry.position);
  }

  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // Apply opacity to instance color, or return instance picking color
  vFillColor = vec4(instanceFillColors.rgb, instanceFillColors.a * opacity);
  DECKGL_FILTER_COLOR(vFillColor, geometry);
  vLineColor = vec4(instanceLineColors.rgb, instanceLineColors.a * opacity);
  DECKGL_FILTER_COLOR(vLineColor, geometry);
}
`,Ue=`#define SHADER_NAME scatterplot-layer-fragment-shader

precision highp float;

uniform bool filled;
uniform float stroked;
uniform bool antialiasing;

varying vec4 vFillColor;
varying vec4 vLineColor;
varying vec2 unitPosition;
varying float innerUnitRadius;
varying float outerRadiusPixels;

void main(void) {
  geometry.uv = unitPosition;

  float distToCenter = length(unitPosition) * outerRadiusPixels;
  float inCircle = antialiasing ? 
    smoothedge(distToCenter, outerRadiusPixels) : 
    step(distToCenter, outerRadiusPixels);

  if (inCircle == 0.0) {
    discard;
  }

  if (stroked > 0.5) {
    float isLine = antialiasing ? 
      smoothedge(innerUnitRadius * outerRadiusPixels, distToCenter) :
      step(innerUnitRadius * outerRadiusPixels, distToCenter);

    if (filled) {
      gl_FragColor = mix(vFillColor, vLineColor, isLine);
    } else {
      if (isLine == 0.0) {
        discard;
      }
      gl_FragColor = vec4(vLineColor.rgb, vLineColor.a * isLine);
    }
  } else if (filled) {
    gl_FragColor = vFillColor;
  } else {
    discard;
  }

  gl_FragColor.a *= inCircle;
  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`,$=[0,0,0,255],De={radiusUnits:"meters",radiusScale:{type:"number",min:0,value:1},radiusMinPixels:{type:"number",min:0,value:0},radiusMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},lineWidthUnits:"meters",lineWidthScale:{type:"number",min:0,value:1},lineWidthMinPixels:{type:"number",min:0,value:0},lineWidthMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},stroked:!1,filled:!0,billboard:!1,antialiasing:!0,getPosition:{type:"accessor",value:r=>r.position},getRadius:{type:"accessor",value:1},getFillColor:{type:"accessor",value:$},getLineColor:{type:"accessor",value:$},getLineWidth:{type:"accessor",value:1},strokeWidth:{deprecatedFor:"getLineWidth"},outline:{deprecatedFor:"stroked"},getColor:{deprecatedFor:["getFillColor","getLineColor"]}};class de extends W{getShaders(){return super.getShaders({vs:Be,fs:Ue,modules:[D,N]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:5130,fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceRadius:{size:1,transition:!0,accessor:"getRadius",defaultValue:1},instanceFillColors:{size:this.props.colorFormat.length,transition:!0,normalized:!0,type:5121,accessor:"getFillColor",defaultValue:[0,0,0,255]},instanceLineColors:{size:this.props.colorFormat.length,transition:!0,normalized:!0,type:5121,accessor:"getLineColor",defaultValue:[0,0,0,255]},instanceLineWidths:{size:1,transition:!0,accessor:"getLineWidth",defaultValue:1}})}updateState(e){if(super.updateState(e),e.changeFlags.extensionsChanged){var t;const{gl:n}=this.context;(t=this.state.model)===null||t===void 0||t.delete(),this.state.model=this._getModel(n),this.getAttributeManager().invalidateAll()}}draw({uniforms:e}){const{radiusUnits:t,radiusScale:n,radiusMinPixels:i,radiusMaxPixels:o,stroked:a,filled:s,billboard:l,antialiasing:c,lineWidthUnits:g,lineWidthScale:u,lineWidthMinPixels:d,lineWidthMaxPixels:f}=this.props;this.state.model.setUniforms(e).setUniforms({stroked:a?1:0,filled:s,billboard:l,antialiasing:c,radiusUnits:R[t],radiusScale:n,radiusMinPixels:i,radiusMaxPixels:o,lineWidthUnits:R[g],lineWidthScale:u,lineWidthMinPixels:d,lineWidthMaxPixels:f}).draw()}_getModel(e){const t=[-1,-1,0,1,-1,0,1,1,0,-1,1,0];return new H(e,{...this.getShaders(),id:this.props.id,geometry:new G({drawMode:6,vertexCount:4,attributes:{positions:{size:3,value:new Float32Array(t)}}}),isInstanced:!0})}}h(de,"defaultProps",De);h(de,"layerName","ScatterplotLayer");const Ne=`#define SHADER_NAME multi-icon-layer-fragment-shader

precision highp float;

uniform float opacity;
uniform sampler2D iconsTexture;
uniform float gamma;
uniform bool sdf;
uniform float alphaCutoff;
uniform float buffer;
uniform float outlineBuffer;
uniform vec4 outlineColor;

varying vec4 vColor;
varying vec2 vTextureCoords;
varying vec2 uv;

void main(void) {
  geometry.uv = uv;

  if (!picking_uActive) {
    float alpha = texture2D(iconsTexture, vTextureCoords).a;
    vec4 color = vColor;

    // if enable sdf (signed distance fields)
    if (sdf) {
      float distance = alpha;
      alpha = smoothstep(buffer - gamma, buffer + gamma, distance);

      if (outlineBuffer > 0.0) {
        float inFill = alpha;
        float inBorder = smoothstep(outlineBuffer - gamma, outlineBuffer + gamma, distance);
        color = mix(outlineColor, vColor, inFill);
        alpha = inBorder;
      }
    }

    // Take the global opacity and the alpha from color into account for the alpha component
    float a = alpha * color.a;
    
    if (a < alphaCutoff) {
      discard;
    }

    gl_FragColor = vec4(color.rgb, a * opacity);
  }

  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`,J=192/256,Q=[],He={getIconOffsets:{type:"accessor",value:r=>r.offsets},alphaCutoff:.001,smoothing:.1,outlineWidth:0,outlineColor:{type:"color",value:[0,0,0,255]}};class K extends j{constructor(...e){super(...e),h(this,"state",void 0)}getShaders(){return{...super.getShaders(),fs:Ne}}initializeState(){super.initializeState(),this.getAttributeManager().addInstanced({instanceOffsets:{size:2,accessor:"getIconOffsets"},instancePickingColors:{type:5121,size:3,accessor:(t,{index:n,target:i})=>this.encodePickingColor(n,i)}})}updateState(e){super.updateState(e);const{props:t,oldProps:n}=e;let{outlineColor:i}=t;i!==n.outlineColor&&(i=i.map(o=>o/255),i[3]=Number.isFinite(i[3])?i[3]:1,this.setState({outlineColor:i})),!t.sdf&&t.outlineWidth&&B.warn("".concat(this.id,": fontSettings.sdf is required to render outline"))()}draw(e){const{sdf:t,smoothing:n,outlineWidth:i}=this.props,{outlineColor:o}=this.state;e.uniforms={...e.uniforms,buffer:J,outlineBuffer:i?Math.max(n,J*(1-i)):-1,gamma:n,sdf:!!t,outlineColor:o},super.draw(e)}getInstanceOffset(e){return e?Array.from(e).flatMap(t=>super.getInstanceOffset(t)):Q}getInstanceColorMode(e){return 1}getInstanceIconFrame(e){return e?Array.from(e).flatMap(t=>super.getInstanceIconFrame(t)):Q}}h(K,"defaultProps",He);h(K,"layerName","MultiIconLayer");var V={exports:{}};V.exports=O;V.exports.default=O;var A=1e20;function O(r,e,t,n,i,o){this.fontSize=r||24,this.buffer=e===void 0?3:e,this.cutoff=n||.25,this.fontFamily=i||"sans-serif",this.fontWeight=o||"normal",this.radius=t||8;var a=this.size=this.fontSize+this.buffer*2,s=a+this.buffer*2;this.canvas=document.createElement("canvas"),this.canvas.width=this.canvas.height=a,this.ctx=this.canvas.getContext("2d"),this.ctx.font=this.fontWeight+" "+this.fontSize+"px "+this.fontFamily,this.ctx.textAlign="left",this.ctx.fillStyle="black",this.gridOuter=new Float64Array(s*s),this.gridInner=new Float64Array(s*s),this.f=new Float64Array(s),this.z=new Float64Array(s+1),this.v=new Uint16Array(s),this.useMetrics=this.ctx.measureText("A").actualBoundingBoxLeft!==void 0,this.middle=Math.round(a/2*(navigator.userAgent.indexOf("Gecko/")>=0?1.2:1))}function Ge(r,e,t,n,i,o,a){o.fill(A,0,e*t),a.fill(0,0,e*t);for(var s=(e-n)/2,l=0;l<i;l++)for(var c=0;c<n;c++){var g=(l+s)*e+c+s,u=r.data[4*(l*n+c)+3]/255;if(u===1)o[g]=0,a[g]=A;else if(u===0)o[g]=A,a[g]=0;else{var d=Math.max(0,.5-u),f=Math.max(0,u-.5);o[g]=d*d,a[g]=f*f}}}function je(r,e,t,n,i,o,a){for(var s=0;s<e*t;s++){var l=Math.sqrt(n[s])-Math.sqrt(i[s]);r[s]=Math.round(255-255*(l/o+a))}}O.prototype._draw=function(r,e){var t=this.ctx.measureText(r),n=t.width,i=2*this.buffer,o,a,s,l,c,g,u,d;e&&this.useMetrics?(c=Math.floor(t.actualBoundingBoxAscent),d=this.buffer+Math.ceil(t.actualBoundingBoxAscent),g=this.buffer,u=this.buffer,a=Math.min(this.size,Math.ceil(t.actualBoundingBoxRight-t.actualBoundingBoxLeft)),l=Math.min(this.size-g,Math.ceil(t.actualBoundingBoxAscent+t.actualBoundingBoxDescent)),o=a+i,s=l+i,this.ctx.textBaseline="alphabetic"):(o=a=this.size,s=l=this.size,c=19*this.fontSize/24,g=u=0,d=this.middle,this.ctx.textBaseline="middle");var f;a&&l&&(this.ctx.clearRect(u,g,a,l),this.ctx.fillText(r,this.buffer,d),f=this.ctx.getImageData(u,g,a,l));var p=new Uint8ClampedArray(o*s);return Ge(f,o,s,a,l,this.gridOuter,this.gridInner),ee(this.gridOuter,o,s,this.f,this.v,this.z),ee(this.gridInner,o,s,this.f,this.v,this.z),je(p,o,s,this.gridOuter,this.gridInner,this.radius,this.cutoff),{data:p,metrics:{width:a,height:l,sdfWidth:o,sdfHeight:s,top:c,left:0,advance:n}}};O.prototype.draw=function(r){return this._draw(r,!1).data};O.prototype.drawWithMetrics=function(r){return this._draw(r,!0)};function ee(r,e,t,n,i,o){for(var a=0;a<e;a++)te(r,a,e,t,n,i,o);for(var s=0;s<t;s++)te(r,s*e,1,e,n,i,o)}function te(r,e,t,n,i,o,a){var s,l,c,g;for(o[0]=0,a[0]=-A,a[1]=A,s=0;s<n;s++)i[s]=r[e+s*t];for(s=1,l=0,c=0;s<n;s++){do g=o[l],c=(i[s]-i[g]+s*s-g*g)/(s-g)/2;while(c<=a[l]&&--l>-1);l++,o[l]=s,a[l]=c,a[l+1]=A}for(s=0,l=0;s<n;s++){for(;a[l+1]<s;)l++;g=o[l],r[e+s*t]=i[g]+(s-g)*(s-g)}}var Ke=V.exports;const Ve=Se(Ke),Xe=32,Ye=[];function Ze(r){return Math.pow(2,Math.ceil(Math.log2(r)))}function qe({characterSet:r,getFontWidth:e,fontHeight:t,buffer:n,maxCanvasWidth:i,mapping:o={},xOffset:a=0,yOffset:s=0}){let l=0,c=a;for(const u of r)if(!o[u]){const d=e(u);c+d+n*2>i&&(c=0,l++),o[u]={x:c+n,y:s+l*(t+n*2)+n,width:d,height:t},c+=d+n*2}const g=t+n*2;return{mapping:o,xOffset:c,yOffset:s+l*g,canvasHeight:Ze(s+(l+1)*g)}}function fe(r,e,t,n){let i=0;for(let a=e;a<t;a++){var o;const s=r[a];i+=((o=n[s])===null||o===void 0?void 0:o.width)||0}return i}function he(r,e,t,n,i,o){let a=e,s=0;for(let l=e;l<t;l++){const c=fe(r,l,l+1,i);s+c>n&&(a<l&&o.push(l),a=l,s=0),s+=c}return s}function $e(r,e,t,n,i,o){let a=e,s=e,l=e,c=0;for(let g=e;g<t;g++)if((r[g]===" "||r[g+1]===" "||g+1===t)&&(l=g+1),l>s){let u=fe(r,s,l,i);c+u>n&&(a<s&&(o.push(s),a=s,c=0),u>n&&(u=he(r,s,l,n,i,o),a=o[o.length-1])),s=l,c+=u}return c}function Je(r,e,t,n,i=0,o){o===void 0&&(o=r.length);const a=[];return e==="break-all"?he(r,i,o,t,n,a):$e(r,i,o,t,n,a),a}function Qe(r,e,t,n,i,o){let a=0,s=0;for(let l=e;l<t;l++){const c=r[l],g=n[c];g?(s||(s=g.height),i[l]=a+g.width/2,a+=g.width):(B.warn("Missing character: ".concat(c," (").concat(c.codePointAt(0),")"))(),i[l]=a,a+=Xe)}o[0]=a,o[1]=s}function ne(r,e,t,n,i){const o=Array.from(r),a=o.length,s=new Array(a),l=new Array(a),c=new Array(a),g=(t==="break-word"||t==="break-all")&&isFinite(n)&&n>0,u=[0,0],d=[0,0];let f=0,p=0,x=0;for(let y=0;y<=a;y++){const v=o[y];if((v===`
`||y===a)&&(x=y),x>p){const S=g?Je(o,t,n,i,p,x):Ye;for(let _=0;_<=S.length;_++){const P=_===0?p:S[_-1],C=_<S.length?S[_]:x;Qe(o,P,C,i,s,d);for(let b=P;b<C;b++)l[b]=f+d[1]/2,c[b]=d[0];f=f+d[1]*e,u[0]=Math.max(u[0],d[0])}p=x}v===`
`&&(s[p]=0,l[p]=0,c[p]=0,p++)}return u[1]=f,{x:s,y:l,rowWidth:c,size:u}}function et({value:r,length:e,stride:t,offset:n,startIndices:i,characterSet:o}){const a=r.BYTES_PER_ELEMENT,s=t?t/a:1,l=n?n/a:0,c=i[e]||Math.ceil((r.length-l)/s),g=o&&new Set,u=new Array(e);let d=r;if(s>1||l>0){const f=r.constructor;d=new f(c);for(let p=0;p<c;p++)d[p]=r[p*s+l]}for(let f=0;f<e;f++){const p=i[f],x=i[f+1]||c,y=d.subarray(p,x);u[f]=String.fromCodePoint.apply(null,y),g&&y.forEach(g.add,g)}if(g)for(const f of g)o.add(String.fromCodePoint(f));return{texts:u,characterCount:c}}class pe{constructor(e=5){h(this,"limit",void 0),h(this,"_cache",{}),h(this,"_order",[]),this.limit=e}get(e){const t=this._cache[e];return t&&(this._deleteOrder(e),this._appendOrder(e)),t}set(e,t){this._cache[e]?(this.delete(e),this._cache[e]=t,this._appendOrder(e)):(Object.keys(this._cache).length===this.limit&&this.delete(this._order[0]),this._cache[e]=t,this._appendOrder(e))}delete(e){this._cache[e]&&(delete this._cache[e],this._deleteOrder(e))}_deleteOrder(e){const t=this._order.indexOf(e);t>=0&&this._order.splice(t,1)}_appendOrder(e){this._order.push(e)}}function tt(){const r=[];for(let e=32;e<128;e++)r.push(String.fromCharCode(e));return r}const w={fontFamily:"Monaco, monospace",fontWeight:"normal",characterSet:tt(),fontSize:64,buffer:4,sdf:!1,cutoff:.25,radius:12,smoothing:.1},ie=1024,nt=.9,se=1.2,ve=3;let k=new pe(ve);function it(r,e){let t;typeof e=="string"?t=new Set(Array.from(e)):t=new Set(e);const n=k.get(r);if(!n)return t;for(const i in n.mapping)t.has(i)&&t.delete(i);return t}function st(r,e){for(let t=0;t<r.length;t++)e.data[4*t+3]=r[t]}function oe(r,e,t,n){r.font="".concat(n," ").concat(t,"px ").concat(e),r.fillStyle="#000",r.textBaseline="alphabetic",r.textAlign="left"}function ot(r){B.assert(Number.isFinite(r)&&r>=ve,"Invalid cache limit"),k=new pe(r)}class at{constructor(){h(this,"props",{...w}),h(this,"_key",void 0),h(this,"_atlas",void 0)}get texture(){return this._atlas}get mapping(){return this._atlas&&this._atlas.mapping}get scale(){return se}setProps(e={}){Object.assign(this.props,e);const t=this._key;this._key=this._getKey();const n=it(this._key,this.props.characterSet),i=k.get(this._key);if(i&&n.size===0){this._key!==t&&(this._atlas=i);return}const o=this._generateFontAtlas(this._key,n,i);this._atlas=o,k.set(this._key,o)}_generateFontAtlas(e,t,n){const{fontFamily:i,fontWeight:o,fontSize:a,buffer:s,sdf:l,radius:c,cutoff:g}=this.props;let u=n&&n.data;u||(u=document.createElement("canvas"),u.width=ie);const d=u.getContext("2d");oe(d,i,a,o);const{mapping:f,canvasHeight:p,xOffset:x,yOffset:y}=qe({getFontWidth:v=>d.measureText(v).width,fontHeight:a*se,buffer:s,characterSet:t,maxCanvasWidth:ie,...n&&{mapping:n.mapping,xOffset:n.xOffset,yOffset:n.yOffset}});if(u.height!==p){const v=d.getImageData(0,0,u.width,u.height);u.height=p,d.putImageData(v,0,0)}if(oe(d,i,a,o),l){const v=new Ve(a,s,c,g,i,o),S=d.getImageData(0,0,v.size,v.size);for(const _ of t)st(v.draw(_),S),d.putImageData(S,f[_].x-s,f[_].y+s)}else for(const v of t)d.fillText(v,f[v].x,f[v].y+a*nt);return{xOffset:x,yOffset:y,mapping:f,data:u,width:u.width,height:u.height}}_getKey(){const{fontFamily:e,fontWeight:t,fontSize:n,buffer:i,sdf:o,radius:a,cutoff:s}=this.props;return o?"".concat(e," ").concat(t," ").concat(n," ").concat(i," ").concat(a," ").concat(s):"".concat(e," ").concat(t," ").concat(n," ").concat(i)}}const rt=`#define SHADER_NAME text-background-layer-vertex-shader

attribute vec2 positions;

attribute vec3 instancePositions;
attribute vec3 instancePositions64Low;
attribute vec4 instanceRects;
attribute float instanceSizes;
attribute float instanceAngles;
attribute vec2 instancePixelOffsets;
attribute float instanceLineWidths;
attribute vec4 instanceFillColors;
attribute vec4 instanceLineColors;
attribute vec3 instancePickingColors;

uniform bool billboard;
uniform float opacity;
uniform float sizeScale;
uniform float sizeMinPixels;
uniform float sizeMaxPixels;
uniform vec4 padding;
uniform int sizeUnits;

varying vec4 vFillColor;
varying vec4 vLineColor;
varying float vLineWidth;
varying vec2 uv;
varying vec2 dimensions;

vec2 rotate_by_angle(vec2 vertex, float angle) {
  float angle_radian = radians(angle);
  float cos_angle = cos(angle_radian);
  float sin_angle = sin(angle_radian);
  mat2 rotationMatrix = mat2(cos_angle, -sin_angle, sin_angle, cos_angle);
  return rotationMatrix * vertex;
}

void main(void) {
  geometry.worldPosition = instancePositions;
  geometry.uv = positions;
  geometry.pickingColor = instancePickingColors;
  uv = positions;
  vLineWidth = instanceLineWidths;

  // convert size in meters to pixels, then scaled and clamp

  // project meters to pixels and clamp to limits
  float sizePixels = clamp(
    project_size_to_pixel(instanceSizes * sizeScale, sizeUnits),
    sizeMinPixels, sizeMaxPixels
  );

  dimensions = instanceRects.zw * sizePixels + padding.xy + padding.zw;

  vec2 pixelOffset = (positions * instanceRects.zw + instanceRects.xy) * sizePixels + mix(-padding.xy, padding.zw, positions);
  pixelOffset = rotate_by_angle(pixelOffset, instanceAngles);
  pixelOffset += instancePixelOffsets;
  pixelOffset.y *= -1.0;

  if (billboard)  {
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, vec3(0.0), geometry.position);
    vec3 offset = vec3(pixelOffset, 0.0);
    DECKGL_FILTER_SIZE(offset, geometry);
    gl_Position.xy += project_pixel_size_to_clipspace(offset.xy);
  } else {
    vec3 offset_common = vec3(project_pixel_size(pixelOffset), 0.0);
    DECKGL_FILTER_SIZE(offset_common, geometry);
    gl_Position = project_position_to_clipspace(instancePositions, instancePositions64Low, offset_common, geometry.position);
  }
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // Apply opacity to instance color, or return instance picking color
  vFillColor = vec4(instanceFillColors.rgb, instanceFillColors.a * opacity);
  DECKGL_FILTER_COLOR(vFillColor, geometry);
  vLineColor = vec4(instanceLineColors.rgb, instanceLineColors.a * opacity);
  DECKGL_FILTER_COLOR(vLineColor, geometry);
}
`,lt=`#define SHADER_NAME text-background-layer-fragment-shader

precision highp float;

uniform bool stroked;

varying vec4 vFillColor;
varying vec4 vLineColor;
varying float vLineWidth;
varying vec2 uv;
varying vec2 dimensions;

void main(void) {
  geometry.uv = uv;

  vec2 pixelPosition = uv * dimensions;
  if (stroked) {
    float distToEdge = min(
      min(pixelPosition.x, dimensions.x - pixelPosition.x),
      min(pixelPosition.y, dimensions.y - pixelPosition.y)
    );
    float isBorder = smoothedge(distToEdge, vLineWidth);
    gl_FragColor = mix(vFillColor, vLineColor, isBorder);
  } else {
    gl_FragColor = vFillColor;
  }

  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`,ct={billboard:!0,sizeScale:1,sizeUnits:"pixels",sizeMinPixels:0,sizeMaxPixels:Number.MAX_SAFE_INTEGER,padding:{type:"array",value:[0,0,0,0]},getPosition:{type:"accessor",value:r=>r.position},getSize:{type:"accessor",value:1},getAngle:{type:"accessor",value:0},getPixelOffset:{type:"accessor",value:[0,0]},getBoundingRect:{type:"accessor",value:[0,0,0,0]},getFillColor:{type:"accessor",value:[0,0,0,255]},getLineColor:{type:"accessor",value:[0,0,0,255]},getLineWidth:{type:"accessor",value:1}};class X extends W{constructor(...e){super(...e),h(this,"state",void 0)}getShaders(){return super.getShaders({vs:rt,fs:lt,modules:[D,N]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:5130,fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceSizes:{size:1,transition:!0,accessor:"getSize",defaultValue:1},instanceAngles:{size:1,transition:!0,accessor:"getAngle"},instanceRects:{size:4,accessor:"getBoundingRect"},instancePixelOffsets:{size:2,transition:!0,accessor:"getPixelOffset"},instanceFillColors:{size:4,transition:!0,normalized:!0,type:5121,accessor:"getFillColor",defaultValue:[0,0,0,255]},instanceLineColors:{size:4,transition:!0,normalized:!0,type:5121,accessor:"getLineColor",defaultValue:[0,0,0,255]},instanceLineWidths:{size:1,transition:!0,accessor:"getLineWidth",defaultValue:1}})}updateState(e){super.updateState(e);const{changeFlags:t}=e;if(t.extensionsChanged){var n;const{gl:i}=this.context;(n=this.state.model)===null||n===void 0||n.delete(),this.state.model=this._getModel(i),this.getAttributeManager().invalidateAll()}}draw({uniforms:e}){const{billboard:t,sizeScale:n,sizeUnits:i,sizeMinPixels:o,sizeMaxPixels:a,getLineWidth:s}=this.props;let{padding:l}=this.props;l.length<4&&(l=[l[0],l[1],l[0],l[1]]),this.state.model.setUniforms(e).setUniforms({billboard:t,stroked:!!s,padding:l,sizeUnits:R[i],sizeScale:n,sizeMinPixels:o,sizeMaxPixels:a}).draw()}_getModel(e){const t=[0,0,1,0,1,1,0,1];return new H(e,{...this.getShaders(),id:this.props.id,geometry:new G({drawMode:6,vertexCount:4,attributes:{positions:{size:2,value:new Float32Array(t)}}}),isInstanced:!0})}}h(X,"defaultProps",ct);h(X,"layerName","TextBackgroundLayer");const ae={start:1,middle:0,end:-1},re={top:1,center:0,bottom:-1},U=[0,0,0,255],gt=1,ut={billboard:!0,sizeScale:1,sizeUnits:"pixels",sizeMinPixels:0,sizeMaxPixels:Number.MAX_SAFE_INTEGER,background:!1,getBackgroundColor:{type:"accessor",value:[255,255,255,255]},getBorderColor:{type:"accessor",value:U},getBorderWidth:{type:"accessor",value:0},backgroundPadding:{type:"array",value:[0,0,0,0]},characterSet:{type:"object",value:w.characterSet},fontFamily:w.fontFamily,fontWeight:w.fontWeight,lineHeight:gt,outlineWidth:{type:"number",value:0,min:0},outlineColor:{type:"color",value:U},fontSettings:{},wordBreak:"break-word",maxWidth:{type:"number",value:-1},getText:{type:"accessor",value:r=>r.text},getPosition:{type:"accessor",value:r=>r.position},getColor:{type:"accessor",value:U},getSize:{type:"accessor",value:32},getAngle:{type:"accessor",value:0},getTextAnchor:{type:"accessor",value:"middle"},getAlignmentBaseline:{type:"accessor",value:"center"},getPixelOffset:{type:"accessor",value:[0,0]},backgroundColor:{deprecatedFor:["background","getBackgroundColor"]}};class me extends ge{constructor(...e){super(...e),h(this,"state",void 0),h(this,"getBoundingRect",(t,n)=>{const i=this.state.fontAtlasManager.mapping,o=this.state.getText,{wordBreak:a,maxWidth:s,lineHeight:l,getTextAnchor:c,getAlignmentBaseline:g}=this.props,u=o(t,n)||"",{size:[d,f]}=ne(u,l,a,s,i),p=ae[typeof c=="function"?c(t,n):c],x=re[typeof g=="function"?g(t,n):g];return[(p-1)*d/2,(x-1)*f/2,d,f]}),h(this,"getIconOffsets",(t,n)=>{const i=this.state.fontAtlasManager.mapping,o=this.state.getText,{wordBreak:a,maxWidth:s,lineHeight:l,getTextAnchor:c,getAlignmentBaseline:g}=this.props,u=o(t,n)||"",{x:d,y:f,rowWidth:p,size:[x,y]}=ne(u,l,a,s,i),v=ae[typeof c=="function"?c(t,n):c],S=re[typeof g=="function"?g(t,n):g],_=d.length,P=new Array(_*2);let C=0;for(let b=0;b<_;b++){const E=(1-v)*(x-p[b])/2;P[C++]=(v-1)*x/2+E+d[b],P[C++]=(S-1)*y/2+f[b]}return P})}initializeState(){this.state={styleVersion:0,fontAtlasManager:new at}}updateState(e){const{props:t,oldProps:n,changeFlags:i}=e;(i.dataChanged||i.updateTriggersChanged&&(i.updateTriggersChanged.all||i.updateTriggersChanged.getText))&&this._updateText(),(this._updateFontAtlas()||t.lineHeight!==n.lineHeight||t.wordBreak!==n.wordBreak||t.maxWidth!==n.maxWidth)&&this.setState({styleVersion:this.state.styleVersion+1})}getPickingInfo({info:e}){return e.object=e.index>=0?this.props.data[e.index]:null,e}_updateFontAtlas(){const{fontSettings:e,fontFamily:t,fontWeight:n}=this.props,{fontAtlasManager:i,characterSet:o}=this.state,a={...e,characterSet:o,fontFamily:t,fontWeight:n};if(!i.mapping)return i.setProps(a),!0;for(const s in a)if(a[s]!==i.props[s])return i.setProps(a),!0;return!1}_updateText(){var e;const{data:t,characterSet:n}=this.props,i=(e=t.attributes)===null||e===void 0?void 0:e.getText;let{getText:o}=this.props,a=t.startIndices,s;const l=n==="auto"&&new Set;if(i&&a){const{texts:c,characterCount:g}=et({...ArrayBuffer.isView(i)?{value:i}:i,length:t.length,startIndices:a,characterSet:l});s=g,o=(u,{index:d})=>c[d]}else{const{iterable:c,objectInfo:g}=ce(t);a=[0],s=0;for(const u of c){g.index++;const d=Array.from(o(u,g)||"");l&&d.forEach(l.add,l),s+=d.length,a.push(s)}}this.setState({getText:o,startIndices:a,numInstances:s,characterSet:l||n})}renderLayers(){const{startIndices:e,numInstances:t,getText:n,fontAtlasManager:{scale:i,texture:o,mapping:a},styleVersion:s}=this.state,{data:l,_dataDiff:c,getPosition:g,getColor:u,getSize:d,getAngle:f,getPixelOffset:p,getBackgroundColor:x,getBorderColor:y,getBorderWidth:v,backgroundPadding:S,background:_,billboard:P,fontSettings:C,outlineWidth:b,outlineColor:E,sizeScale:T,sizeUnits:M,sizeMinPixels:z,sizeMaxPixels:I,transitions:L,updateTriggers:m}=this.props,xe=this.getSubLayerClass("characters",K),_e=this.getSubLayerClass("background",X);return[_&&new _e({getFillColor:x,getLineColor:y,getLineWidth:v,padding:S,getPosition:g,getSize:d,getAngle:f,getPixelOffset:p,billboard:P,sizeScale:T/this.state.fontAtlasManager.props.fontSize,sizeUnits:M,sizeMinPixels:z,sizeMaxPixels:I,transitions:L&&{getPosition:L.getPosition,getAngle:L.getAngle,getSize:L.getSize,getFillColor:L.getBackgroundColor,getLineColor:L.getBorderColor,getLineWidth:L.getBorderWidth,getPixelOffset:L.getPixelOffset}},this.getSubLayerProps({id:"background",updateTriggers:{getPosition:m.getPosition,getAngle:m.getAngle,getSize:m.getSize,getFillColor:m.getBackgroundColor,getLineColor:m.getBorderColor,getLineWidth:m.getBorderWidth,getPixelOffset:m.getPixelOffset,getBoundingRect:{getText:m.getText,getTextAnchor:m.getTextAnchor,getAlignmentBaseline:m.getAlignmentBaseline,styleVersion:s}}}),{data:l.attributes&&l.attributes.background?{length:l.length,attributes:l.attributes.background}:l,_dataDiff:c,autoHighlight:!1,getBoundingRect:this.getBoundingRect}),new xe({sdf:C.sdf,smoothing:Number.isFinite(C.smoothing)?C.smoothing:w.smoothing,outlineWidth:b,outlineColor:E,iconAtlas:o,iconMapping:a,getPosition:g,getColor:u,getSize:d,getAngle:f,getPixelOffset:p,billboard:P,sizeScale:T*i,sizeUnits:M,sizeMinPixels:z*i,sizeMaxPixels:I*i,transitions:L&&{getPosition:L.getPosition,getAngle:L.getAngle,getColor:L.getColor,getSize:L.getSize,getPixelOffset:L.getPixelOffset}},this.getSubLayerProps({id:"characters",updateTriggers:{getIcon:m.getText,getPosition:m.getPosition,getAngle:m.getAngle,getColor:m.getColor,getSize:m.getSize,getPixelOffset:m.getPixelOffset,getIconOffsets:{getText:m.getText,getTextAnchor:m.getTextAnchor,getAlignmentBaseline:m.getAlignmentBaseline,styleVersion:s}}}),{data:l,_dataDiff:c,startIndices:e,numInstances:t,getIconOffsets:this.getIconOffsets,getIcon:n})]}static set fontAtlasCacheLimit(e){ot(e)}}h(me,"defaultProps",ut);h(me,"layerName","TextLayer");export{ge as C,j as I,de as S,me as T};
