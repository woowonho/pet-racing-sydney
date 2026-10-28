import {Curve,Vector3,MathUtils} from '../vendor/three.module.js';
import {trackFrame} from './track-space.js';

// 철골과 선택 주행로는 같은 아치 좌표를 쓴다. 유리관 바닥은 상부 트러스 위다.
export const BRIDGE_ARCH=Object.freeze({centerX:5,sides:[-35,45],z0:35,z1:565,rise:105,baseHeight:10,trussHeight:12,deckLift:2.7});
export function bridgeArchHeight(z,upper=true){
  const t=MathUtils.clamp((z-BRIDGE_ARCH.z0)/(BRIDGE_ARCH.z1-BRIDGE_ARCH.z0),0,1);
  return BRIDGE_ARCH.baseHeight+BRIDGE_ARCH.rise*Math.pow(Math.max(0,Math.sin(Math.PI*t)),.78)+(upper?BRIDGE_ARCH.trussHeight:0);
}
export const bridgeTubeDeckHeight=z=>bridgeArchHeight(z)+BRIDGE_ARCH.deckLift;
// 윗부분은 둥근 유리 천장, 아랫부분은 넓은 데크에 맞춘 납작한 관 단면이다.
// 낮은 타원을 쓰면 발밑 유리가 주행 폭을 가로지르므로 허리 높이까지 전폭을 비운다.
export function bridgeTubeSection(angle){
  const sine=Math.sin(angle);
  return {lateral:Math.cos(angle)*5.7,height:sine>=0?7+sine*7.3:Math.max(-.3,7+sine*20)};
}

const archSlope=z=>(bridgeTubeDeckHeight(z+.05)-bridgeTubeDeckHeight(z-.05))/.1;
const hermite=(t,a,b,da,db)=>{const t2=t*t,t3=t2*t;return (2*t3-3*t2+1)*a+(t3-2*t2+t)*da+(-2*t3+3*t2)*b+(t3-t2)*db;};
const smooth=t=>{t=MathUtils.clamp(t,0,1);return t*t*t*(t*(t*6-15)+10);};

export function createBridgeRouteFeatures(distanceNear){
  return [
    {id:'bridge-mach-outbound',label:'하버 아치 · 북행 진공관',archX:-35,from:[-20,-110],to:[-20,565]},
    {id:'bridge-mach-return',label:'하버 아치 · 남행 진공관',archX:45,from:[30,585],to:[30,5]},
  ].map(({from,to,...route})=>({...route,type:'shortcut',kind:'bridge-mach',entryMode:'ramp',
    start:distanceNear(...from),end:distanceNear(...to),entryLateral:6,exitLateral:6,
    entryWidth:7.2,entryApproach:28,halfWidth:4.5,minSpeed:24,requiresBoost:false,entryGap:0,exitHeight:0,
    targetSpeed:300,acceleration:240,deceleration:250,exitSpeed:76,speedSection:true,recommendedSpeed:300,
  }));
}

export function createBridgeRouteCurve(mainCurve,mainLength,feature){
  const a=trackFrame(mainCurve,mainLength,feature.start,feature.entryLateral);
  const b=trackFrame(mainCurve,mainLength,feature.end,feature.exitLateral);
  const south=a.p.z<b.p.z?a:b,north=a.p.z<b.p.z?b:a;
  const coreSouth=155,coreNorth=445;
  const southSpan=coreSouth-south.p.z,northSpan=north.p.z-coreNorth;
  const slope=frame=>frame.tangent.y/frame.tangent.z;
  class BridgeTube extends Curve{
    constructor(){super();this.isClosed=false;this.arcLengthDivisions=2400;}
    getPoint(t,target=new Vector3()){
      const z=MathUtils.lerp(a.p.z,b.p.z,t);
      let y,x;
      if(z<coreSouth){
        const u=(z-south.p.z)/southSpan;
        y=hermite(u,south.p.y,bridgeTubeDeckHeight(coreSouth),slope(south)*southSpan,archSlope(coreSouth)*southSpan)+(feature.archX>0?20:0)*Math.sin(Math.PI*u)**2;
        // 주탑 옆에서는 본선 쪽을 지나다 주탑을 지난 뒤 철골 중심으로 붙는다.
        x=MathUtils.lerp(south.p.x,feature.archX,smooth((z-70)/(coreSouth-70)));
      }else if(z>coreNorth){
        const u=(z-coreNorth)/northSpan;
        y=hermite(u,bridgeTubeDeckHeight(coreNorth),north.p.y,archSlope(coreNorth)*northSpan,slope(north)*northSpan)+20*Math.sin(Math.PI*u)**2;
        x=MathUtils.lerp(feature.archX,north.p.x,smooth((z-coreNorth)/(535-coreNorth)));
      }else{x=feature.archX;y=bridgeTubeDeckHeight(z);}
      return target.set(x,y,z);
    }
  }
  return new BridgeTube();
}
