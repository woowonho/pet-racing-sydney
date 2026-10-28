import {Curve,CubicBezierCurve3,Vector3,MathUtils} from '../vendor/three.module.js';
import {trackFrame,trackTurnRate,trackCurvature} from './track-space.js';
import {createBridgeRouteCurve} from './bridge-routes.js';

// 공통 진행률은 원래 코스의 거리, 지름길에서 실제 달린 거리는 routeLength로
// 분리한다. 위치를 건너뛰지 않고 선택한 상층 곡선을 연속해서 주행한다.
export function createRaceRoutes(mainCurve,mainLength,features){
  return features.filter(f=>f.type==='shortcut').map(feature=>{
    const start=feature.start,end=feature.end,span=end-start;
    const entryLateral=feature.entryLateral||0,exitLateral=feature.exitLateral||0;
    if(feature.kind==='bridge-mach'){
      const curve=createBridgeRouteCurve(mainCurve,mainLength,feature),routeLength=curve.getLength();
      const localDistance=d=>MathUtils.clamp((d-start)/span,0,1)*routeLength;
      return {...feature,entryLateral,exitLateral,span,curve,routeLength,entryGap:0,
        frameAt:(d,lateral=0)=>trackFrame(curve,routeLength,localDistance(d),lateral),
        turnRateAt:d=>trackTurnRate(curve,routeLength,localDistance(d)),
        curvatureAt:d=>trackCurvature(curve,routeLength,localDistance(d)),
      };
    }
    const a=trackFrame(mainCurve,mainLength,start,entryLateral);
    const b=trackFrame(mainCurve,mainLength,end,exitLateral);
    // 짧은 분기에서도 이륙 직선은 남기되 긴 코스용 접선이 출구를 지나
    // 되접히지 않도록 실제 두 끝 사이 거리와 중간 곡선 길이에 맞춘다.
    const chord=a.p.distanceTo(b.p),lead=Math.min(180,Math.max(110,chord*.3)),tail=Math.min(65,chord*.16);
    const entry=a.p.clone().addScaledVector(a.tangent,lead),exit=b.p.clone().addScaledVector(b.tangent,-tail);
    const handle=Math.min(entry.distanceTo(exit)*.33,220);
    const planar=new CubicBezierCurve3(entry,entry.clone().addScaledVector(a.tangent,handle),exit.clone().addScaledVector(b.tangent,-handle),exit);
    planar.arcLengthDivisions=1800;
    const middleLength=planar.getLength(),flatLength=lead+middleLength+tail;
    const deckHeight=feature.deckHeight||16,exitHeight=feature.exitHeight??8;
    class SkyRoute extends Curve{
      constructor(){super();this.isClosed=false;this.arcLengthDivisions=2400;}
      getPoint(t,target=new Vector3()){
        const travel=t*flatLength;
        if(travel<lead)target.copy(a.p).addScaledVector(a.tangent,travel);
        else if(travel>lead+middleLength)target.copy(exit).addScaledVector(b.tangent,travel-lead-middleLength);
        else target.copy(planar.getPointAt((travel-lead)/middleLength));
        const rise=MathUtils.smoothstep(travel,0,240);
        const descent=1-MathUtils.smoothstep(t,.7,1);
        target.y+=deckHeight*rise*descent+exitHeight*(1-descent);
        return target;
      }
    }
    const curve=new SkyRoute(),routeLength=curve.getLength();
    const localDistance=d=>MathUtils.clamp((d-start)/span,0,1)*routeLength;
    return {...feature,entryLateral,exitLateral,span,curve,routeLength,
      entryGap:feature.entryGap??45,halfWidth:feature.halfWidth||4.5,
      frameAt:(d,lateral=0)=>trackFrame(curve,routeLength,localDistance(d),lateral),
      turnRateAt:d=>trackTurnRate(curve,routeLength,localDistance(d)),
      curvatureAt:d=>trackCurvature(curve,routeLength,localDistance(d)),
    };
  });
}

export function isTrackGap(features=[],distance){
  return features.some(f=>f.type==='gap'&&distance>f.start&&distance<f.end);
}
