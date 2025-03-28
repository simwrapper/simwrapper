import{z as l,E as g,_ as d}from"./set-rtl-text-plugin-_unXPnRK.js";import{L as u}from"./layer-extension-IbahPOj_.js";import{j as a}from"./index-DuMxCAme.js";const p={inject:{"vs:#decl":`
attribute vec2 instanceDashArrays;
attribute float instanceDashOffsets;
varying vec2 vDashArray;
varying float vDashOffset;
`,"vs:#main-end":`
vDashArray = instanceDashArrays;
vDashOffset = instanceDashOffsets / width.x;
`,"fs:#decl":`
uniform float dashAlignMode;
uniform float capType;
uniform bool dashGapPickable;
varying vec2 vDashArray;
varying float vDashOffset;

float round(float x) {
  return floor(x + 0.5);
}
`,"fs:#main-start":`
  float solidLength = vDashArray.x;
  float gapLength = vDashArray.y;
  float unitLength = solidLength + gapLength;

  float offset;

  if (unitLength > 0.0) {
    if (dashAlignMode == 0.0) {
      offset = vDashOffset;
    } else {
      unitLength = vPathLength / round(vPathLength / unitLength);
      offset = solidLength / 2.0;
    }

    float unitOffset = mod(clamp(vPathPosition.y, 0.0, vPathLength) + offset, unitLength);

    if (gapLength > 0.0 && unitOffset > solidLength) {
      if (capType <= 0.5) {
        if (!(dashGapPickable && picking_uActive)) {
          discard;
        }
      } else {
        // caps are rounded, test the distance to solid ends
        float distToEnd = length(vec2(
          min(unitOffset - solidLength, unitLength - unitOffset),
          vPathPosition.x
        ));
        if (distToEnd > 1.0) {
          if (!(dashGapPickable && picking_uActive)) {
            discard;
          }
        }
      }
    }
  }
`}},v={inject:{"vs:#decl":`
attribute float instanceOffsets;
`,"vs:DECKGL_FILTER_SIZE":`
  float offsetWidth = abs(instanceOffsets * 2.0) + 1.0;
  size *= offsetWidth;
`,"vCornerOffset = offsetVec;":`
  float offsetWidth = abs(instanceOffsets * 2.0) + 1.0;
  vec2 offsetCenter = -instanceOffsets * (isCap ? perp : miterVec * miterSize) * 2.0;
  vCornerOffset = vCornerOffset * offsetWidth - offsetCenter;
`,"fs:#main-start":`
  float isInside;
  isInside = step(-1.0, vPathPosition.x) * step(vPathPosition.x, 1.0);
  if (isInside == 0.0) {
    discard;
  }
`}},m={getDashArray:{type:"accessor",value:[0,0]},getOffset:{type:"accessor",value:0},dashJustified:!1,dashGapPickable:!1};class h extends u{constructor({dash:e=!1,offset:t=!1,highPrecisionDash:s=!1}={}){super({dash:e||s,offset:t,highPrecisionDash:s})}isEnabled(e){return"pathTesselator"in e.state}getShaders(e){if(!e.isEnabled(this))return null;let t={};return e.opts.dash&&(t=l(t,p)),e.opts.offset&&(t=l(t,v)),t}initializeState(e,t){const s=this.getAttributeManager();!s||!t.isEnabled(this)||(t.opts.dash&&s.addInstanced({instanceDashArrays:{size:2,accessor:"getDashArray"}}),t.opts.highPrecisionDash&&s.addInstanced({instanceDashOffsets:{size:1,accessor:"getPath",transform:t.getDashOffsets.bind(this)}}),t.opts.offset&&s.addInstanced({instanceOffsets:{size:1,accessor:"getOffset"}}))}updateState(e,t){if(!t.isEnabled(this))return;const s={};t.opts.dash&&(s.dashAlignMode=this.props.dashJustified?1:0,s.dashGapPickable=!!this.props.dashGapPickable),this.state.model.setUniforms(s)}getDashOffsets(e){const t=[0],s=this.props.positionFormat==="XY"?2:3,r=Array.isArray(e[0]),c=r?e.length:e.length/s;let i,o;for(let n=0;n<c-1;n++)i=r?e[n]:e.slice(n*s,n*s+s),i=this.projectPosition(i),n>0&&(t[n]=t[n-1]+g(o,i)),o=i;return t}}d(h,"defaultProps",m);d(h,"extensionName","PathStyleExtension");function O(f){const e=f.items.map(t=>a.createElement("li",{key:t.value+t.value[0]},a.createElement("div",{style:{width:"100%",height:`${Math.max(1,3*(1*t.value-1)+3)}px`,backgroundColor:`rgb(${t.color})`}}),t.label&&a.createElement("div",{style:{marginBottom:"0.5rem"}},t.label)));return a.createElement("div",null,a.createElement("h4",{style:{textAlign:"left",fontWeight:"bold",marginBottom:"0.5rem",fontSize:"0.8rem"}},f.title),a.createElement("p",null,f.description),a.createElement("ul",{style:{listStyle:"none",padding:0,margin:0}},e))}export{O as C,h as P};
