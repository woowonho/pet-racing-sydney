import {Curve,Vector3} from '../vendor/three.module.js';

// 분기·공중·초고속 구간의 진입과 착지선은 보존한다. 일반 연결 도로에만
// 새로운 주행 리듬을 넣어, 장치의 좌표와 실제 물리가 서로 어긋나지 않게 한다.
const PROTECTED_LINES = [
  {from:[30,315],to:[30,222],before:170,after:150},
  {from:[584,-193],to:[680,-264],before:170,after:160},
  {from:[945,-495],to:[765,-950],before:180,after:230},
  {from:[-3100,-115],to:[-3100,25],before:170,after:170},
  {from:[-2305.866,609.822],to:[-2629.703,1189.109],before:180,after:140},
  {from:[2846.281,5575.545],to:[2613.449,6230.193],before:180,after:140},
  {from:[4090.080,9822.218],to:[4176.695,10497.615],before:180,after:140},
];
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const bell=t=>Math.sin(Math.PI*t)**4;

// 양 끝의 위치·접선·곡률·높이 기울기를 그대로 둔다. 코너 앞에서 갑자기
// 도로가 휘거나 솟지 않고, 같은 도로의 폭과 가드레일까지 자연스럽게 이어진다.
export class RhythmLine extends Curve {
  constructor(from,to,spec){super();this.from=from;this.to=to;this.spec=spec;this.arcLengthDivisions=360;this.forward=to.clone().sub(from).normalize();this.right=new Vector3(-this.forward.z,0,this.forward.x);}
  getPoint(t,target=new Vector3()){
    const {rhythm,amplitude,rise,polarity}=this.spec;
    const wave=rhythm==='reverse'||rhythm==='compression'?Math.sin(2*Math.PI*t)*bell(t):bell(t);
    target.copy(this.from).lerp(this.to,t).addScaledVector(this.right,amplitude*polarity*wave);
    // 크레스트는 높은 마루 하나, 압축은 작은 오르내림, 나머지는 완만한 높낮이.
    target.y+=rise*(rhythm==='compression'?Math.sin(2*Math.PI*t)*bell(t):bell(t));
    return target;
  }
}

export function planCourseRhythms(planar,marathonFeatures){
  const total=planar.getLength(),samples=[];
  for(let d=0;d<total;d+=8)samples.push({d,p:planar.getPoint(d/total)});
  const near=([x,z])=>{let best=Infinity,at=0;for(const {d,p} of samples){const gap=(p.x-x)**2+(p.z-z)**2;if(gap<best){best=gap;at=d;}}return at;};
  const protectedRanges=[...PROTECTED_LINES,...marathonFeatures.filter(f=>f.type==='jump'||f.type==='tunnel').map(f=>({...f,before:f.type==='tunnel'?190:180,after:f.type==='tunnel'?230:160}))].map(f=>({start:near(f.from)-(f.before||0),end:near(f.to)+(f.after||0)}));
  const patterns=new Map();let distance=0;
  for(let index=0;index<planar.curves.length;index++){
    const line=planar.curves[index],span=line.getLength(),start=distance;distance+=span;
    if(!line.isLineCurve3||span<180||start<5700||index===planar.curves.length-1)continue;
    if(protectedRanges.some(range=>distance>range.start&&start<range.end))continue;
    const a=line.getPoint(0),b=line.getPoint(1),mid=line.getPoint(.5);
    const accent=mid.z<1480?'sandstone':mid.z<3200?'reef':mid.z<7400?'factory':mid.z<8800?'snow':'sky';
    const count=[...patterns.values()].filter(p=>p.terrainAccent===accent).length;
    const sequence=accent==='factory'?['compression','reverse','crest','sweep']:accent==='snow'?['crest','sweep','reverse']:accent==='sky'?['sweep','reverse','crest']:['sweep','crest','reverse','compression'];
    const rhythm=sequence[count%sequence.length];
    const technical=rhythm==='reverse'||rhythm==='compression';
    const amplitude=clamp(span*(technical?.063:.12),technical?11:24,technical?28:62);
    const rise=rhythm==='crest'?clamp(span*.023,4.2,8):rhythm==='compression'?clamp(span*.008,1.3,2.8):clamp(span*.006,1.3,2.4);
    const names={sandstone:'사암 해안',reef:'리프 코스트',factory:'팩토리',snow:'화이트 리지',sky:'천공 항만'};
    const actions={sweep:'와이드 스윕',crest:'크레스트 다이브',reverse:'리버스 커팅',compression:'컴프레션 S'};
    const polarity=count%2?-1:1;
    patterns.set(index,{id:`rhythm-${accent}-${count+1}`,type:technical?'chicane':'technical',rhythm,terrainAccent:accent,v10:true,label:`${names[accent]} ${actions[rhythm]}`,recommendedSpeed:technical?68:84,halfWidth:rhythm==='compression'?8.4:rhythm==='reverse'?9.2:10.6,amplitude,rise,polarity,from:[a.x,a.z],to:[b.x,b.z],baselineStart:start,baselineEnd:distance,baselineSpan:span});
  }
  return patterns;
}
