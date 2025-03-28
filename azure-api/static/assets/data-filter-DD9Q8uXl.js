import{v as c,T as h,w as I,M as R,x,y as L,_ as T}from"./set-rtl-text-plugin-_unXPnRK.js";import{L as M}from"./layer-extension-IbahPOj_.js";const A=`
uniform DATAFILTER_TYPE filter_min;
uniform DATAFILTER_TYPE filter_softMin;
uniform DATAFILTER_TYPE filter_softMax;
uniform DATAFILTER_TYPE filter_max;
uniform bool filter_useSoftMargin;
uniform bool filter_enabled;
uniform bool filter_transformSize;

#ifdef NON_INSTANCED_MODEL
  #define DATAFILTER_ATTRIB filterValues
  #define DATAFILTER_ATTRIB_64LOW filterValues64Low
#else
  #define DATAFILTER_ATTRIB instanceFilterValues
  #define DATAFILTER_ATTRIB_64LOW instanceFilterValues64Low
#endif

attribute DATAFILTER_TYPE DATAFILTER_ATTRIB;
#ifdef DATAFILTER_DOUBLE
  attribute DATAFILTER_TYPE DATAFILTER_ATTRIB_64LOW;

  uniform DATAFILTER_TYPE filter_min64High;
  uniform DATAFILTER_TYPE filter_max64High;
#endif

varying float dataFilter_value;

float dataFilter_reduceValue(float value) {
  return value;
}
float dataFilter_reduceValue(vec2 value) {
  return min(value.x, value.y);
}
float dataFilter_reduceValue(vec3 value) {
  return min(min(value.x, value.y), value.z);
}
float dataFilter_reduceValue(vec4 value) {
  return min(min(value.x, value.y), min(value.z, value.w));
}
void dataFilter_setValue(DATAFILTER_TYPE valueFromMin, DATAFILTER_TYPE valueFromMax) {
  if (filter_enabled) {
    if (filter_useSoftMargin) {
      dataFilter_value = dataFilter_reduceValue(
        smoothstep(filter_min, filter_softMin, valueFromMin) *
        (1.0 - smoothstep(filter_softMax, filter_max, valueFromMax))
      );
    } else {
      dataFilter_value = dataFilter_reduceValue(
        step(filter_min, valueFromMin) * step(valueFromMax, filter_max)
      );
    }
  } else {
    dataFilter_value = 1.0;
  }
}
`,v=`
uniform bool filter_transformColor;
varying float dataFilter_value;
`;function F(i){if(!i||!("extensions"in i))return{};const{filterRange:e=[-1,1],filterEnabled:t=!0,filterTransformSize:n=!0,filterTransformColor:r=!0}=i,a=i.filterSoftRange||e;return{...Number.isFinite(e[0])?{filter_min:e[0],filter_softMin:a[0],filter_softMax:a[1],filter_max:e[1]}:{filter_min:e.map(l=>l[0]),filter_softMin:a.map(l=>l[0]),filter_softMax:a.map(l=>l[1]),filter_max:e.map(l=>l[1])},filter_enabled:t,filter_useSoftMargin:!!i.filterSoftRange,filter_transformSize:t&&n,filter_transformColor:t&&r}}function p(i){if(!i||!("extensions"in i))return{};const e=F(i);if(Number.isFinite(e.filter_min)){const t=Math.fround(e.filter_min);e.filter_min-=t,e.filter_softMin-=t,e.filter_min64High=t;const n=Math.fround(e.filter_max);e.filter_max-=n,e.filter_softMax-=n,e.filter_max64High=n}else{const t=e.filter_min.map(Math.fround);e.filter_min=e.filter_min.map((r,a)=>r-t[a]),e.filter_softMin=e.filter_softMin.map((r,a)=>r-t[a]),e.filter_min64High=t;const n=e.filter_max.map(Math.fround);e.filter_max=e.filter_max.map((r,a)=>r-n[a]),e.filter_softMax=e.filter_softMax.map((r,a)=>r-n[a]),e.filter_max64High=n}return e}const E={"vs:#main-start":`
    #ifdef DATAFILTER_DOUBLE
      dataFilter_setValue(
        DATAFILTER_ATTRIB - filter_min64High + DATAFILTER_ATTRIB_64LOW,
        DATAFILTER_ATTRIB - filter_max64High + DATAFILTER_ATTRIB_64LOW
      );
    #else
      dataFilter_setValue(DATAFILTER_ATTRIB, DATAFILTER_ATTRIB);
    #endif
  `,"vs:#main-end":`
    if (dataFilter_value == 0.0) {
      gl_Position = vec4(0.);
    }
  `,"vs:DECKGL_FILTER_SIZE":`
    if (filter_transformSize) {
      size = size * dataFilter_value;
    }
  `,"fs:DECKGL_FILTER_COLOR":`
    if (dataFilter_value == 0.0) discard;
    if (filter_transformColor) {
      color.a *= dataFilter_value;
    }
  `},b={name:"data-filter",vs:A,fs:v,inject:E,getUniforms:F},D={name:"data-filter-fp64",vs:A,fs:v,inject:E,getUniforms:p},S=`#define SHADER_NAME data-filter-vertex-shader

#ifdef FLOAT_TARGET
  attribute float filterIndices;
  attribute float filterPrevIndices;
#else
  attribute vec2 filterIndices;
  attribute vec2 filterPrevIndices;
#endif

varying vec4 vColor;
const float component = 1.0 / 255.0;

void main() {
  #ifdef FLOAT_TARGET
    dataFilter_value *= float(filterIndices != filterPrevIndices);
    gl_Position = vec4(0.0, 0.0, 0.0, 1.0);
    vColor = vec4(0.0, 0.0, 0.0, 1.0);
  #else
    // Float texture is not supported: pack result into 4 channels x 256 px x 64px
    dataFilter_value *= float(filterIndices.x != filterPrevIndices.x);
    float col = filterIndices.x;
    float row = filterIndices.y * 4.0;
    float channel = floor(row);
    row = fract(row);
    vColor = component * vec4(bvec4(channel == 0.0, channel == 1.0, channel == 2.0, channel == 3.0));
    gl_Position = vec4(col * 2.0 - 1.0, row * 2.0 - 1.0, 0.0, 1.0);
  #endif
  gl_PointSize = 1.0;
}
`,P=`#define SHADER_NAME data-filter-fragment-shader
precision highp float;

varying vec4 vColor;

void main() {
  if (dataFilter_value < 0.5) {
    discard;
  }
  gl_FragColor = vColor;
}
`;function w(i){return!!(i.getExtension("EXT_float_blend")&&(i.getExtension("EXT_color_buffer_float")||i.getExtension("WEBGL_color_buffer_float")))}function B(i,e){return e?new c(i,{width:1,height:1,attachments:{36064:new h(i,{format:I(i)?34836:6408,type:5126,mipmaps:!1})}}):new c(i,{width:256,height:64,depth:!1})}function O(i,e,t){return e.defines.NON_INSTANCED_MODEL=1,t&&(e.defines.FLOAT_TARGET=1),new R(i,{id:"data-filter-aggregation-model",vertexCount:1,isInstanced:!1,drawMode:0,vs:S,fs:P,...e})}const V={blend:!0,blendFunc:[1,1,1,1],blendEquation:[32774,32774],depthTest:!1},C={getFilterValue:{type:"accessor",value:0},onFilteredItemsChange:{type:"function",value:null,compare:!1},filterEnabled:!0,filterRange:[-1,1],filterSoftRange:null,filterTransformSize:!0,filterTransformColor:!0},m={1:"float",2:"vec2",3:"vec3",4:"vec4"};class g extends M{constructor({filterSize:e=1,fp64:t=!1,countItems:n=!1}={}){if(!m[e])throw new Error("filterSize out of range");super({filterSize:e,fp64:t,countItems:n})}getShaders(e){const{filterSize:t,fp64:n}=e.opts;return{modules:[n?D:b],defines:{DATAFILTER_TYPE:m[t],DATAFILTER_DOUBLE:!!n}}}initializeState(e,t){const n=this.getAttributeManager();n&&n.add({filterValues:{size:t.opts.filterSize,type:t.opts.fp64?5130:5126,accessor:"getFilterValue",shaderAttributes:{filterValues:{divisor:0},instanceFilterValues:{divisor:1}}}});const{gl:r}=this.context;if(n&&t.opts.countItems){const a=w(r);n.add({filterIndices:{size:a?1:2,vertexOffset:1,type:5121,normalized:!0,accessor:(f,{index:u})=>{const o=f&&f.__source?f.__source.index:u;return a?(o+1)%255:[(o+1)%255,Math.floor(o/255)%255]},shaderAttributes:{filterPrevIndices:{vertexOffset:0},filterIndices:{vertexOffset:1}}}});const l=B(r,a),s=O(r,t.getShaders.call(this,t),a);this.setState({filterFBO:l,filterModel:s})}}updateState({props:e,oldProps:t}){if(this.state.filterModel){const r=this.getAttributeManager().attributes.filterValues.needsUpdate()||e.filterEnabled!==t.filterEnabled||e.filterRange!==t.filterRange||e.filterSoftRange!==t.filterSoftRange;r&&this.setState({filterNeedsUpdate:r})}}draw(e,t){const{filterFBO:n,filterModel:r,filterNeedsUpdate:a}=this.state,{onFilteredItemsChange:l}=this.props;if(a&&l&&r){const{attributes:{filterValues:s,filterIndices:f}}=this.getAttributeManager();r.setVertexCount(this.getNumInstances());const{gl:u}=this.context;x(u,{framebuffer:n,color:[0,0,0,0]}),r.updateModuleSettings(e.moduleParameters).setAttributes({...s.getShaderAttributes(),...f&&f.getShaderAttributes()}).draw({framebuffer:n,parameters:{...V,viewport:[0,0,n.width,n.height]}});const o=L(n);let _=0;for(let d=0;d<o.length;d++)_+=o[d];l({id:this.id,count:_}),this.state.filterNeedsUpdate=!1}}finalizeState(){const{filterFBO:e,filterModel:t}=this.state;e&&(e.color.delete(),e.delete(),t.delete())}}T(g,"defaultProps",C);T(g,"extensionName","DataFilterExtension");export{g as D};
