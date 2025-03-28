import{P as s}from"./path-layer-9Wx64gCW.js";const a={NONE:0,LEFT:1,RIGHT:2};class t extends s{initializeState(e){super.initializeState(e),this.getAttributeManager().addInstanced({instanceOffset:{size:1,accessor:"getOffset"}})}getShaders(){return{...super.getShaders(),inject:{"vs:#decl":`
            attribute float instanceOffset;
            varying float offset;
            `,"vs:#main-start":`
            offset = instanceOffset;
            `,"fs:#decl":`
            varying float offset;
            `,"fs:#main-start":`
            if (offset == 1.0 && vPathPosition.x < 0.0) {
                discard;
            }
            if (offset == 2.0 && vPathPosition.x > 0.0) {
                discard;
            }
            if (offset == 0.0 && abs(vPathPosition.x) > 0.5) {
                discard;
            }
        `}}}}t.layerName="PathOffsetLayer";t.defaultProps={getOffset:{type:"accessor",value:a.RIGHT}};export{t as P};
