import{a as ae,_ as Z,p as ce,b as ue,C as F,m as ge,M as W,G as fe,F as he}from"./set-rtl-text-plugin-_unXPnRK.js";import{b as pe}from"./index-DuMxCAme.js";import{T as de,b as ve,d as xe}from"./cut-by-mercator-bounds-Dxqq0zOT.js";const j=`#if (defined(SHADER_TYPE_FRAGMENT) && defined(LIGHTING_FRAGMENT)) || (defined(SHADER_TYPE_VERTEX) && defined(LIGHTING_VERTEX))

struct AmbientLight {
 vec3 color;
};

struct PointLight {
 vec3 color;
 vec3 position;
 vec3 attenuation;
};

struct DirectionalLight {
  vec3 color;
  vec3 direction;
};

uniform AmbientLight lighting_uAmbientLight;
uniform PointLight lighting_uPointLight[MAX_LIGHTS];
uniform DirectionalLight lighting_uDirectionalLight[MAX_LIGHTS];
uniform int lighting_uPointLightCount;
uniform int lighting_uDirectionalLightCount;

uniform bool lighting_uEnabled;

float getPointLightAttenuation(PointLight pointLight, float distance) {
  return pointLight.attenuation.x
       + pointLight.attenuation.y * distance
       + pointLight.attenuation.z * distance * distance;
}

#endif
`,_e={lightSources:{}};function z(){let{color:t=[0,0,0],intensity:n=1}=arguments.length>0&&arguments[0]!==void 0?arguments[0]:{};return t.map(e=>e*n/255)}function me(t){let{ambientLight:n,pointLights:e=[],directionalLights:o=[]}=t;const i={};return n?i["lighting_uAmbientLight.color"]=z(n):i["lighting_uAmbientLight.color"]=[0,0,0],e.forEach((r,s)=>{i["lighting_uPointLight[".concat(s,"].color")]=z(r),i["lighting_uPointLight[".concat(s,"].position")]=r.position,i["lighting_uPointLight[".concat(s,"].attenuation")]=r.attenuation||[1,0,0]}),i.lighting_uPointLightCount=e.length,o.forEach((r,s)=>{i["lighting_uDirectionalLight[".concat(s,"].color")]=z(r),i["lighting_uDirectionalLight[".concat(s,"].direction")]=r.direction}),i.lighting_uDirectionalLightCount=o.length,i}function J(){let t=arguments.length>0&&arguments[0]!==void 0?arguments[0]:_e;if("lightSources"in t){const{ambientLight:n,pointLights:e,directionalLights:o}=t.lightSources||{};return n||e&&e.length>0||o&&o.length>0?Object.assign({},me({ambientLight:n,pointLights:e,directionalLights:o}),{lighting_uEnabled:!0}):{lighting_uEnabled:!1}}if("lights"in t){const n={pointLights:[],directionalLights:[]};for(const e of t.lights||[])switch(e.type){case"ambient":n.ambientLight=e;break;case"directional":n.directionalLights.push(e);break;case"point":n.pointLights.push(e);break}return J({lightSources:n})}return{}}const Q={name:"lights",vs:j,fs:j,getUniforms:J,defines:{MAX_LIGHTS:3}},q=`
uniform float lighting_uAmbient;
uniform float lighting_uDiffuse;
uniform float lighting_uShininess;
uniform vec3  lighting_uSpecularColor;

vec3 lighting_getLightColor(vec3 surfaceColor, vec3 light_direction, vec3 view_direction, vec3 normal_worldspace, vec3 color) {
    vec3 halfway_direction = normalize(light_direction + view_direction);
    float lambertian = dot(light_direction, normal_worldspace);
    float specular = 0.0;
    if (lambertian > 0.0) {
      float specular_angle = max(dot(normal_worldspace, halfway_direction), 0.0);
      specular = pow(specular_angle, lighting_uShininess);
    }
    lambertian = max(lambertian, 0.0);
    return (lambertian * lighting_uDiffuse * surfaceColor + specular * lighting_uSpecularColor) * color;
}

vec3 lighting_getLightColor(vec3 surfaceColor, vec3 cameraPosition, vec3 position_worldspace, vec3 normal_worldspace) {
  vec3 lightColor = surfaceColor;

  if (lighting_uEnabled) {
    vec3 view_direction = normalize(cameraPosition - position_worldspace);
    lightColor = lighting_uAmbient * surfaceColor * lighting_uAmbientLight.color;

    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= lighting_uPointLightCount) {
        break;
      }
      PointLight pointLight = lighting_uPointLight[i];
      vec3 light_position_worldspace = pointLight.position;
      vec3 light_direction = normalize(light_position_worldspace - position_worldspace);
      lightColor += lighting_getLightColor(surfaceColor, light_direction, view_direction, normal_worldspace, pointLight.color);
    }

    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= lighting_uDirectionalLightCount) {
        break;
      }
      DirectionalLight directionalLight = lighting_uDirectionalLight[i];
      lightColor += lighting_getLightColor(surfaceColor, -directionalLight.direction, view_direction, normal_worldspace, directionalLight.color);
    }
  }
  return lightColor;
}

vec3 lighting_getSpecularLightColor(vec3 cameraPosition, vec3 position_worldspace, vec3 normal_worldspace) {
  vec3 lightColor = vec3(0, 0, 0);
  vec3 surfaceColor = vec3(0, 0, 0);

  if (lighting_uEnabled) {
    vec3 view_direction = normalize(cameraPosition - position_worldspace);

    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= lighting_uPointLightCount) {
        break;
      }
      PointLight pointLight = lighting_uPointLight[i];
      vec3 light_position_worldspace = pointLight.position;
      vec3 light_direction = normalize(light_position_worldspace - position_worldspace);
      lightColor += lighting_getLightColor(surfaceColor, light_direction, view_direction, normal_worldspace, pointLight.color);
    }

    for (int i = 0; i < MAX_LIGHTS; i++) {
      if (i >= lighting_uDirectionalLightCount) {
        break;
      }
      DirectionalLight directionalLight = lighting_uDirectionalLight[i];
      lightColor += lighting_getLightColor(surfaceColor, -directionalLight.direction, view_direction, normal_worldspace, directionalLight.color);
    }
  }
  return lightColor;
}
`,Le={};function ye(t){const{ambient:n=.35,diffuse:e=.6,shininess:o=32,specularColor:i=[30,30,30]}=t;return{lighting_uAmbient:n,lighting_uDiffuse:e,lighting_uShininess:o,lighting_uSpecularColor:i.map(r=>r/255)}}function ee(){let t=arguments.length>0&&arguments[0]!==void 0?arguments[0]:Le;if(!("material"in t))return{};const{material:n}=t;return n?ye(n):{lighting_uEnabled:!1}}const Ce={name:"gouraud-lighting",dependencies:[Q],vs:q,defines:{LIGHTING_VERTEX:1},getUniforms:ee},ot={name:"phong-lighting",dependencies:[Q],fs:q,defines:{LIGHTING_FRAGMENT:1},getUniforms:ee},te={CLOCKWISE:1,COUNTER_CLOCKWISE:-1};function ne(t,n,e={}){return Pe(t,e)!==n?(Ee(t,e),!0):!1}function Pe(t,n={}){return Math.sign(we(t,n))}function we(t,n={}){const{start:e=0,end:o=t.length}=n,i=n.size||2;let r=0;for(let s=e,l=o-i;s<o;s+=i)r+=(t[s]-t[l])*(t[s+1]+t[l+1]),l=s;return r/2}function Ee(t,n){const{start:e=0,end:o=t.length,size:i=2}=n,r=(o-e)/i,s=Math.floor(r/2);for(let l=0;l<s;++l){const a=e+l*i,c=e+(r-1-l)*i;for(let u=0;u<i;++u){const g=t[a+u];t[a+u]=t[c+u],t[c+u]=g}}}var V={exports:{}};V.exports=G;V.exports.default=G;function G(t,n,e){e=e||2;var o=n&&n.length,i=o?n[0]*e:t.length,r=ie(t,0,i,e,!0),s=[];if(!r||r.next===r.prev)return s;var l,a,c,u,g,f,x;if(o&&(r=Te(t,n,r,e)),t.length>80*e){l=c=t[0],a=u=t[1];for(var d=e;d<i;d+=e)g=t[d],f=t[d+1],g<l&&(l=g),f<a&&(a=f),g>c&&(c=g),f>u&&(u=f);x=Math.max(c-l,u-a),x=x!==0?32767/x:0}return w(r,s,e,l,a,x,0),s}function ie(t,n,e,o,i){var r,s;if(i===k(t,n,e,o)>0)for(r=n;r<e;r+=o)s=X(r,t[r],t[r+1],s);else for(r=e-o;r>=n;r-=o)s=X(r,t[r],t[r+1],s);return s&&N(s,s.next)&&(I(s),s=s.next),s}function m(t,n){if(!t)return t;n||(n=t);var e=t,o;do if(o=!1,!e.steiner&&(N(e,e.next)||v(e.prev,e,e.next)===0)){if(I(e),e=n=e.prev,e===e.next)break;o=!0}else e=e.next;while(o||e!==n);return n}function w(t,n,e,o,i,r,s){if(t){!s&&r&&Fe(t,o,i,r);for(var l=t,a,c;t.prev!==t.next;){if(a=t.prev,c=t.next,r?Ae(t,o,i,r):Ie(t)){n.push(a.i/e|0),n.push(t.i/e|0),n.push(c.i/e|0),I(t),t=c.next,l=c.next;continue}if(t=c,t===l){s?s===1?(t=Se(m(t),n,e),w(t,n,e,o,i,r,2)):s===2&&be(t,n,e,o,i,r):w(m(t),n,e,o,i,r,1);break}}}}function Ie(t){var n=t.prev,e=t,o=t.next;if(v(n,e,o)>=0)return!1;for(var i=n.x,r=e.x,s=o.x,l=n.y,a=e.y,c=o.y,u=i<r?i<s?i:s:r<s?r:s,g=l<a?l<c?l:c:a<c?a:c,f=i>r?i>s?i:s:r>s?r:s,x=l>a?l>c?l:c:a>c?a:c,d=o.next;d!==n;){if(d.x>=u&&d.x<=f&&d.y>=g&&d.y<=x&&L(i,l,r,a,s,c,d.x,d.y)&&v(d.prev,d,d.next)>=0)return!1;d=d.next}return!0}function Ae(t,n,e,o){var i=t.prev,r=t,s=t.next;if(v(i,r,s)>=0)return!1;for(var l=i.x,a=r.x,c=s.x,u=i.y,g=r.y,f=s.y,x=l<a?l<c?l:c:a<c?a:c,d=u<g?u<f?u:f:g<f?g:f,y=l>a?l>c?l:c:a>c?a:c,C=u>g?u>f?u:f:g>f?g:f,U=O(x,d,n,e,o),H=O(y,C,n,e,o),h=t.prevZ,p=t.nextZ;h&&h.z>=U&&p&&p.z<=H;){if(h.x>=x&&h.x<=y&&h.y>=d&&h.y<=C&&h!==i&&h!==s&&L(l,u,a,g,c,f,h.x,h.y)&&v(h.prev,h,h.next)>=0||(h=h.prevZ,p.x>=x&&p.x<=y&&p.y>=d&&p.y<=C&&p!==i&&p!==s&&L(l,u,a,g,c,f,p.x,p.y)&&v(p.prev,p,p.next)>=0))return!1;p=p.nextZ}for(;h&&h.z>=U;){if(h.x>=x&&h.x<=y&&h.y>=d&&h.y<=C&&h!==i&&h!==s&&L(l,u,a,g,c,f,h.x,h.y)&&v(h.prev,h,h.next)>=0)return!1;h=h.prevZ}for(;p&&p.z<=H;){if(p.x>=x&&p.x<=y&&p.y>=d&&p.y<=C&&p!==i&&p!==s&&L(l,u,a,g,c,f,p.x,p.y)&&v(p.prev,p,p.next)>=0)return!1;p=p.nextZ}return!0}function Se(t,n,e){var o=t;do{var i=o.prev,r=o.next.next;!N(i,r)&&oe(i,o,o.next,r)&&E(i,r)&&E(r,i)&&(n.push(i.i/e|0),n.push(o.i/e|0),n.push(r.i/e|0),I(o),I(o.next),o=t=r),o=o.next}while(o!==t);return m(o)}function be(t,n,e,o,i,r){var s=t;do{for(var l=s.next.next;l!==s.prev;){if(s.i!==l.i&&Re(s,l)){var a=re(s,l);s=m(s,s.next),a=m(a,a.next),w(s,n,e,o,i,r,0),w(a,n,e,o,i,r,0);return}l=l.next}s=s.next}while(s!==t)}function Te(t,n,e,o){var i=[],r,s,l,a,c;for(r=0,s=n.length;r<s;r++)l=n[r]*o,a=r<s-1?n[r+1]*o:t.length,c=ie(t,l,a,o,!1),c===c.next&&(c.steiner=!0),i.push(Oe(c));for(i.sort(Me),r=0;r<i.length;r++)e=De(i[r],e);return e}function Me(t,n){return t.x-n.x}function De(t,n){var e=Ge(t,n);if(!e)return n;var o=re(e,t);return m(o,o.next),m(e,e.next)}function Ge(t,n){var e=n,o=t.x,i=t.y,r=-1/0,s;do{if(i<=e.y&&i>=e.next.y&&e.next.y!==e.y){var l=e.x+(i-e.y)*(e.next.x-e.x)/(e.next.y-e.y);if(l<=o&&l>r&&(r=l,s=e.x<e.next.x?e:e.next,l===o))return s}e=e.next}while(e!==n);if(!s)return null;var a=s,c=s.x,u=s.y,g=1/0,f;e=s;do o>=e.x&&e.x>=c&&o!==e.x&&L(i<u?o:r,i,c,u,i<u?r:o,i,e.x,e.y)&&(f=Math.abs(i-e.y)/(o-e.x),E(e,t)&&(f<g||f===g&&(e.x>s.x||e.x===s.x&&Ne(s,e)))&&(s=e,g=f)),e=e.next;while(e!==a);return s}function Ne(t,n){return v(t.prev,t,n.prev)<0&&v(n.next,t,t.next)<0}function Fe(t,n,e,o){var i=t;do i.z===0&&(i.z=O(i.x,i.y,n,e,o)),i.prevZ=i.prev,i.nextZ=i.next,i=i.next;while(i!==t);i.prevZ.nextZ=null,i.prevZ=null,ze(i)}function ze(t){var n,e,o,i,r,s,l,a,c=1;do{for(e=t,t=null,r=null,s=0;e;){for(s++,o=e,l=0,n=0;n<c&&(l++,o=o.nextZ,!!o);n++);for(a=c;l>0||a>0&&o;)l!==0&&(a===0||!o||e.z<=o.z)?(i=e,e=e.nextZ,l--):(i=o,o=o.nextZ,a--),r?r.nextZ=i:t=i,i.prevZ=r,r=i;e=o}r.nextZ=null,c*=2}while(s>1);return t}function O(t,n,e,o,i){return t=(t-e)*i|0,n=(n-o)*i|0,t=(t|t<<8)&16711935,t=(t|t<<4)&252645135,t=(t|t<<2)&858993459,t=(t|t<<1)&1431655765,n=(n|n<<8)&16711935,n=(n|n<<4)&252645135,n=(n|n<<2)&858993459,n=(n|n<<1)&1431655765,t|n<<1}function Oe(t){var n=t,e=t;do(n.x<e.x||n.x===e.x&&n.y<e.y)&&(e=n),n=n.next;while(n!==t);return e}function L(t,n,e,o,i,r,s,l){return(i-s)*(n-l)>=(t-s)*(r-l)&&(t-s)*(o-l)>=(e-s)*(n-l)&&(e-s)*(r-l)>=(i-s)*(o-l)}function Re(t,n){return t.next.i!==n.i&&t.prev.i!==n.i&&!ke(t,n)&&(E(t,n)&&E(n,t)&&Ze(t,n)&&(v(t.prev,t,n.prev)||v(t,n.prev,n))||N(t,n)&&v(t.prev,t,t.next)>0&&v(n.prev,n,n.next)>0)}function v(t,n,e){return(n.y-t.y)*(e.x-n.x)-(n.x-t.x)*(e.y-n.y)}function N(t,n){return t.x===n.x&&t.y===n.y}function oe(t,n,e,o){var i=S(v(t,n,e)),r=S(v(t,n,o)),s=S(v(e,o,t)),l=S(v(e,o,n));return!!(i!==r&&s!==l||i===0&&A(t,e,n)||r===0&&A(t,o,n)||s===0&&A(e,t,o)||l===0&&A(e,n,o))}function A(t,n,e){return n.x<=Math.max(t.x,e.x)&&n.x>=Math.min(t.x,e.x)&&n.y<=Math.max(t.y,e.y)&&n.y>=Math.min(t.y,e.y)}function S(t){return t>0?1:t<0?-1:0}function ke(t,n){var e=t;do{if(e.i!==t.i&&e.next.i!==t.i&&e.i!==n.i&&e.next.i!==n.i&&oe(e,e.next,t,n))return!0;e=e.next}while(e!==t);return!1}function E(t,n){return v(t.prev,t,t.next)<0?v(t,n,t.next)>=0&&v(t,t.prev,n)>=0:v(t,n,t.prev)<0||v(t,t.next,n)<0}function Ze(t,n){var e=t,o=!1,i=(t.x+n.x)/2,r=(t.y+n.y)/2;do e.y>r!=e.next.y>r&&e.next.y!==e.y&&i<(e.next.x-e.x)*(r-e.y)/(e.next.y-e.y)+e.x&&(o=!o),e=e.next;while(e!==t);return o}function re(t,n){var e=new R(t.i,t.x,t.y),o=new R(n.i,n.x,n.y),i=t.next,r=n.prev;return t.next=n,n.prev=t,e.next=i,i.prev=e,o.next=e,e.prev=o,r.next=o,o.prev=r,o}function X(t,n,e,o){var i=new R(t,n,e);return o?(i.next=o.next,i.prev=o,o.next.prev=i,o.next=i):(i.prev=i,i.next=i),i}function I(t){t.next.prev=t.prev,t.prev.next=t.next,t.prevZ&&(t.prevZ.nextZ=t.nextZ),t.nextZ&&(t.nextZ.prevZ=t.prevZ)}function R(t,n,e){this.i=t,this.x=n,this.y=e,this.prev=null,this.next=null,this.z=0,this.prevZ=null,this.nextZ=null,this.steiner=!1}G.deviation=function(t,n,e,o){var i=n&&n.length,r=i?n[0]*e:t.length,s=Math.abs(k(t,0,r,e));if(i)for(var l=0,a=n.length;l<a;l++){var c=n[l]*e,u=l<a-1?n[l+1]*e:t.length;s-=Math.abs(k(t,c,u,e))}var g=0;for(l=0;l<o.length;l+=3){var f=o[l]*e,x=o[l+1]*e,d=o[l+2]*e;g+=Math.abs((t[f]-t[d])*(t[x+1]-t[f+1])-(t[f]-t[x])*(t[d+1]-t[f+1]))}return s===0&&g===0?0:Math.abs((g-s)/s)};function k(t,n,e,o){for(var i=0,r=n,s=e-o;r<e;r+=o)i+=(t[s]-t[r])*(t[r+1]+t[s+1]),s=r;return i}G.flatten=function(t){for(var n=t[0][0].length,e={vertices:[],holes:[],dimensions:n},o=0,i=0;i<t.length;i++){for(var r=0;r<t[i].length;r++)for(var s=0;s<n;s++)e.vertices.push(t[i][r][s]);i>0&&(o+=t[i-1].length,e.holes.push(o))}return e};var Ve=V.exports;const Ue=pe(Ve),b=te.CLOCKWISE,B=te.COUNTER_CLOCKWISE,_={isClosed:!0};function He(t){if(t=t&&t.positions||t,!Array.isArray(t)&&!ArrayBuffer.isView(t))throw new Error("invalid polygon")}function P(t){return"positions"in t?t.positions:t}function M(t){return"holeIndices"in t?t.holeIndices:null}function We(t){return Array.isArray(t[0])}function je(t){return t.length>=1&&t[0].length>=2&&Number.isFinite(t[0][0])}function Xe(t){const n=t[0],e=t[t.length-1];return n[0]===e[0]&&n[1]===e[1]&&n[2]===e[2]}function Be(t,n,e,o){for(let i=0;i<n;i++)if(t[e+i]!==t[o-n+i])return!1;return!0}function K(t,n,e,o,i){let r=n;const s=e.length;for(let l=0;l<s;l++)for(let a=0;a<o;a++)t[r++]=e[l][a]||0;if(!Xe(e))for(let l=0;l<o;l++)t[r++]=e[0][l]||0;return _.start=n,_.end=r,_.size=o,ne(t,i,_),r}function Y(t,n,e,o,i=0,r,s){r=r||e.length;const l=r-i;if(l<=0)return n;let a=n;for(let c=0;c<l;c++)t[a++]=e[i+c];if(!Be(e,o,i,r))for(let c=0;c<o;c++)t[a++]=e[i+c];return _.start=n,_.end=a,_.size=o,ne(t,s,_),a}function Ke(t,n){He(t);const e=[],o=[];if("positions"in t){const{positions:i,holeIndices:r}=t;if(r){let s=0;for(let l=0;l<=r.length;l++)s=Y(e,s,i,n,r[l-1],r[l],l===0?b:B),o.push(s);return o.pop(),{positions:e,holeIndices:o}}t=i}if(!We(t))return Y(e,0,t,n,0,e.length,b),e;if(!je(t)){let i=0;for(const[r,s]of t.entries())i=K(e,i,s,n,r===0?b:B),o.push(i);return o.pop(),{positions:e,holeIndices:o}}return K(e,0,t,n,b),e}function Ye(t,n,e){let o=M(t);o&&(o=o.map(r=>r/n));let i=P(t);if(e){const r=i.length;i=i.slice();const s=[];for(let l=0;l<r;l+=n){s[0]=i[l],s[1]=i[l+1];const a=e(s);i[l]=a[0],i[l+1]=a[1]}}return Ue(i,o,n)}class $e extends de{constructor(n){const{fp64:e,IndexType:o=Uint32Array}=n;super({...n,attributes:{positions:{size:3,type:e?Float64Array:Float32Array},vertexValid:{type:Uint8ClampedArray,size:1},indices:{type:o,size:1}}})}get(n){const{attributes:e}=this;return n==="indices"?e.indices&&e.indices.subarray(0,this.vertexCount):e[n]}updateGeometry(n){super.updateGeometry(n);const e=this.buffers.indices;if(e)this.vertexCount=(e.value||e).length;else if(this.data&&!this.getGeometry)throw new Error("missing indices buffer")}normalizeGeometry(n){if(this.normalize){const e=Ke(n,this.positionSize);return this.opts.resolution?ve(P(e),M(e),{size:this.positionSize,gridResolution:this.opts.resolution,edgeTypes:!0}):this.opts.wrapLongitude?xe(P(e),M(e),{size:this.positionSize,maxLatitude:86,edgeTypes:!0}):e}return n}getGeometrySize(n){if($(n)){let e=0;for(const o of n)e+=this.getGeometrySize(o);return e}return P(n).length/this.positionSize}getGeometryFromBuffer(n){return this.normalize||!this.buffers.indices?super.getGeometryFromBuffer(n):null}updateGeometryAttributes(n,e){if(n&&$(n))for(const o of n){const i=this.getGeometrySize(o);e.geometrySize=i,this.updateGeometryAttributes(o,e),e.vertexStart+=i,e.indexStart=this.indexStarts[e.geometryIndex+1]}else this._updateIndices(n,e),this._updatePositions(n,e),this._updateVertexValid(n,e)}_updateIndices(n,{geometryIndex:e,vertexStart:o,indexStart:i}){const{attributes:r,indexStarts:s,typedArrayManager:l}=this;let a=r.indices;if(!a||!n)return;let c=i;const u=Ye(n,this.positionSize,this.opts.preproject);a=l.allocate(a,i+u.length,{copy:!0});for(let g=0;g<u.length;g++)a[c++]=u[g]+o;s[e+1]=i+u.length,r.indices=a}_updatePositions(n,{vertexStart:e,geometrySize:o}){const{attributes:{positions:i},positionSize:r}=this;if(!i||!n)return;const s=P(n);for(let l=e,a=0;a<o;l++,a++){const c=s[a*r],u=s[a*r+1],g=r>2?s[a*r+2]:0;i[l*3]=c,i[l*3+1]=u,i[l*3+2]=g}}_updateVertexValid(n,{vertexStart:e,geometrySize:o}){const{positionSize:i}=this,r=this.attributes.vertexValid,s=n&&M(n);if(n&&n.edgeTypes?r.set(n.edgeTypes,e):r.fill(1,e,e+o),s)for(let l=0;l<s.length;l++)r[e+s[l]/i-1]=0;r[e+o-1]=0}}function $(t){return Array.isArray(t)&&t.length>0&&!Number.isFinite(t[0])}const se=`
attribute vec2 vertexPositions;
attribute float vertexValid;

uniform bool extruded;
uniform bool isWireframe;
uniform float elevationScale;
uniform float opacity;

varying vec4 vColor;

struct PolygonProps {
  vec4 fillColors;
  vec4 lineColors;
  vec3 positions;
  vec3 nextPositions;
  vec3 pickingColors;
  vec3 positions64Low;
  vec3 nextPositions64Low;
  float elevations;
};

vec3 project_offset_normal(vec3 vector) {
  if (project_uCoordinateSystem == COORDINATE_SYSTEM_LNGLAT ||
    project_uCoordinateSystem == COORDINATE_SYSTEM_LNGLAT_OFFSETS) {
    // normals generated by the polygon tesselator are in lnglat offsets instead of meters
    return normalize(vector * project_uCommonUnitsPerWorldUnit);
  }
  return project_normal(vector);
}

void calculatePosition(PolygonProps props) {
#ifdef IS_SIDE_VERTEX
  if(vertexValid < 0.5){
    gl_Position = vec4(0.);
    return;
  }
#endif

  vec3 pos;
  vec3 pos64Low;
  vec3 normal;
  vec4 colors = isWireframe ? props.lineColors : props.fillColors;

  geometry.worldPosition = props.positions;
  geometry.worldPositionAlt = props.nextPositions;
  geometry.pickingColor = props.pickingColors;

#ifdef IS_SIDE_VERTEX
  pos = mix(props.positions, props.nextPositions, vertexPositions.x);
  pos64Low = mix(props.positions64Low, props.nextPositions64Low, vertexPositions.x);
#else
  pos = props.positions;
  pos64Low = props.positions64Low;
#endif

  if (extruded) {
    pos.z += props.elevations * vertexPositions.y * elevationScale;
  }
  gl_Position = project_position_to_clipspace(pos, pos64Low, vec3(0.), geometry.position);

  DECKGL_FILTER_GL_POSITION(gl_Position, geometry);

  if (extruded) {
  #ifdef IS_SIDE_VERTEX
    normal = vec3(
      props.positions.y - props.nextPositions.y + (props.positions64Low.y - props.nextPositions64Low.y),
      props.nextPositions.x - props.positions.x + (props.nextPositions64Low.x - props.positions64Low.x),
      0.0);
    normal = project_offset_normal(normal);
  #else
    normal = project_normal(vec3(0.0, 0.0, 1.0));
  #endif
    geometry.normal = normal;
    vec3 lightColor = lighting_getLightColor(colors.rgb, project_uCameraPosition, geometry.position.xyz, normal);
    vColor = vec4(lightColor, colors.a * opacity);
  } else {
    vColor = vec4(colors.rgb, colors.a * opacity);
  }
  DECKGL_FILTER_COLOR(vColor, geometry);
}
`,Je=`#define SHADER_NAME solid-polygon-layer-vertex-shader

attribute vec3 positions;
attribute vec3 positions64Low;
attribute float elevations;
attribute vec4 fillColors;
attribute vec4 lineColors;
attribute vec3 pickingColors;

`.concat(se,`

void main(void) {
  PolygonProps props;

  props.positions = positions;
  props.positions64Low = positions64Low;
  props.elevations = elevations;
  props.fillColors = fillColors;
  props.lineColors = lineColors;
  props.pickingColors = pickingColors;

  calculatePosition(props);
}
`),Qe=`#define SHADER_NAME solid-polygon-layer-vertex-shader-side
#define IS_SIDE_VERTEX


attribute vec3 instancePositions;
attribute vec3 nextPositions;
attribute vec3 instancePositions64Low;
attribute vec3 nextPositions64Low;
attribute float instanceElevations;
attribute vec4 instanceFillColors;
attribute vec4 instanceLineColors;
attribute vec3 instancePickingColors;

`.concat(se,`

void main(void) {
  PolygonProps props;

  #if RING_WINDING_ORDER_CW == 1
    props.positions = instancePositions;
    props.positions64Low = instancePositions64Low;
    props.nextPositions = nextPositions;
    props.nextPositions64Low = nextPositions64Low;
  #else
    props.positions = nextPositions;
    props.positions64Low = nextPositions64Low;
    props.nextPositions = instancePositions;
    props.nextPositions64Low = instancePositions64Low;
  #endif
  props.elevations = instanceElevations;
  props.fillColors = instanceFillColors;
  props.lineColors = instanceLineColors;
  props.pickingColors = instancePickingColors;

  calculatePosition(props);
}
`),qe=`#define SHADER_NAME solid-polygon-layer-fragment-shader

precision highp float;

varying vec4 vColor;

void main(void) {
  gl_FragColor = vColor;

  DECKGL_FILTER_COLOR(gl_FragColor, geometry);
}
`,D=[0,0,0,255],et={filled:!0,extruded:!1,wireframe:!1,_normalize:!0,_windingOrder:"CW",elevationScale:{type:"number",min:0,value:1},getPolygon:{type:"accessor",value:t=>t.polygon},getElevation:{type:"accessor",value:1e3},getFillColor:{type:"accessor",value:D},getLineColor:{type:"accessor",value:D},material:!0},T={enter:(t,n)=>n.length?n.subarray(n.length-t.length):t};class le extends ae{constructor(...n){super(...n),Z(this,"state",void 0)}getShaders(n){return super.getShaders({vs:n==="top"?Je:Qe,fs:qe,defines:{RING_WINDING_ORDER_CW:!this.props._normalize&&this.props._windingOrder==="CCW"?0:1},modules:[ce,Ce,ue]})}get wrapLongitude(){return!1}initializeState(){const{gl:n,viewport:e}=this.context;let{coordinateSystem:o}=this.props;e.isGeospatial&&o===F.DEFAULT&&(o=F.LNGLAT),this.setState({numInstances:0,polygonTesselator:new $e({preproject:o===F.LNGLAT&&e.projectFlat.bind(e),fp64:this.use64bitPositions(),IndexType:!n||ge(n,he.ELEMENT_INDEX_UINT32)?Uint32Array:Uint16Array})});const i=this.getAttributeManager(),r=!0;i.remove(["instancePickingColors"]),i.add({indices:{size:1,isIndexed:!0,update:this.calculateIndices,noAlloc:r},positions:{size:3,type:5130,fp64:this.use64bitPositions(),transition:T,accessor:"getPolygon",update:this.calculatePositions,noAlloc:r,shaderAttributes:{positions:{vertexOffset:0,divisor:0},instancePositions:{vertexOffset:0,divisor:1},nextPositions:{vertexOffset:1,divisor:1}}},vertexValid:{size:1,divisor:1,type:5121,update:this.calculateVertexValid,noAlloc:r},elevations:{size:1,transition:T,accessor:"getElevation",shaderAttributes:{elevations:{divisor:0},instanceElevations:{divisor:1}}},fillColors:{size:this.props.colorFormat.length,type:5121,normalized:!0,transition:T,accessor:"getFillColor",defaultValue:D,shaderAttributes:{fillColors:{divisor:0},instanceFillColors:{divisor:1}}},lineColors:{size:this.props.colorFormat.length,type:5121,normalized:!0,transition:T,accessor:"getLineColor",defaultValue:D,shaderAttributes:{lineColors:{divisor:0},instanceLineColors:{divisor:1}}},pickingColors:{size:3,type:5121,accessor:(s,{index:l,target:a})=>this.encodePickingColor(s&&s.__source?s.__source.index:l,a),shaderAttributes:{pickingColors:{divisor:0},instancePickingColors:{divisor:1}}}})}getPickingInfo(n){const e=super.getPickingInfo(n),{index:o}=e,{data:i}=this.props;return i[0]&&i[0].__source&&(e.object=i.find(r=>r.__source.index===o)),e}disablePickingIndex(n){const{data:e}=this.props;if(e[0]&&e[0].__source)for(let o=0;o<e.length;o++)e[o].__source.index===n&&this._disablePickingIndex(o);else this._disablePickingIndex(n)}draw({uniforms:n}){const{extruded:e,filled:o,wireframe:i,elevationScale:r}=this.props,{topModel:s,sideModel:l,polygonTesselator:a}=this.state,c={...n,extruded:!!e,elevationScale:r};l&&(l.setInstanceCount(a.instanceCount-1),l.setUniforms(c),i&&(l.setDrawMode(3),l.setUniforms({isWireframe:!0}).draw()),o&&(l.setDrawMode(6),l.setUniforms({isWireframe:!1}).draw())),s&&(s.setVertexCount(a.vertexCount),s.setUniforms(c).draw())}updateState(n){super.updateState(n),this.updateGeometry(n);const{props:e,oldProps:o,changeFlags:i}=n,r=this.getAttributeManager();if(i.extensionsChanged||e.filled!==o.filled||e.extruded!==o.extruded){var l;(l=this.state.models)===null||l===void 0||l.forEach(a=>a.delete()),this.setState(this._getModels(this.context.gl)),r.invalidateAll()}}updateGeometry({props:n,oldProps:e,changeFlags:o}){if(o.dataChanged||o.updateTriggersChanged&&(o.updateTriggersChanged.all||o.updateTriggersChanged.getPolygon)){const{polygonTesselator:r}=this.state;if(r.instanceCount)return;const s=n.data.attributes||{};r.updateGeometry({data:n.data,normalize:n._normalize,geometryBuffer:s.getPolygon,buffers:s,getGeometry:n.getPolygon,positionFormat:n.positionFormat,wrapLongitude:n.wrapLongitude,resolution:this.context.viewport.resolution,fp64:this.use64bitPositions(),dataChanged:o.dataChanged}),this.setState({numInstances:r.instanceCount,startIndices:r.vertexStarts}),o.dataChanged||this.getAttributeManager().invalidateAll()}}_getModels(n){const{id:e,filled:o,extruded:i}=this.props;let r,s;if(o){const l=this.getShaders("top");l.defines.NON_INSTANCED_MODEL=1,r=new W(n,{...l,id:"".concat(e,"-top"),drawMode:4,attributes:{vertexPositions:new Float32Array([0,1])},uniforms:{isWireframe:!1,isSideVertex:!1},vertexCount:0,isIndexed:!0})}return i&&(s=new W(n,{...this.getShaders("side"),id:"".concat(e,"-side"),geometry:new fe({drawMode:1,vertexCount:4,attributes:{vertexPositions:{size:2,value:new Float32Array([1,0,0,0,0,1,1,1])}}}),instanceCount:0,isInstanced:1}),s.userData.excludeAttributes={indices:!0}),{models:[s,r].filter(Boolean),topModel:r,sideModel:s}}calculateIndices(n){const{polygonTesselator:e}=this.state;n.startIndices=e.indexStarts,n.value=e.get("indices")}calculatePositions(n){const{polygonTesselator:e}=this.state;n.startIndices=e.vertexStarts,n.value=e.get("positions")}calculateVertexValid(n){n.value=this.state.polygonTesselator.get("vertexValid")}}Z(le,"defaultProps",et);Z(le,"layerName","SolidPolygonLayer");export{le as S,te as W,Ce as g,ne as m,ot as p};
