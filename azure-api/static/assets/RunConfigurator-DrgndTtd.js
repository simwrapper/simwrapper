import{d as p,g as u,n as c}from"./index-DuMxCAme.js";import{f as s}from"./fxp-4YEvQr-_.js";import{Y as v}from"./index-DrNnGrIX.js";const d=`# MATSim run configurator - config.xml edit fields

sections:
  - title: General settings
    entries:
      - xml: controler.param
        name: runId
        title: 'Name of the run'
        type: text
        value: ''

      - xml: controler.param
        name: lastIteration
        title: 'Number of iterations'
        type: number
        value: '1'

      - xml: controler.param
        name: writeEventsInterval
        title: 'Write events every n iterations'
        type: number
        value: '50'

      - xml: controler.param
        name: writePlansInterval
        title: 'Write plans every n iterations'
        type: number
        value: '50'
        hint: 'Set to 0 to disable writing plans'

  - title: Mobility simulation
    entries:
      - xml: qsim.param
        name: endTime
        title: 'End time'
        type: text
        value: '24:00:00'

      - xml: qsim.param
        name: flowCapacityFactor
        title: 'Flow capacity factor'
        type: number
        value: '0.10'

      - xml: qsim.param
        name: storageCapacityFactor
        title: 'Storage capacity factor'
        type: number
        value: '0.10'

      - xml: qsim.param
        name: mainMode
        title: 'Main modes'
        type: text
        value: 'car,freight'

      - xml: qsim.param
        name: stuckTime
        title: 'Stuck time (minutes)'
        type: number
        value: '30.0'

      - xml: qsim.param
        name: trafficDynamics
        title: 'Traffic Dynamics'
        type: selection
        options:
          - kinematicWaves
          - other
        value: 'kinematicWaves'
`,g=`<?xml version="1.0" encoding="UTF-8"?>\r
<!DOCTYPE config SYSTEM "http://www.matsim.org/files/dtd/config_v2.dtd">\r
<config>\r
	<module name="TimeAllocationMutator" >\r
		<param name="mutationRange" value="7200.0" />\r
	</module>\r
	<module name="controler" >\r
		<param name="lastIteration" value="250" />\r
		<param name="overwriteFiles" value="failIfDirectoryExists" />\r
		<param name="runId" value="berlin-v5.5-1pct" />\r
		<param name="outputDirectory" value="./scenarios/berlin-v5.5-1pct/output-berlin-v5.5-1pct" />\r
		<param name="writeEventsInterval" value="50" />\r
		<param name="writePlansInterval" value="50" />\r
	</module>\r
	<module name="global" >\r
		<param name="coordinateSystem" value="EPSG:31468" />\r
		<param name="insistingOnDeprecatedConfigVersion" value="false" />\r
		<param name="numberOfThreads" value="8" />\r
	</module>\r
	<module name="network" >\r
		<param name="inputNetworkFile" value="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/berlin-v5.5-10pct/input/berlin-v5.5-network.xml.gz" />\r
	</module>\r
	<module name="plans" >\r
		<param name="inputPlansFile" value="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/berlin-v5.5-1pct/input/berlin-v5.5-1pct.plans.xml.gz" />\r
		<param name="removingUnnecessaryPlanAttributes" value="true" />\r
	</module>\r
	<module name="vehicles" >\r
		<param name="vehiclesFile" value="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/berlin-v5.5-10pct/input/berlin-v5-mode-vehicle-types.xml" />\r
	</module>\r
	<module name="transit" >\r
		<param name="transitScheduleFile" value="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/berlin-v5.5-10pct/input/berlin-v5.5-transit-schedule.xml.gz" />\r
		<param name="useTransit" value="true" />\r
		<param name="vehiclesFile" value="https://svn.vsp.tu-berlin.de/repos/public-svn/matsim/scenarios/countries/de/berlin/berlin-v5.5-10pct/input/berlin-v5.5-transit-vehicles.xml.gz" />\r
	</module>\r
	<module name="planscalcroute" >\r
		<param name="networkModes" value="car,freight,ride" />\r
		<parameterset type="teleportedModeParameters" >\r
			<param name="beelineDistanceFactor" value="1.3" />\r
			<param name="mode" value="bicycle" />\r
			<param name="teleportedModeSpeed" value="3.1388889" />\r
		</parameterset>\r
		<parameterset type="teleportedModeParameters" >\r
			<param name="beelineDistanceFactor" value="1.3" />\r
			<param name="mode" value="walk" />\r
			<param name="teleportedModeSpeed" value="1.0555556" />\r
		</parameterset>\r
	</module>\r
	<module name="qsim" >\r
		<param name="endTime" value="36:00:00" />\r
		<param name="flowCapacityFactor" value="0.015" />\r
		<param name="mainMode" value="car,freight" />\r
		<param name="numberOfThreads" value="8" />\r
		<param name="startTime" value="00:00:00" />\r
		<param name="storageCapacityFactor" value="0.015" />\r
		<param name="stuckTime" value="30.0" />\r
		<param name="trafficDynamics" value="kinematicWaves" />\r
		<param name="vehiclesSource" value="modeVehicleTypesFromVehiclesData" />\r
		<param name="insertingWaitingVehiclesBeforeDrivingVehicles" value="true" />\r
	</module>\r
	<module name="strategy" >\r
		<param name="fractionOfIterationsToDisableInnovation" value="0.8" />\r
		<parameterset type="strategysettings" >\r
			<param name="strategyName" value="ChangeExpBeta" />\r
			<param name="subpopulation" value="person" />\r
			<param name="weight" value="0.85" />\r
		</parameterset>\r
		<parameterset type="strategysettings" >\r
			<param name="strategyName" value="ReRoute" />\r
			<param name="subpopulation" value="person" />\r
			<param name="weight" value="0.05" />\r
		</parameterset>\r
		<parameterset type="strategysettings" >\r
			<param name="strategyName" value="SubtourModeChoice" />\r
			<param name="subpopulation" value="person" />\r
			<param name="weight" value="0.05" />\r
		</parameterset>\r
		<parameterset type="strategysettings" >\r
			<param name="strategyName" value="TimeAllocationMutator" />\r
			<param name="subpopulation" value="person" />\r
			<param name="weight" value="0.05" />\r
		</parameterset>\r
		<parameterset type="strategysettings" >\r
			<param name="strategyName" value="ChangeExpBeta" />\r
			<param name="subpopulation" value="freight" />\r
			<param name="weight" value="0.95" />\r
		</parameterset>\r
		<parameterset type="strategysettings" >\r
			<param name="strategyName" value="ReRoute" />\r
			<param name="subpopulation" value="freight" />\r
			<param name="weight" value="0.05" />\r
		</parameterset>\r
	</module>\r
	<module name="subtourModeChoice" >\r
		<param name="chainBasedModes" value="car,bicycle" />\r
		<param name="modes" value="car,pt,bicycle,walk" />\r
	</module>\r
	<module name="transitRouter" >\r
		<param name="extensionRadius" value="500.0" />\r
	</module>\r
	<module name="travelTimeCalculator" >\r
		<param name="analyzedModes" value="car,freight" />\r
		<param name="separateModes" value="true" />\r
	</module>\r
	<module name="vspExperimental" >\r
		<param name="vspDefaultsCheckingLevel" value="abort" />\r
	</module>\r
	<module name="planCalcScore" >\r
		<param name="fractionOfIterationsToStartScoreMSA" value="1.0" />\r
		<parameterset type="scoringParameters" >\r
			<param name="marginalUtilityOfMoney" value="0.6" />\r
			<parameterset type="modeParams" >\r
				<!--set this to -0.9 during income calibration process-->\r
				<param name="constant" value="-1.0" />\r
				<param name="marginalUtilityOfTraveling_util_hr" value="0.0" />\r
				<param name="mode" value="car" />\r
				<param name="monetaryDistanceRate" value="-0.0002" />\r
				<param name="dailyMonetaryConstant" value="-5.3" />\r
			</parameterset>\r
			<parameterset type="modeParams" >\r
				<param name="constant" value="-0.0" />\r
				<param name="marginalUtilityOfTraveling_util_hr" value="0.0" />\r
				<param name="mode" value="ride" />\r
				<param name="monetaryDistanceRate" value="-0.0002" />\r
				<param name="dailyMonetaryConstant" value="-0.0" />\r
			</parameterset>\r
			<parameterset type="modeParams" >\r
				<param name="marginalUtilityOfTraveling_util_hr" value="0.0" />\r
				<param name="mode" value="freight" />\r
				<param name="monetaryDistanceRate" value="-0.0004" />\r
			</parameterset>\r
			<parameterset type="modeParams" >\r
				<param name="constant" value="-0.3" />\r
				<param name="marginalUtilityOfTraveling_util_hr" value="0.0" />\r
				<param name="mode" value="pt" />\r
				<param name="dailyMonetaryConstant" value="-2.1" />\r
			</parameterset>\r
			<parameterset type="modeParams" >\r
				<param name="constant" value="-1.8" />\r
				<param name="marginalUtilityOfTraveling_util_hr" value="0.0" />\r
				<param name="mode" value="bicycle" />\r
			</parameterset>\r
			<parameterset type="modeParams" >\r
				<param name="marginalUtilityOfTraveling_util_hr" value="0.0" />\r
				<param name="mode" value="walk" />\r
			</parameterset>\r
		</parameterset>\r
	</module>\r
\r
	<module name="transitRouter">\r
		<!-- Factor with which direct walk generalized cost is multiplied before it is compared to the pt generalized cost.  Set to a very high value to reduce direct walk results. -->\r
		<param name="directWalkFactor" value="1.0" />\r
		<!-- maximum beeline distance between stops that agents could transfer to by walking -->\r
		<param name="maxBeelineWalkConnectionDistance" value="300.0" />\r
	</module>\r
</config>\r
`,f={messages:{en:{},de:{}}},y=p({name:"RunConfigurator",components:{},i18n:f,props:{id:{type:String,required:!0},model:{type:String,required:!1},xml:{type:Object,required:!1}},data:()=>({globalState:u.state,sections:[],activeSection:-1,xmlConfig:{}}),mounted(){this.$store.commit("setShowLeftBar",!0);const n=v.parse(d);console.log({yaml:n}),this.sections=n.sections,this.setupXml(),this.activeSection=0},watch:{},computed:{isDark(){return this.$store.state.isDarkMode}},methods:{setupXml(){const n=new s.XMLParser({ignoreAttributes:!1,preserveOrder:!1,attributeNamePrefix:"$"});try{this.xmlConfig=n.parse(g)}catch(t){throw console.error("WHAT",t),Error(""+t)}for(const t of this.sections)for(const e of t.entries){const[a,r]=e.xml.split("."),l=this.xmlConfig.config.module.find(m=>m.$name==a);if(r=="param"){const m=l.param.find(i=>i.$name==e.name);e.value=m.$value}}},update(){for(const e of this.sections)for(const a of e.entries){const[r,l]=a.xml.split("."),m=this.xmlConfig.config.module.find(i=>i.$name==r);if(l=="param"){const i=m.param.find(o=>o.$name==a.name);i.$value=a.value}}console.log(this.xmlConfig);const t=new s.XMLBuilder({format:!0,ignoreAttributes:!1,attributeNamePrefix:"$",suppressUnpairedNode:!0,suppressEmptyNode:!0}).build(this.xmlConfig);console.log(t)},switchSection(n){this.activeSection=n}}});var b=function(){var t=this,e=t._self._c;return t._self._setupProxy,e("div",{staticClass:"configurator"},[e("div",{staticClass:"content"},[e("div",{staticClass:"section-panel"},t._l(t.sections,function(a,r){return e("div",{key:a.name,staticClass:"config-section",on:{click:function(l){return t.switchSection(r)}}},[e("p",{class:{active:t.activeSection==r}},[t._v(t._s(a.title))])])}),0),t.activeSection>-1?e("div",{staticClass:"details-panel"},[e("div",{staticClass:"buttons"},[e("b-button",[t._v("Cancel")]),e("b-button",{attrs:{type:"is-success"},on:{click:t.update}},[t._v("Save")])],1),t._l(t.sections[t.activeSection].entries,function(a){return e("div",{staticClass:"entry"},[e("p",[t._v(t._s(a.title))]),e("b-input",{attrs:{type:"text"},model:{value:a.value,callback:function(r){t.$set(a,"value",r)},expression:"item.value"}})],1)})],2):t._e()])])},h=[],x=c(y,b,h,!1,null,"770a35e2");const S=x.exports;export{S as default};
