import{d as l,g as s,H as a,n as o}from"./index-DuMxCAme.js";import{Y as r}from"./index-DrNnGrIX.js";import{T as n}from"./TopSheet-nIvsWM3d.js";const f="url('assets/thumbnail.jpg') no-repeat;",h=l({name:"CalculationTable",components:{TopSheet:n},props:{root:{type:String,required:!0},subfolder:{type:String,required:!0},yamlConfig:String,config:Object,thumbnail:Boolean},data:()=>({globalState:s.state,allConfigFiles:{dashboards:{},topsheets:{},vizes:{},configs:{}},files:[],isLoaded:!1,vizDetails:{title:"",description:"",thumbnail:""}}),computed:{fileApi(){return new a(this.fileSystem,s)},fileSystem(){const i=this.$store.state.svnProjects.filter(t=>t.slug===this.root);if(i.length===0)throw console.log("no such project"),Error;return i[0]},urlThumbnail(){return f}},methods:{async getVizDetails(){if(!this.fileApi)return;try{const t=await this.fileApi.getFileText(this.subfolder+"/"+this.yamlConfig);this.vizDetails=r.parse(t)}catch(t){console.error("failed "+t),this.$emit("error",""+t)}const i=this.vizDetails.title?this.vizDetails.title:"Table";this.$emit("title",i)}},async mounted(){await this.getVizDetails(),this.allConfigFiles=await this.fileApi.findAllYamlConfigs(this.subfolder);const{files:i}=await this.fileApi.getDirectory(this.subfolder);this.files=i,this.isLoaded=!0,this.thumbnail}}),c="/assets/table-NNqWMujx.png";var u=function(){var t=this,e=t._self._c;return t._self._setupProxy,e("div",{staticClass:"my-component",class:{"hide-thumbnail":!t.thumbnail},attrs:{oncontextmenu:"return false"}},[t.thumbnail?e("img",{staticClass:"thumb",attrs:{src:c,width:128}}):t._e(),!t.thumbnail&&t.isLoaded?e("div",{staticClass:"topsheet"},[e("p",{staticClass:"header"},[t._v(t._s(t.subfolder))]),e("h2",[t._v(t._s(t.vizDetails.title))]),e("p",[t._v(t._s(t.vizDetails.description))]),e("hr"),e("TopSheet",{tag:"component",staticClass:"dash-card",attrs:{fileSystemConfig:t.fileSystem,subfolder:t.subfolder,config:t.vizDetails,yaml:t.yamlConfig,files:t.files,cardTitle:t.vizDetails.title,cardId:"table1",allConfigFiles:t.allConfigFiles}})],1):t._e()])},m=[],d=o(h,u,m,!1,null,"73ee6118");const _=d.exports;export{_ as default};
