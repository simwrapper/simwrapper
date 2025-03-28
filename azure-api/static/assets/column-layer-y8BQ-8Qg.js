import{G as L,u as M,l as w,a as I,w as E,H as b,p as k,b as A,M as F,U as C,_,F as z}from"./set-rtl-text-plugin-_unXPnRK.js";import{m as D,W as R,p as G,g as O}from"./solid-polygon-layer-Bsu3jPdk.js";class U extends L{constructor(t){const{id:o=M("column-geometry")}=t,{indices:n,attributes:e}=T(t);super({...t,id:o,indices:n,attributes:e})}}function T(v){const{radius:t,height:o=1,nradial:n=10}=v;let{vertices:e}=v;e&&(w.assert(e.length>=n),e=e.flatMap(i=>[i[0],i[1]]),D(e,R.COUNTER_CLOCKWISE));const r=o>0,c=n+1,f=r?c*3+1:n,g=Math.PI*2/n,u=new Uint16Array(r?n*3*2:0),a=new Float32Array(f*3),x=new Float32Array(f*3);let s=0;if(r){for(let i=0;i<c;i++){const l=i*g,m=i%n,d=Math.sin(l),p=Math.cos(l);for(let h=0;h<2;h++)a[s+0]=e?e[m*2]:p*t,a[s+1]=e?e[m*2+1]:d*t,a[s+2]=(1/2-h)*o,x[s+0]=e?e[m*2]:p,x[s+1]=e?e[m*2+1]:d,s+=3}a[s+0]=a[s-3],a[s+1]=a[s-2],a[s+2]=a[s-1],s+=3}for(let i=r?0:1;i<c;i++){const l=Math.floor(i/2)*Math.sign(.5-i%2),m=l*g,d=(l+n)%n,p=Math.sin(m),h=Math.cos(m);a[s+0]=e?e[d*2]:h*t,a[s+1]=e?e[d*2+1]:p*t,a[s+2]=o/2,x[s+2]=1,s+=3}if(r){let i=0;for(let l=0;l<n;l++)u[i++]=l*2+0,u[i++]=l*2+2,u[i++]=l*2+0,u[i++]=l*2+1,u[i++]=l*2+1,u[i++]=l*2+3}return{indices:u,attributes:{POSITION:{size:3,value:a},NORMAL:{size:3,value:x}}}}const N=`#version 300 es

#define SHADER_NAME column-layer-vertex-shader

in vec3 positions;
in vec3 normals;

in vec3 instancePositions;
in float instanceElevations;
in vec3 instancePositions64Low;
in vec4 instanceFillColors;
in vec4 instanceLineColors;
in float instanceStrokeWidths;

in vec3 instancePickingColors;

// Custom uniforms
uniform float opacity;
uniform float radius;
uniform float angle;
uniform vec2 offset;
uniform bool extruded;
uniform bool stroked;
uniform bool isStroke;
uniform float coverage;
uniform float elevationScale;
uniform float edgeDistance;
uniform float widthScale;
uniform float widthMinPixels;
uniform float widthMaxPixels;
uniform int radiusUnits;
uniform int widthUnits;

// Result
out vec4 vColor;
#ifdef FLAT_SHADING
out vec4 position_commonspace;
#endif

void main(void) {
  geometry.worldPosition = instancePositions;

  vec4 color = isStroke ? instanceLineColors : instanceFillColors;
  // rotate primitive position and normal
  mat2 rotationMatrix = mat2(cos(angle), sin(angle), -sin(angle), cos(angle));

  // calculate elevation, if 3d not enabled set to 0
  // cylindar gemoetry height are between -1.0 to 1.0, transform it to between 0, 1
  float elevation = 0.0;
  // calculate stroke offset
  float strokeOffsetRatio = 1.0;

  if (extruded) {
    elevation = instanceElevations * (positions.z + 1.0) / 2.0 * elevationScale;
  } else if (stroked) {
    float widthPixels = clamp(
      project_size_to_pixel(instanceStrokeWidths * widthScale, widthUnits),
      widthMinPixels, widthMaxPixels) / 2.0;
    float halfOffset = project_pixel_size(widthPixels) / project_size(edgeDistance * coverage * radius);
    if (isStroke) {
      strokeOffsetRatio -= sign(positions.z) * halfOffset;
    } else {
      strokeOffsetRatio -= halfOffset;
    }
  }

  // if alpha == 0.0 or z < 0.0, do not render element
  float shouldRender = float(color.a > 0.0 && instanceElevations >= 0.0);
  float dotRadius = radius * coverage * shouldRender;

  geometry.pickingColor = instancePickingColors;

  // project center of column
  vec3 centroidPosition = vec3(instancePositions.xy, instancePositions.z + elevation);
  vec3 centroidPosition64Low = instancePositions64Low;
  vec2 offset = (rotationMatrix * positions.xy * strokeOffsetRatio + offset) * dotRadius;
  if (radiusUnits == UNIT_METERS) {
    offset = project_size(offset);
  }
  vec3 pos = vec3(offset, 0.);
  DECKGL_FILTER_SIZE(pos, geometry);

  gl_Position = project_position_to_clipspace(centroidPosition, centroidPosition64Low, pos, geometry.position);
  geometry.normal = project_normal(vec3(rotationMatrix * normals.xy, normals.z));
  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  // Light calculations
  if (extruded && !isStroke) {
#ifdef FLAT_SHADING
    position_commonspace = geometry.position;
    vColor = vec4(color.rgb, color.a * opacity);
#else
    vec3 lightColor = lighting_getLightColor(color.rgb, project_uCameraPosition, geometry.position.xyz, geometry.normal);
    vColor = vec4(lightColor, color.a * opacity);
#endif
  } else {
    vColor = vec4(color.rgb, color.a * opacity);
  }
  DECKGL_FILTER_COLOR(vColor, geometry);
}
`,W=`#version 300 es
#define SHADER_NAME column-layer-fragment-shader

precision highp float;

uniform vec3 project_uCameraPosition;
uniform bool extruded;
uniform bool isStroke;

out vec4 fragColor;

in vec4 vColor;
#ifdef FLAT_SHADING
in vec4 position_commonspace;
#endif

void main(void) {
  fragColor = vColor;
#ifdef FLAT_SHADING
  if (extruded && !isStroke && !picking_uActive) {
    vec3 normal = normalize(cross(dFdx(position_commonspace.xyz), dFdy(position_commonspace.xyz)));
    fragColor.rgb = lighting_getLightColor(vColor.rgb, project_uCameraPosition, position_commonspace.xyz, normal);
  }
#endif
  DECKGL_FILTER_COLOR(fragColor, geometry);
}
`,y=[0,0,0,255],j={diskResolution:{type:"number",min:4,value:20},vertices:null,radius:{type:"number",min:0,value:1e3},angle:{type:"number",value:0},offset:{type:"array",value:[0,0]},coverage:{type:"number",min:0,max:1,value:1},elevationScale:{type:"number",min:0,value:1},radiusUnits:"meters",lineWidthUnits:"meters",lineWidthScale:1,lineWidthMinPixels:0,lineWidthMaxPixels:Number.MAX_SAFE_INTEGER,extruded:!0,wireframe:!1,filled:!0,stroked:!1,getPosition:{type:"accessor",value:v=>v.position},getFillColor:{type:"accessor",value:y},getLineColor:{type:"accessor",value:y},getLineWidth:{type:"accessor",value:1},getElevation:{type:"accessor",value:1e3},material:!0,getColor:{deprecatedFor:["getFillColor","getLineColor"]}};class S extends I{getShaders(){const{gl:t}=this.context,o=!E(t),n={},e=this.props.flatShading&&b(t,z.GLSL_DERIVATIVES);return e&&(n.FLAT_SHADING=1),super.getShaders({vs:N,fs:W,defines:n,transpileToGLSL100:o,modules:[k,e?G:O,A]})}initializeState(){this.getAttributeManager().addInstanced({instancePositions:{size:3,type:5130,fp64:this.use64bitPositions(),transition:!0,accessor:"getPosition"},instanceElevations:{size:1,transition:!0,accessor:"getElevation"},instanceFillColors:{size:this.props.colorFormat.length,type:5121,normalized:!0,transition:!0,accessor:"getFillColor",defaultValue:y},instanceLineColors:{size:this.props.colorFormat.length,type:5121,normalized:!0,transition:!0,accessor:"getLineColor",defaultValue:y},instanceStrokeWidths:{size:1,accessor:"getLineWidth",transition:!0}})}updateState(t){super.updateState(t);const{props:o,oldProps:n,changeFlags:e}=t,r=e.extensionsChanged||o.flatShading!==n.flatShading;if(r){var c;const{gl:f}=this.context;(c=this.state.model)===null||c===void 0||c.delete(),this.state.model=this._getModel(f),this.getAttributeManager().invalidateAll()}(r||o.diskResolution!==n.diskResolution||o.vertices!==n.vertices||(o.extruded||o.stroked)!==(n.extruded||n.stroked))&&this._updateGeometry(o)}getGeometry(t,o,n){const e=new U({radius:1,height:n?2:0,vertices:o,nradial:t});let r=0;if(o)for(let c=0;c<t;c++){const f=o[c],g=Math.sqrt(f[0]*f[0]+f[1]*f[1]);r+=g/t}else r=1;return this.setState({edgeDistance:Math.cos(Math.PI/t)*r}),e}_getModel(t){return new F(t,{...this.getShaders(),id:this.props.id,isInstanced:!0})}_updateGeometry({diskResolution:t,vertices:o,extruded:n,stroked:e}){const r=this.getGeometry(t,o,n||e);this.setState({fillVertexCount:r.attributes.POSITION.value.length/3,wireframeVertexCount:r.indices.value.length}),this.state.model.setProps({geometry:r})}draw({uniforms:t}){const{lineWidthUnits:o,lineWidthScale:n,lineWidthMinPixels:e,lineWidthMaxPixels:r,radiusUnits:c,elevationScale:f,extruded:g,filled:u,stroked:a,wireframe:x,offset:s,coverage:i,radius:l,angle:m}=this.props,{model:d,fillVertexCount:p,wireframeVertexCount:h,edgeDistance:P}=this.state;d.setUniforms(t).setUniforms({radius:l,angle:m/180*Math.PI,offset:s,extruded:g,stroked:a,coverage:i,elevationScale:f,edgeDistance:P,radiusUnits:C[c],widthUnits:C[o],widthScale:n,widthMinPixels:e,widthMaxPixels:r}),g&&x&&(d.setProps({isIndexed:!0}),d.setVertexCount(h).setDrawMode(1).setUniforms({isStroke:!0}).draw()),u&&(d.setProps({isIndexed:!1}),d.setVertexCount(p).setDrawMode(5).setUniforms({isStroke:!1}).draw()),!g&&a&&(d.setProps({isIndexed:!1}),d.setVertexCount(p*2/3).setDrawMode(5).setUniforms({isStroke:!0}).draw())}}_(S,"layerName","ColumnLayer");_(S,"defaultProps",j);export{S as C};
