import i from"./MatrixViewer-C8VkWriS.js";import{n as m}from"./index-DuMxCAme.js";import"./index-DrNnGrIX.js";import"./index-Bosdr0xX.js";import"./util-DQCFWwhb.js";import"./fxp-4YEvQr-_.js";import"./extends-CCbyfPlC.js";import"./set-rtl-text-plugin-_unXPnRK.js";import"./ColorMapSelector-4UY7tMD7.js";import"./ColorsAndWidths-C_kXVV7D.js";import"./color-DZRtpOAM.js";import"./cubehelix-Bg3rkAQA.js";import"./rainbow-Dz4seJAz.js";import"./threshold-DxQAdYxA.js";import"./index-_doEQLKC.js";import"./lodash-Bb7CDKDt.js";import"./hcl-BuAPUl0w.js";import"./year-DwdiMAWv.js";import"./round-D-ROWHlE.js";import"./pow-CIR03aoW.js";import"./range-OtVwhkKS.js";import"./comlink-DESosX-g.js";import"./index-CrY58g0x.js";import"./screenshots-DO4qr9lR.js";import"./ZoomButtons-B_uANENs.js";import"./geojson-layer-hZyrBRgh.js";import"./text-layer-D7Hqm-yn.js";import"./path-layer-9Wx64gCW.js";import"./cut-by-mercator-bounds-Dxqq0zOT.js";import"./solid-polygon-layer-Bsu3jPdk.js";const e={name:"MatrixPanel",components:{MatrixViewer:i},props:{config:Object,datamanager:Object,fileSystemConfig:Object,subfolder:String,yamlConfig:String},methods:{isLoaded(){this.$emit("isLoaded")}}};var a=function(){var r=this,o=r._self._c;return o("matrix-viewer",{staticClass:"deck-map",attrs:{root:r.fileSystemConfig.slug,subfolder:r.subfolder,configFromDashboard:r.config,thumbnail:!1,datamanager:r.datamanager,yamlConfig:"config"},on:{isLoaded:r.isLoaded,error:function(t){return r.$emit("error",t)}}})},n=[],p=m(e,a,n,!1,null,"e038fe06");const E=p.exports;export{E as default};
