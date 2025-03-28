import{_ as r,J as S,C as f,a as b,p as E,b as I,M,G as P,l as C}from"./set-rtl-text-plugin-_unXPnRK.js";import{d as L,n as _}from"./index-DuMxCAme.js";import{t as z}from"./index-DdChIOTq.js";import{G as p}from"./index-DgdUD6UN.js";import{v as x,f as A,I as O}from"./icon-manager-BV2Kj6pv.js";import{L as F}from"./line-layer-cc9F6xoS.js";const N=[255,255,255],w=1,k=[0,0,1],D=[0,0,1];let U=0;class Q{constructor(e={}){r(this,"id",void 0),r(this,"color",void 0),r(this,"intensity",void 0),r(this,"type","point"),r(this,"position",void 0),r(this,"attenuation",void 0),r(this,"projectedLight",void 0);const{color:t=N}=e,{intensity:s=w}=e,{position:n=D}=e;this.id=e.id||"point-".concat(U++),this.color=t,this.intensity=s,this.type="point",this.position=n,this.attenuation=G(e),this.projectedLight={...this}}getProjectedLight({layer:e}){const{projectedLight:t}=this,s=e.context.viewport,{coordinateSystem:n,coordinateOrigin:o}=e.props,c=S(this.position,{viewport:s,coordinateSystem:n,coordinateOrigin:o,fromCoordinateSystem:s.isGeospatial?f.LNGLAT:f.CARTESIAN,fromCoordinateOrigin:[0,0,0]});return t.color=this.color,t.intensity=this.intensity,t.position=c,t}}function G(i){return i.attenuation?i.attenuation:"intensity"in i?[0,0,i.intensity||0]:k}const R=L({name:"PlaybackControls",props:{isRunning:{type:Boolean,required:!0},timeStart:{type:Number,required:!0},timeEnd:{type:Number,required:!0},currentTime:{type:Number,required:!0}},data:()=>({pauseWhileDragging:!1,sliderValue:0,sliderOptions:{min:0,max:1e6,clickable:!1,duration:0,lazy:!0,tooltip:!0,"tooltip-placement":"top"}}),mounted(){this.sliderOptions["custom-formatter"]=i=>this.convertSecondsToClockTimeMinutes(i),window.addEventListener("keyup",this.onKeyPressed)},beforeDestroy(){window.removeEventListener("keyup",this.onKeyPressed)},watch:{currentTime(){this.sliderValue=1e6*(this.currentTime-this.timeStart)/(this.timeEnd-this.timeStart)}},methods:{toggleSimulation(){this.$emit("click")},convertSecondsToClockTimeMinutes(i){const e=this.getSecondsFromSlider(i);try{const t=z(e),s=("00"+t.minutes).slice(-2);return`${t.hours}:${s}`}catch{return"00:00"}},dragStart(){this.isRunning&&(this.pauseWhileDragging=!0,this.$emit("click"))},dragEnd(){this.pauseWhileDragging&&this.$emit("click"),this.pauseWhileDragging=!1},dragging(i){this.$emit("time",this.getSecondsFromSlider(i))},onKeyPressed(i){i.code==="Space"&&this.toggleSimulation()},getSecondsFromSlider(i){let e=(this.timeEnd-this.timeStart)*i/1e6;return e===this.timeEnd&&(e=this.timeEnd-1),e}}});var j=function(){var e=this,t=e._self._c;return e._self._setupProxy,t("div",{staticClass:"slider-thingy"},[t("b-slider",e._b({staticClass:"slider",attrs:{size:"is-large"},on:{dragging:e.dragging,dragstart:e.dragStart,dragend:e.dragEnd},model:{value:e.sliderValue,callback:function(s){e.sliderValue=s},expression:"sliderValue"}},"b-slider",e.sliderOptions,!1)),t("div",{staticClass:"buttons"},[t("div",{staticClass:"playpause",on:{click:e.toggleSimulation}},[e.isRunning?t("i",{staticClass:"button-icon fa fa-1x fa-pause"}):t("i",{staticClass:"button-icon fa fa-1x fa-play"})])])],1)},V=[],$=_(R,j,V,!1,null,"a92cf858");const Z=$.exports,y=[0,0,0,255],B={iconAtlas:{type:"image",value:null,async:!0},iconMapping:{type:"object",value:{},async:!0},sizeScale:{type:"number",value:1,min:0},billboard:!1,sizeUnits:"pixels",sizeMinPixels:{type:"number",min:0,value:0},sizeMaxPixels:{type:"number",min:0,value:Number.MAX_SAFE_INTEGER},alphaCutoff:{type:"number",value:.05,min:0,max:1},iconStill:{type:"object",value:null},getIcon:{type:"accessor",value:i=>i.icon},getColor:{type:"accessor",value:y},getSize:{type:"accessor",value:1},getAngle:{type:"accessor",value:0},getPixelOffset:{type:"accessor",value:[0,0]},getPathStart:{type:"accessor",value:null},getPathEnd:{type:"accessor",value:null},getTimeStart:{type:"accessor",value:null},getTimeEnd:{type:"accessor",value:null},currentTime:{type:"number",value:0},pickable:{type:"boolean",value:!0},onIconError:{type:"function",value:null,compare:!1,optional:!0}};class v extends b{getShaders(){return super.getShaders({vs:x,fs:A,modules:[E,I]})}initializeState(){this.state={iconManager:new O(this.context.gl,{onUpdate:this._onUpdate.bind(this),onError:this._onError.bind(this)})},this.getAttributeManager().addInstanced({instanceTimestamps:{size:1,accessor:"getTimeStart"},instanceTimestampsNext:{size:1,accessor:"getTimeEnd"},instanceStartPositions:{size:2,accessor:"getPathStart"},instanceEndPositions:{size:2,accessor:"getPathEnd"},instanceSizes:{size:1,transition:!0,accessor:"getSize",defaultValue:1},instanceOffsets:{size:2,accessor:"getIcon",transform:this.getInstanceOffset},instanceIconFrames:{size:4,accessor:"getIcon",transform:this.getInstanceIconFrame},instanceColorModes:{size:1,type:p.UNSIGNED_BYTE,accessor:"getIcon",transform:this.getInstanceColorMode},instanceColors:{size:this.props.colorFormat.length,type:p.UNSIGNED_BYTE,normalized:!0,transition:!0,accessor:"getColor",defaultValue:y},instanceAngles:{size:1,transition:!0,accessor:"getAngle"},instancePixelOffset:{size:2,transition:!0,accessor:"getPixelOffset"}})}updateState({oldProps:e,props:t,changeFlags:s}){super.updateState({props:t,oldProps:e,changeFlags:s});const n=this.getAttributeManager(),{iconAtlas:o,iconMapping:c,data:d,getIcon:g}=t,{iconManager:a}=this.state;a.setProps({loadOptions:t.loadOptions});let l=!1;if(o||this.internalState.isAsyncPropLoading("iconAtlas")?(e.iconAtlas!==t.iconAtlas&&a.setProps({iconAtlas:o,autoPacking:!1}),e.iconMapping!==t.iconMapping&&(a.setProps({iconMapping:c}),l=!0)):a.setProps({autoPacking:!0}),(s.dataChanged||s.updateTriggersChanged&&(s.updateTriggersChanged.all||s.updateTriggersChanged.getIcon))&&a.setProps({data:d,getIcon:g}),l&&(n.invalidate("instanceOffsets"),n.invalidate("instanceIconFrames"),n.invalidate("instanceColorModes")),s.extensionsChanged){const{gl:m}=this.context;this.state.model?.delete(),this.state.model=this._getModel(m),n.invalidateAll()}}get isLoaded(){return super.isLoaded&&this.state.iconManager.isLoaded}finalizeState(){super.finalizeState(),this.state.iconManager.finalize()}draw({uniforms:e}){const{sizeScale:t,sizeMinPixels:s,sizeMaxPixels:n,sizeUnits:o,billboard:c,alphaCutoff:d,currentTime:g,iconStill:a,pickable:l}=this.props,{iconManager:h}=this.state,{viewport:m}=this.context,u=h.getTexture();u&&this.state.model.setUniforms(e).setUniforms({iconsTexture:u,iconsTextureDim:[u.width,u.height],sizeScale:t*(o==="pixels"?m.metersPerPixel:1),sizeMinPixels:s,sizeMaxPixels:n,billboard:c,alphaCutoff:d,currentTime:g,pickable:l,iconStillOffsets:this.getInstanceOffset(a),iconStillFrames:this.getInstanceIconFrame(a)}).draw()}_getModel(e){const t=[-1,-1,-1,1,1,1,1,-1];return new M(e,{...this.getShaders(),id:this.props.id,geometry:new P({drawMode:p.TRIANGLE_FAN,attributes:{positions:{size:2,value:new Float32Array(t)}}}),isInstanced:!0})}_onUpdate(){this.setNeedsRedraw()}_onError(e){const{onIconError:t}=this.getCurrentLayer().props;t?t(e):C.error(e.error)()}getInstanceOffset(e){const t=this.state.iconManager.getIconMapping(e);return[t.width/2-t.anchorX||0,t.height/2-t.anchorY||0]}getInstanceColorMode(e){return this.state.iconManager.getIconMapping(e).mask?1:0}getInstanceIconFrame(e){const t=this.state.iconManager.getIconMapping(e);return[t.x||0,t.y||0,t.width||0,t.height||0]}}v.layerName="FlatIconLayer";v.defaultProps=B;const Y={currentTime:{type:"number",value:0,min:0},getTimeStart:{type:"accessor",value:null},getTimeEnd:{type:"accessor",value:null},searchFlag:{type:"number",value:0}};class T extends F{getShaders(){const e=super.getShaders();return e.inject={"vs:#decl":`        attribute float timeStart;
        attribute float timeEnd;
        uniform float currentTime;
        uniform float searchFlag;
        varying float vTime;
      `,"vs:#main-start":`        if (searchFlag == 1.0) {
          vTime = 999.0;
        } else if(timeStart > currentTime || timeEnd < currentTime ) {
          vTime = -1.0;
          return;
        } else {
          float nearBeginning = currentTime - timeStart;
          float nearEnd = timeEnd - currentTime;
          vTime = min(nearBeginning, nearEnd);
        }
      `,"fs:#decl":`        uniform float currentTime;
        varying float vTime;
        uniform float searchFlag;
      `,"fs:#main-start":`        if (searchFlag == 0.0 && vTime == -1.0 ) discard;
      `,"fs:DECKGL_FILTER_COLOR":`        if (searchFlag == 0.0 && vTime <= 10.0) color.a *= (vTime / 10.0);
      `},e}initializeState(e){super.initializeState(e),this.getAttributeManager().addInstanced({timeStart:{size:1,accessor:"getTimeStart"},timeEnd:{size:1,accessor:"getTimeEnd"}})}draw(e){const{currentTime:t,searchFlag:s}=this.props;e.uniforms=Object.assign({},e.uniforms,{currentTime:t,searchFlag:s}),super.draw(e)}}T.layerName="PathTraceLayer";T.defaultProps=Y;export{v as I,Q as P,T as a,Z as b};
