import {trackTurnRate} from './track-space.js';

// 안쪽 주행선을 고르는 선택 과제다. 필수 점프와 분기 진입에는 겹치지 않는다.
export function createApexGates(curve,length,features=curve.features||[]){
  const gates=[];
  const protectedAreas=features.filter(f=>['gap','jump','shortcut','tunnel','dash'].includes(f.type));
  const corners=features.filter(f=>['hairpin','precision','chicane','technical'].includes(f.type));
  for(const feature of corners){
    const candidates=[];
    for(let d=feature.start+24;d<feature.end-20;d+=10){
      if(protectedAreas.some(f=>d>f.start-110&&d<f.end+130))continue;
      const turn=trackTurnRate(curve,length,d);
      if(Math.abs(turn)<.004||Math.abs(turn)>.04)continue;
      candidates.push({distance:d,turn});
    }
    const chosen=[];
    candidates.sort((a,b)=>Math.abs(b.turn)-Math.abs(a.turn));
    for(const candidate of candidates){
      if(chosen.length>=Math.min(3,Math.max(1,Math.floor((feature.end-feature.start)/250))))break;
      if([...chosen,...gates].some(g=>Math.abs(g.distance-candidate.distance)<170))continue;
      const half=curve.roadHalfWidthAt(candidate.distance);
      chosen.push({...candidate,id:`apex-${Math.round(candidate.distance)}`,featureId:feature.id,
        lateral:Math.sign(candidate.turn)*half*.48,halfWidth:Math.min(2.8,half*.31),reward:12});
    }
    gates.push(...chosen);
  }
  return gates.sort((a,b)=>a.distance-b.distance);
}

// 한 프레임에 표식을 지나도 통과 순간의 차선으로 판정한다.
export function apexCrossing(gate,previous,racer,time){
  if(previous.distance>=gate.distance||racer.distance<gate.distance)return null;
  const t=(gate.distance-previous.distance)/Math.max(.001,racer.distance-previous.distance);
  const lateral=previous.lateral+(racer.lateral-previous.lateral)*t;
  const drifting=racer.drift&&racer._driftEarned>=7;
  const cleanExit=time-racer._lastCleanDriftTime<=1.1;
  const clean=!previous.routeId&&!racer.routeId&&!racer.airborne&&!racer.falling&&!racer.warp
    &&racer._wallContact===0&&racer.speed>=38&&(drifting||cleanExit);
  return clean&&Math.abs(lateral-gate.lateral)<=gate.halfWidth;
}
