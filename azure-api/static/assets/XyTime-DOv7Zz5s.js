import{r as T,g as l,R as m,j as f,M as R,d as k,n as C,H as w,h}from"./index-DuMxCAme.js";import{G as P}from"./lil-gui.esm-D2cLj-mk.js";import{Y as b}from"./index-DrNnGrIX.js";import{c as $}from"./index-CJpeH5RK.js";import{u as L}from"./util-DQCFWwhb.js";import{C as E}from"./CollapsiblePanel-CFHETc7F.js";import{D as B}from"./DrawingTool-Cen73xpL.js";import{L as _}from"./LegendBox-1NZhUn9x.js";import{L as I}from"./LegendStore-CGgeb9zL.js";import{T as x}from"./TimeSlider-aESgPRip.js";import{D as O,S as F}from"./set-rtl-text-plugin-_unXPnRK.js";import{t as V}from"./index-DdChIOTq.js";import{S as j}from"./text-layer-D7Hqm-yn.js";import{D as N}from"./data-filter-DD9Q8uXl.js";import{Z as Y}from"./ZoomButtons-B_uANENs.js";import"./fxp-4YEvQr-_.js";import"./extends-CCbyfPlC.js";import"./geojson-layer-hZyrBRgh.js";import"./path-layer-9Wx64gCW.js";import"./cut-by-mercator-bounds-Dxqq0zOT.js";import"./solid-polygon-layer-Bsu3jPdk.js";import"./layer-extension-IbahPOj_.js";class u extends j{initializeState(t){super.initializeState(t),this.getAttributeManager().addInstanced({instanceValue:{accessor:"getValue",size:1,defaultValue:0,transition:!0}})}getShaders(){return{...super.getShaders(),inject:{"vs:#decl":`
            #define MAX_COLORS 21
            #define MAX_BREAKPOINTS 20
            uniform int numBreakpoints;
            uniform vec3 colors[MAX_COLORS];
            uniform float breakpoints[MAX_BREAKPOINTS];
            attribute float instanceValue;
            `,"vs:DECKGL_FILTER_COLOR":`
            // geometry.pickingColor = instancePickingColors;
            picking_setPickingColor(geometry.pickingColor);

            int lastBreakpoint = numBreakpoints;

            for(int i=0; i < MAX_BREAKPOINTS; ++i) {
              if (instanceValue < breakpoints[i]) {
                color = vec4(colors[i], 1.0);
                return;
              }
              if (i == lastBreakpoint) {
                color = vec4(colors[i], 1.0);
                return;
              }
            }
            color = vec4(1.0, 0.0, 0.0, 1.0);
            return;
          `}}}MAX_COLORS=21;uniformColors=new Array(this.MAX_COLORS*3);uniformBreakpoints=new Array(this.MAX_COLORS-1);draw({uniforms:t}){const{colors:e,breakpoints:s}=this.props;e.map((a,n)=>{this.uniformColors[n*3]=a[0]/256,this.uniformColors[n*3+1]=a[1]/256,this.uniformColors[n*3+2]=a[2]/256}),s.map((a,n)=>{this.uniformBreakpoints[n]=a});const o={...t,colors:this.uniformColors,breakpoints:this.uniformBreakpoints,numBreakpoints:s.length};super.draw({uniforms:o})}}u.layerName="ScatterplotColorBinsLayer";u.defaultProps={colors:[[128,128,128],[128,128,128]],breakpoints:[0]};const W=new N({filterSize:1});function X(i){const t=i;try{const e=V(t),s=("00"+e.minutes).slice(-2);return`${e.hours}:${s}`}catch{return"00:00"}}function G({viewId:i=0,pointLayers:t=[],timeFilter:e=[],dark:s=!1,colors:o=[[1,0,0],[.25,.25,1]],breakpoints:a=[0],radius:n=5,mapIsIndependent:y=!1}){const[v,p]=T.useState(l.state.viewState);m[i]=()=>{p(l.state.viewState)};function S(r){r.latitude&&(r.center||(r.center=[0,0]),r.center[0]=r.longitude,r.center[1]=r.latitude,p(r),y||l.commit("setMapCamera",r))}function g(r,d){if(r.index<0)return null;const c=r?.layer?.id;if(c===void 0)return null;const A=t[c].time[r.index],z=X(A),M=t[c].value[r.index];return{html:`        <table style="font-size: 0.9rem">
        <tr>
          <td>Value</td>
          <td style="padding-left: 0.5rem;"><b>${Math.round(1e6*M)/1e6}</b></td>
        </tr><tr>
          <td style="text-align: right;">Time</td>
          <td style="padding-left: 0.5rem;"><b>${z}</b></td>
        </tr>
        </table>
      `,style:s?{color:"#ccc",backgroundColor:"#2a3c4f"}:{color:"#223",backgroundColor:"white"}}}const D=t.map((r,d)=>{const c=r.timeRange[0]>e[1]||r.timeRange[1]<e[0];return new u({data:{length:r.time.length,attributes:{getPosition:{value:r.coordinates,size:2},getFilterValue:{value:r.time,size:1},getValue:{value:r.value,size:1}}},autoHighlight:!0,breakpoints:a,colors:o,extensions:[W],id:d,filled:!0,filterRange:e.length?e:null,getRadius:n,highlightColor:[255,0,224],opacity:1,parameters:{depthTest:!1},pickable:!0,radiusScale:1,stroked:!1,updateTriggers:{getPosition:t,getFillColor:t,getFilterValue:e},visible:!c})});return f.createElement(O,{layers:D,controller:!0,useDevicePixels:!0,viewState:v,onViewStateChange:r=>S(r.viewState),pickingRadius:4,onClick:g,getTooltip:g},f.createElement(F,{mapStyle:l.getters.mapStyle,preventStyleDiffing:!0,mapboxApiAccessToken:R}))}function H(i){return new Worker("/assets/XytDataParser.worker-7nlSYWlV.js",{name:i?.name})}const q=k({name:"ModalDialogCustomColorbreakpoint",props:{breakpointsProp:{type:Array,required:!0},colorsProp:{type:Array,required:!0}},data(){return{breakpoints:[],incorrectBreakpoints:[],colors:[]}},mounted(){this.colors=this.colorsProp,this.breakpoints=this.breakpointsProp,this.checkIfBreakpointsAreCorrect()},watch:{breakpointsProp(){this.breakpoints=this.breakpointsProp;for(let i=0;i<this.breakpointsProp.length;i++)this.breakpoints[i]=this.roundToDecimalPlaces(this.breakpoints[i],6),this.breakpointsProp[i]=this.roundToDecimalPlaces(this.breakpointsProp[i],6)},colorsProp(){this.colors=this.colorsProp}},methods:{addColor(){this.breakpointsProp.push(this.breakpointsProp[this.breakpointsProp.length-1]),this.colorsProp.push(this.colorsProp[this.colorsProp.length-1]),this.$emit("addOrRemoveBreakpoint",this.colors,this.breakpoints)},intArrayToHexColor(i){if(i.length!==3)throw new Error("The array must contain exactly 3 elements.");return`#${i.map(s=>{const o=s.toString(16);return o.length===1?"0"+o:o}).join("")}`},hexColorToIntArray(i){if(i=i.replace(/^#/,""),i.length!==6)throw new Error("The hex color string must be 6 characters long.");const t=parseInt(i.slice(0,2),16),e=parseInt(i.slice(2,4),16),s=parseInt(i.slice(4,6),16);return[t,e,s]},roundToDecimalPlaces(i,t){if(t<0)throw new Error("The number of decimal places cannot be negative.");const e=Math.pow(10,t);return Math.round(i*e)/e},addBreakpoint(i){if(i==0)return;const t=this.colorsProp[i],e=this.colorsProp[i+1],s=this.breakpoints[i-1],o=this.breakpoints[i],a=this.calculateAverageColor(t,e),n=(s+o)/2;this.colorsProp.splice(i+1,0,a),this.breakpoints.splice(i,0,n),this.$emit("addOrRemoveBreakpoint",this.colors,this.breakpoints)},calculateAverageColor(i,t){if(i.length!==3||t.length!==3)throw new Error("Colors must be in the format [r, g, b]");return[Math.round((i[0]+t[0])/2),Math.round((i[1]+t[1])/2),Math.round((i[2]+t[2])/2)]},removeBreakpoint(i){this.breakpointsProp.splice(i-1,1),this.colorsProp.splice(i,1),this.$emit("addOrRemoveBreakpoint",this.colors,this.breakpoints),this.checkIfBreakpointsAreCorrect()},closeModalDialog(){this.$emit("close")},colorChange(i,t){const e=this.hexColorToIntArray(i.target.value);this.colors[t]=e,this.$emit("updateColor",this.colors)},changeBreakpoint(i,t){this.breakpoints[t]=i.target.value;for(let e=0;e<this.breakpointsProp.length;e++)this.breakpoints[e]===void 0&&(this.breakpoints[e]=this.roundToDecimalPlaces(this.breakpointsProp[e],6));this.$emit("updateBreakpoint",this.breakpoints),this.checkIfBreakpointsAreCorrect()},checkIfBreakpointsAreCorrect(){let i=Number.NEGATIVE_INFINITY;this.incorrectBreakpoints=[];let t=!0;for(let e=0;e<this.breakpoints.length;e++)this.incorrectBreakpoints[e]=!1,i=this.breakpoints[e]>i?this.breakpoints[e]:i,this.breakpoints[e]<i&&(this.incorrectBreakpoints[e]=!0,t=!1);return t}}});var U=function(){var t=this,e=t._self._c;return t._self._setupProxy,e("div",{staticClass:"modal-dialog"},[e("h2",{staticClass:"modal-dialog-heading"},[t._v("Custom Breakpoints")]),e("div",{staticClass:"color-table"},t._l(t.colors,function(s,o){return e("div",{staticClass:"color"},[e("i",{staticClass:"remove-button fas fa-xs fa-trash",on:{click:function(a){return t.removeBreakpoint(o)}}}),e("input",{staticClass:"color-picker",attrs:{type:"color"},domProps:{value:t.intArrayToHexColor(s)},on:{change:function(a){return t.colorChange(a,o)}}}),o===0?e("p",{staticClass:"comperator",domProps:{innerHTML:t._s("<p>&lt;</p>")}}):e("p",{staticClass:"comperator",domProps:{innerHTML:t._s("<p>&gE;</p>")}}),o!==0?e("input",{staticClass:"breakpoint-picker",class:{"incorrect-number-indicator":t.incorrectBreakpoints[o-1]},attrs:{type:"number",step:".01",placeholder:t.roundToDecimalPlaces(t.breakpointsProp[o-1],6)},on:{change:function(a){return t.changeBreakpoint(a,o-1)}}}):e("input",{staticClass:"breakpoint-picker",class:{"incorrect-number-indicator":t.incorrectBreakpoints[o-1]},attrs:{type:"number",step:".01",placeholder:t.roundToDecimalPlaces(t.breakpointsProp[o],6)},on:{change:function(a){return t.changeBreakpoint(a,o)}}}),e("div",{staticClass:"add-button-container"},[o!=t.colors.length-1&&o!=0?e("i",{staticClass:"remove-button fas fa-sm fa-plus",on:{click:function(a){return t.addBreakpoint(o)}}}):t._e()])])}),0),e("div",{staticClass:"button-holder"},[e("button",{staticClass:"button is-success is-small is-outlined",on:{click:t.addColor}},[t._v("Add Color")]),e("button",{staticClass:"button is-danger is-small is-outlined",on:{click:t.closeModalDialog}},[t._v("Close")])])])},Z=[],K=C(q,U,Z,!1,null,"7b970b47");const J=K.exports,Q={messages:{en:{loading:"Loading data...",sorting:"Sorting into bins...",aggregate:"Summary",maxHeight:"3D Height",showDetails:"Show Details",selection:"Selection",areas:"Areas",count:"Count",promptCRS:`Enter the coordinate reference system, e.g. EPSG:25832

These coordinates are not in long/lat format. To fix this permanently, convert them to long/lat or add "# EPSG:xxxx" to your CSV header`},de:{loading:"Dateien laden...",sorting:"Sortieren...",aggregate:"Daten",maxHeight:"3-D Höhe",showDetails:"Details anzeigen",selection:"Ausgewählt",areas:"Orte",count:"Anzahl"}}},tt=k({name:"XYTime",i18n:Q,components:{CollapsiblePanel:E,DrawingTool:B,LegendBox:_,TimeSlider:x,ZoomButtons:Y,XyTimeDeckMap:G,ModalDialogCustomColorbreakpoint:J},props:{root:{type:String,required:!0},subfolder:{type:String,required:!0},yamlConfig:String,config:Object,thumbnail:Boolean},data(){return{guiConfig:{buckets:7,exponent:4,radius:5,"clip max":100,"color ramp":"viridis",colorRamps:["bathymetry","electric","inferno","jet","magma","par","viridis"],flip:!1,"Custom breakpoints...":this.toggleModalDialog,"manual breaks":""},minRadius:5,maxRadius:50,showCustomBreakpoints:!1,viewId:`xyt-id-${Math.floor(1e12*Math.random())}`,configId:`gui-config-${Math.floor(1e12*Math.random())}`,timeLabels:[0,1],startTime:0,isAnimating:!1,timeFilter:[0,3599],colors:[[128,128,128],[128,128,128]],breakpoints:[0],range:[1/0,-1/0],timeRange:[1/0,-1/0],legendStore:null,standaloneYAMLconfig:{title:"",description:"",file:"",projection:"",thumbnail:"",radius:250,maxHeight:0,center:null,zoom:9},YAMLrequirementsXY:{file:""},columnLookup:[],gzipWorker:null,vizDetails:{title:"",description:"",file:"",projection:"",thumbnail:"",center:null,zoom:9,buckets:5,exponent:4,clipMax:100,radius:5,colorRamp:"viridis",flip:!1,breakpoints:null},myState:{statusMessage:"",subfolder:"",yamlConfig:"",thumbnail:!1},pointLayers:[],isLoaded:!1,animator:null,guiController:null,resizer:null,thumbnailUrl:"url('assets/thumbnail.jpg') no-repeat;",ANIMATE_SPEED:4,animationElapsedTime:0}},async mounted(){this.$store.commit("setFullScreen",!this.thumbnail),this.myState.thumbnail=this.thumbnail,this.myState.yamlConfig=this.yamlConfig||"",this.myState.subfolder=this.subfolder,await this.getVizDetails(),await this.buildThumbnail(),!this.thumbnail&&(this.setupLogoMover(),this.setupGui(),this.myState.statusMessage=`${this.$i18n.t("loading")}`,this.isLoaded||await this.loadFiles())},beforeDestroy(){this.resizer?.disconnect(),m[this.viewId]=void 0,delete m[this.viewId];try{this.gzipWorker&&(this.gzipWorker.postMessage({terminate:!0}),this.gzipWorker.terminate()),this.guiController&&this.guiController.destroy()}catch(i){console.warn(i)}this.animator&&window.cancelAnimationFrame(this.animator),this.$store.commit("setFullScreen",!1)},computed:{fileApi(){return new w(this.fileSystem,l)},fileSystem(){const i=this.$store.state.svnProjects.filter(t=>t.slug===this.root);if(i.length===0)throw console.log("no such project"),Error;return i[0]},urlThumbnail(){return this.thumbnailUrl}},watch:{"$store.state.viewState"(){m[this.viewId]&&m[this.viewId]()}},methods:{toggleModalDialog(){this.showCustomBreakpoints=!this.showCustomBreakpoints},handleTimeSliderValues(i){this.animationElapsedTime=i[0],this.timeFilter=i,this.timeLabels=[this.convertSecondsToClockTimeMinutes(i[0]),this.convertSecondsToClockTimeMinutes(i[1])]},setupLogoMover(){this.resizer=new ResizeObserver(this.moveLogo);const i=document.getElementById(`id-${this.viewId}`);this.resizer.observe(i)},moveLogo(){const i=document.getElementById(`${this.viewId}`),t=i?.querySelector(".mapboxgl-ctrl-bottom-left");if(t){const e=i.clientWidth>640?"280px":"36px";t.style.right=e}},setupGui(){this.guiController=new P({title:"Settings",injectStyles:!0,width:200,container:document.getElementById(this.configId)||void 0});const i=this.guiController;i.add(this.guiConfig,"radius",this.minRadius,this.maxRadius,1);const t=i.addFolder("colors");t.add(this.guiConfig,"color ramp",this.guiConfig.colorRamps).onChange(this.setColors),t.add(this.guiConfig,"flip").onChange(this.setColors);const e=i.addFolder("breakpoints");e.add(this.guiConfig,"buckets",2,19,1).onChange(this.setColors),e.add(this.guiConfig,"clip max",0,100,1).onChange(this.setColors),e.add(this.guiConfig,"exponent",1,10,1).onChange(this.setColors),e.add(this.guiConfig,"Custom breakpoints...",1,100,1)},async solveProjection(){if(!this.thumbnail){console.log("WHAT PROJECTION:");try{const i=await this.fileApi.getFileText(this.myState.subfolder+"/"+this.myState.yamlConfig);this.vizDetails=b.parse(i)}catch(i){console.error(i),this.$emit("error",""+i)}}},async getVizDetails(){if(this.config){this.validateYAML(),this.vizDetails=Object.assign({},this.config),this.setCustomGuiConfig();return}new RegExp(".*(yml|yaml)$").test(this.myState.yamlConfig)?await this.loadStandaloneYAMLConfig():this.setConfigForRawCSV()},setCustomGuiConfig(){this.config&&(this.config.radius>=this.minRadius&&this.config.radius<=this.maxRadius&&(this.guiConfig.radius=this.config.radius),Object.prototype.toString.call(this.config.breakpoints)==="[object Array]"?this.setManualBreakpoints(this.config.breakpoints):this.config.breakpoints&&(this.config.breakpoints.values.length+1!=this.config.breakpoints.colors.length?this.$emit("error",{type:h.ERROR,msg:"Wrong number of colors and values for the breakpoints.",desc:`Number of colors: ${this.config.breakpoints.colors.length}, Number of values: ${this.config.breakpoints.values.length}, Must apply: Number of colors = number of values plus one.`}):(this.guiConfig.buckets=this.config.breakpoints.colors.length,this.breakpoints=this.config.breakpoints.values,this.colors=this.config.breakpoints.colors)))},setManualBreakpoints(i){this.breakpoints=i,this.guiConfig.buckets=1+i.length},setConfigForRawCSV(){let i="EPSG:4326";this.vizDetails=Object.assign(this.vizDetails,{title:"Point Data: "+this.myState.yamlConfig,description:this.myState.yamlConfig,file:this.myState.yamlConfig,projection:i,center:this.vizDetails.center,zoom:this.vizDetails.zoom}),this.$emit("title",this.vizDetails.title||this.vizDetails.file)},async loadStandaloneYAMLConfig(){try{const i=this.myState.yamlConfig.indexOf("/")>-1?this.myState.yamlConfig:this.myState.subfolder+"/"+this.myState.yamlConfig,t=await this.fileApi.getFileText(i);this.standaloneYAMLconfig=Object.assign({},b.parse(t)),this.validateYAML(),this.setVizDetails()}catch(i){console.log("failed"+i),this.$emit("error",`File not found: ${this.myState.subfolder}/${this.myState.yamlConfig}`)}},validateYAML(){const i=new RegExp(".*(yml|yaml)$").test(this.myState.yamlConfig);let t={};i?(console.log("has yaml"),t=this.standaloneYAMLconfig):(console.log("no yaml"),t=this.config);for(const e in this.YAMLrequirementsXY)e in t||this.$emit("error",{type:h.ERROR,msg:`XYTime missing required key: ${e}`,desc:`XYTime requires keys: ${Object.keys(this.YAMLrequirementsXY)}`});t.radius==0&&this.$emit("error",{type:h.WARNING,msg:"Radius set to zero",desc:"Radius can not be zero, preset value used instead. "}),(t.zoom<5||t.zoom>50)&&this.$emit("error",{type:h.WARNING,msg:"Zoom is out of the recommended range ",desc:"Zoom levels should be between 5 and 50. "})},setVizDetails(){this.vizDetails=Object.assign({},this.vizDetails,this.standaloneYAMLconfig);const i=this.vizDetails.title?this.vizDetails.title:"Point Data: "+this.vizDetails.file;this.$emit("title",i),this.vizDetails.buckets&&(this.guiConfig.buckets=this.vizDetails.buckets),this.vizDetails.exponent&&(this.guiConfig.exponent=this.vizDetails.exponent),this.vizDetails.radius&&(this.guiConfig.radius=this.vizDetails.radius),this.vizDetails.clipMax&&(this.guiConfig["clip max"]=this.vizDetails.clipMax),this.vizDetails.colorRamp&&(this.guiConfig["color ramp"]=this.vizDetails.colorRamp)},async buildThumbnail(){if(this.thumbnail&&this.vizDetails.thumbnail)try{const t=await(await this.fileApi.getFileBlob(this.myState.subfolder+"/"+this.vizDetails.thumbnail)).arrayBuffer(),e=L.arrayBufferToBase64(t);e&&(this.thumbnailUrl=`center / cover no-repeat url(data:image/png;base64,${e})`)}catch(i){console.error(i)}},async parseCSVFile(i){this.myState.statusMessage="Loading file...";let t=0;this.gzipWorker=new H,this.gzipWorker.onmessage=async e=>{if(e.data.status)this.myState.statusMessage=e.data.status;else if(e.data.error)this.myState.statusMessage=e.data.error,this.$emit("error",{type:h.ERROR,msg:"XYT Loading Error",desc:`Error loading: ${this.myState.subfolder}/${this.vizDetails.file}`});else if(e.data.finished)this.finishedLoadingData(t,e.data);else if(e.data.needCRS){this.gzipWorker&&this.gzipWorker.terminate();let s=prompt(""+this.$t("promptCRS"))||"EPSG:25833";Number.isFinite(parseInt(s))&&(s=`EPSG:${s}`),this.vizDetails.projection=s.toUpperCase(),this.parseCSVFile(i)}else{const s=e.data.time.length;t||this.setFirstZoom(e.data.coordinates,s),t+=s,this.timeRange=[Math.min(this.timeRange[0],e.data.time[0]),Math.max(this.timeRange[1],e.data.time[s-1])],this.pointLayers.push(e.data)}},this.gzipWorker.postMessage({filepath:i,fileSystem:this.fileSystem,projection:this.vizDetails.projection})},setFirstZoom(i,t){const e=.5*(i[0]+i[t*2-2]),s=.5*(i[1]+i[t*2-1]);Number.isFinite(e)&&Number.isFinite(s)&&l.commit("setMapCamera",Object.assign({},l.state.viewState,{longitude:e,latitude:s,zoom:10}))},finishedLoadingData(i,t){console.log("ALL DONE",{totalRows:i,data:t.range,time:this.timeRange}),this.myState.statusMessage="",this.timeFilter=[this.timeRange[0],this.timeRange[0]+3599],this.isLoaded=!0,this.range=t.range,this.gzipWorker&&this.gzipWorker.terminate(),this.setColors(),this.moveLogo()},animate(){if(!this.isAnimating)return;this.animationElapsedTime=this.ANIMATE_SPEED*(Date.now()-this.startTime);const i=this.animationElapsedTime+this.timeRange[0];i>this.timeRange[1]&&(this.startTime=Date.now(),this.animationElapsedTime=0);const t=this.timeFilter[1]-this.timeFilter[0];this.timeFilter=[i,i+t],this.animator=window.requestAnimationFrame(this.animate)},toggleAnimation(){this.isAnimating=!this.isAnimating,this.isAnimating&&(this.animationElapsedTime=this.timeFilter[0]-this.timeRange[0],this.startTime=Date.now()-this.animationElapsedTime/this.ANIMATE_SPEED,this.animate())},setColors(){const i=this.guiConfig.exponent;if(this.vizDetails.breakpoints&&typeof this.vizDetails.breakpoints=="object"&&!Array.isArray(this.vizDetails.breakpoints)&&"colors"in this.vizDetails.breakpoints)this.colors=this.vizDetails.breakpoints.colors;else if(this.config&&this.config.breakpoints&&typeof this.config.breakpoints=="object"&&!Array.isArray(this.config.breakpoints)&&"colors"in this.config.breakpoints)this.colors=this.config.breakpoints.colors;else{const t=this.vizDetails.colorRamp||this.guiConfig["color ramp"];let e=$({colormap:t,nshades:256,format:"rba",alpha:1}).map(a=>[a[0],a[1],a[2]]);this.guiConfig.flip&&(e=e.reverse());const s=256/(this.guiConfig.buckets-1),o=[];for(let a=0;a<this.guiConfig.buckets-1;a++)o.push(e[Math.round(s*a)]);o.push(e[255]),this.colors=o}if(this.vizDetails.breakpoints)Array.isArray(this.vizDetails.breakpoints)&&this.vizDetails.breakpoints.length>0?this.breakpoints=this.vizDetails.breakpoints:typeof this.vizDetails.breakpoints=="object"&&!Array.isArray(this.vizDetails.breakpoints)&&"values"in this.vizDetails.breakpoints&&(this.breakpoints=this.vizDetails.breakpoints.values,"colors"in this.vizDetails.breakpoints&&(this.guiConfig.buckets=this.vizDetails.breakpoints.colors.length));else if(this.config&&this.config.breakpoints)Array.isArray(this.config.breakpoints)?this.breakpoints=this.config.breakpoints:typeof this.config.breakpoints=="object"&&!Array.isArray(this.config.breakpoints)&&"values"in this.config.breakpoints&&(this.breakpoints=this.config.breakpoints.values,"colors"in this.config.breakpoints&&(this.guiConfig.buckets=this.config.breakpoints.colors.length));else{const e=Math.pow(this.range[1],1/i)*this.guiConfig["clip max"]/100,s=[];for(let o=1;o<this.guiConfig.buckets;o++){const a=e*o/this.guiConfig.buckets,n=Math.pow(a,i);s.push(n)}this.breakpoints=s}this.isLoaded&&this.setLegend(this.colors,this.breakpoints)},setLegend(i,t){this.range[1]-this.range[0]!==0&&(this.legendStore=new I,this.legendStore.setLegendSection({section:"Legend",column:"Legend",values:i.map((e,s)=>{const o=t[s==0?s:s-1];let a=""+Math.round(1e6*o)/1e6;return s==0&&(a="< "+a),s==i.length-1&&(a="> "+a),{label:a,value:e}})}),this.breakpoints=t)},async loadFiles(){await this.fileApi.getChromePermission(this.fileSystem.handle);try{let i=`${this.myState.subfolder}/${this.vizDetails.file}`;await this.parseCSVFile(i),this.$emit("isLoaded")}catch(i){console.error(i),this.myState.statusMessage=""+i,this.$emit("error",{type:h.ERROR,msg:"Loading/Parsing Error",desc:"Error loading/parsing: ${this.myState.subfolder}/${this.vizDetails.file}"})}},convertSecondsToClockTimeMinutes(i){const t=Math.floor(i/3600),e=Math.floor((i-t*3600)/60),s=i-t*3600-e*60,o={h:`${t}`,m:`${e}`.padStart(2,"0"),s:`${s}`.padStart(2,"0")};return`${o.h}:${o.m}`}}});var it=function(){var t=this,e=t._self._c;return t._self._setupProxy,e("div",{staticClass:"viz-plugin",class:{"hide-thumbnail":!t.thumbnail},attrs:{oncontextmenu:"return false",id:`id-${t.viewId}`}},[t.thumbnail?t._e():e("xy-time-deck-map",{staticClass:"map-layer",attrs:{viewId:t.viewId,pointLayers:t.pointLayers,timeFilter:t.timeFilter,dark:this.$store.state.isDarkMode,colors:this.colors,breakpoints:this.breakpoints,radius:this.guiConfig.radius,mapIsIndependent:!1}}),t.thumbnail?t._e():e("zoom-buttons",{attrs:{corner:"bottom"}}),e("div",{staticClass:"top-right"},[e("div",{staticClass:"gui-config",attrs:{id:t.configId}})]),e("div",{staticClass:"bottom-right"},[t.legendStore?e("div",{staticClass:"legend-area"},[e("legend-box",{attrs:{legendStore:t.legendStore}})],1):t._e()]),t.isLoaded?e("time-slider",{staticClass:"time-slider-area",attrs:{range:t.timeRange,activeTimeExtent:t.timeFilter,labels:t.timeLabels,isAnimating:t.isAnimating},on:{timeExtent:t.handleTimeSliderValues,toggleAnimation:t.toggleAnimation,drag:function(s){t.isAnimating=!1}}}):t._e(),!t.thumbnail&&t.myState.statusMessage?e("div",{staticClass:"message"},[e("p",{staticClass:"status-message"},[t._v(t._s(t.myState.statusMessage))])]):t._e(),this.showCustomBreakpoints?e("modal-dialog-custom-colorbreakpoint",{attrs:{breakpointsProp:this.breakpoints,colorsProp:this.colors},on:{close:function(s){t.showCustomBreakpoints=!1},updateColor:s=>this.setLegend(s,this.breakpoints),updateBreakpoint:s=>this.setLegend(this.colors,s),addOrRemoveBreakpoint:(s,o)=>this.setLegend(s,o)}}):t._e()],1)},et=[],st=C(tt,it,et,!1,null,"97ce61bc");const Tt=st.exports;export{Tt as default};
