import {Curve,CurvePath,LineCurve3,QuadraticBezierCurve3,Vector3,MathUtils} from '../vendor/three.module.js';

// 시드니 항만을 경기용으로 압축했다. 북안 S자 코너와 정원의 오르내리는
// 굴곡을 거쳐 하버브리지의 두 차로를 모두 달린다.
export const CITY_BLOCKS = [
  [-20,-130],[-20,570],[-120,690],[-80,815],[50,845],[160,765],[140,665],[30,590],
  [30,-80],[190,-130],[275,-25],[415,-20],[480,-105],[565,-180],[540,-300],
  [430,-330],[410,-470],[265,-500],[230,-365],[140,-230],[30,-300],[-105,-270]
];
export const SYDNEY_LANDMARKS = Object.freeze({
  bridge:{name:'시드니 하버브리지',x:5,z:300,span:530,width:84,deckClearance:49},
  opera:{name:'시드니 오페라하우스',x:320,z:115},waterLevel:-10,
});
const smooth=(a,b,v)=>MathUtils.smoothstep(v,a,b);
// 구간 경계에서 높이와 기울기가 함께 0이 되어 진입·탈출이 튀지 않는다.
const envelope=t=>t>0&&t<1?Math.sin(Math.PI*t)**2:0;
const slalom=t=>Math.sin(Math.PI*2*t)*envelope(t);
export function sydneyRoadFeature(x,z){
  // 오페라하우스 남쪽 포장 구간: 15m 간격, 최대 30cm의 낮은 요철.
  const rough=envelope((x-304)/98)*smooth(-95,-65,z)*(1-smooth(5,25,z));
  // 정원 언덕: 150m 구간에 두 번의 긴 오르내림, 최대 1.8m.
  const rollPosition=(-z-328)/150;
  const rolling=smooth(0,.1,rollPosition)*(1-smooth(.9,1,rollPosition))*smooth(373,397,x)*(1-smooth(455,479,x));
  const height=rough*.3*Math.sin((x-304)*Math.PI/15)**2
    +rolling*1.8*Math.sin((-z-328)*Math.PI*2/150)**2;
  return {rough,rolling,height};
}
export function sydneyTerrainHeight(x,z){
  const bridgeBlend=(1-smooth(115,205,x))*smooth(-170,-120,z);
  const bridge=Math.max(0,Math.sin(Math.PI*MathUtils.clamp((z+140)/940,0,1)))*39*bridgeBlend;
  const parkMask=smooth(100,220,x)*(1-smooth(-230,-155,z));
  const park=(6+7*Math.sin((x-180)/160)*Math.sin((-z-170)/150))*parkMask;
  const north=5*Math.sin((x+120)/120)*Math.sin((z-600)/130)*smooth(600,735,z);
  return .16+bridge+park+Math.max(0,north);
}
export function createCityTrack(){
  const points=CITY_BLOCKS.map(([x,z])=>new Vector3(x,0,z));
  const corners=points.map((p,i)=>{const previous=points[(i+points.length-1)%points.length],next=points[(i+1)%points.length],incoming=p.clone().sub(previous),outgoing=next.clone().sub(p),cut=Math.min(74,incoming.length()*.42,outgoing.length()*.42);return{p,entry:p.clone().addScaledVector(incoming.normalize(),-cut),exit:p.clone().addScaledVector(outgoing.normalize(),cut)};});
  const planar=new CurvePath();for(let i=0;i<corners.length;i++){const a=corners[i],b=corners[(i+1)%corners.length];planar.add(new LineCurve3(a.exit,b.entry));planar.add(new QuadraticBezierCurve3(b.entry,b.p,b.exit));}planar.arcLengthDivisions=6000;planar.autoClose=true;
  class SydneyCourse extends Curve{
    constructor(){super();this.arcLengthDivisions=16000;this.autoClose=true;}
    getPoint(t,target=new Vector3()){
      target.copy(planar.getPoint(t));
      // 다리 두 차로의 축은 보존하고 북안·오페라 남쪽 직선만 S자로 휜다.
      target.x+=12*slalom((target.z-645)/170)*(1-smooth(-45,-15,target.x));
      target.z+=8*slalom((target.x-285)/140)*smooth(-95,-65,target.z)*(1-smooth(5,25,target.z));
      target.y=sydneyTerrainHeight(target.x,target.z)+sydneyRoadFeature(target.x,target.z).height;
      return target;
    }
  }
  return new SydneyCourse();
}
