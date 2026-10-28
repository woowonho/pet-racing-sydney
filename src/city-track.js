import {createBridgeRouteFeatures} from './bridge-routes.js';
import {COMPACT_BLOCKS,COMPACT_CORNER_RULES,COMPACT_FEATURES,compactTerrainHeight,compactRoadFeature,applyCompactRhythms,compactPoint} from './compact-route.js';
import {Curve,CurvePath,LineCurve3,QuadraticBezierCurve3,CubicBezierCurve3,Vector3,MathUtils} from '../vendor/three.module.js';

// 시드니 지형을 경기용으로 압축한 항만 코스. 북안의 한 번에 도는 180도 코너,
// 왕복 다리, 수면 위 도약 구간, 정원 광 터널을 서로 다른 리듬으로 연결한다.
export const CITY_BLOCKS = [
  [-20,-190],[-20,620],[-100,685],[-150,744],[-150,882],[-86,882],[-86,758],
  [25,726],[140,752],[140,640],[30,640],[30,548],[30,-80],[190,-130],[275,-25],[405,-20],
  [478,-115],[735,-305],[1025,-505],[1025,-950],[650,-950],[570,-850],
  [620,-710],[510,-642],[510,-542],[410,-512],[410,-352],[315,-352],
  [315,-530],[230,-555],[165,-430],[195,-285],[140,-230],[30,-300],[-105,-270],[-135,-650],[-700,-760]
];
export const SYDNEY_LANDMARKS = Object.freeze({
  bridge:{name:'시드니 하버브리지',x:5,z:300,span:530,width:84,deckClearance:49},
  opera:{name:'시드니 오페라하우스',x:320,z:115},waterLevel:-10,
});
// 렌더러와 안전 간격 검증이 같은 주탑 치수를 사용한다. 북안의 진입 곡선이
// 사암 주탑 안으로 들어가 보이던 오류는 충돌을 끄는 대신 도로 정렬로 고친다.
export function sydneyBridgePylons(){
  return [-51,61].flatMap(x=>[33,567].map(z=>{
    const base=sydneyTerrainHeight(x,z);
    return {x,z,base,footprint:{halfWidth:15.5,halfDepth:16.5},parts:[
      {material:'stone',y:(base+38)/2-3,width:24,height:base+44,depth:25},
      {material:'sandLight',y:base+40,width:28,height:3,depth:29},
      {material:'stone',y:base+43,width:25,height:2,depth:26},
      {material:'stone',y:-3,width:31,height:9,depth:33},
    ]};
  }));
}
const smooth=(a,b,v)=>MathUtils.smoothstep(v,a,b);
const envelope=t=>t>0&&t<1?Math.sin(Math.PI*t)**2:0;
const slalom=t=>Math.sin(Math.PI*2*t)*envelope(t);

export function sydneyRoadFeature(x,z){
  // 낮은 포장 이음매는 손맛을 주지만 점프 발사대와 구분한다.
  const rough=envelope((x-304)/98)*smooth(-95,-65,z)*(1-smooth(5,25,z));
  const rollPosition=(-z-328)/150;
  const rolling=smooth(0,.1,rollPosition)*(1-smooth(.9,1,rollPosition))*smooth(373,397,x)*(1-smooth(455,479,x));
  const projection=(x-490)*.804+(z+124)*-.594;
  const across=(x-490)*.594+(z+124)*.804;
  const launchDeck=envelope(projection/250)*(1-smooth(19,35,Math.abs(across)));
  const bridgeRamp=envelope((370-z)/120)*(1-smooth(7,16,Math.abs(x-30)));
  const coastRamp=envelope((z+235)/420)*(1-smooth(9,22,Math.abs(x+3100)));
  const compact=compactRoadFeature(x,z);
  const height=compact.height+bridgeRamp*2.4+rough*.3*Math.sin((x-304)*Math.PI/15)**2
    +rolling*1.8*Math.sin((-z-328)*Math.PI*2/150)**2+launchDeck*8;
  return {rough:Math.max(rough,compact.rough),rolling:Math.max(rolling,compact.rolling),launchDeck,bridgeRamp,coastRamp:0,marathonRamp:compact.ramp,bump:compact.bump,height};
}
export function sydneyTerrainHeight(x,z){
  const bridgeBlend=smooth(-400,-200,x)*(1-smooth(115,250,x))*smooth(-170,-120,z);
  const bridge=Math.max(0,Math.sin(Math.PI*MathUtils.clamp((z+140)/940,0,1)))*39*bridgeBlend;
  const parkMask=smooth(100,220,x)*(1-smooth(-230,-155,z));
  const park=(6+5.5*Math.sin((x-180)/160)*Math.sin((-z-170)/150))*parkMask;
  const north=4.5*Math.sin((x+120)/120)*Math.sin((z-600)/130)*smooth(600,735,z);
  const coastal=(1-smooth(-1200,-500,x))*(23+17*Math.sin((z+600)/630)+11*Math.sin((x+1500)/730));
  return compactTerrainHeight(x,z,.16+bridge+park+Math.max(0,north)+Math.max(0,coastal));
}
function buildPlanarCourse(blocks,rules=[]){
  const points=blocks.map(([x,z])=>new Vector3(x,0,z));
  const corners=points.map((p,i)=>{
    const previous=points[Math.max(0,i-1)],next=points[Math.min(points.length-1,i+1)];
    if(i===0||i===points.length-1)return{p,entry:p.clone(),exit:p.clone(),incoming:p.clone().sub(previous).normalize(),outgoing:next.clone().sub(p).normalize()};
    const incoming=p.clone().sub(previous),outgoing=next.clone().sub(p);
    const hairpin=i===4||i===5;
    const rule=rules.find(rule=>rule.x===p.x&&rule.z===p.z),express=p.x===1025||rule?.style==='circular';
    const cut=hairpin?32:Math.min(rule?.cut??(express?240:68),incoming.length()*(rule?.style==='circular'?.5:express?.47:.42),outgoing.length()*(rule?.style==='circular'?.5:express?.47:.42));
    return{p,hairpin,express,cut,incoming:incoming.normalize(),outgoing:outgoing.normalize(),entry:p.clone().addScaledVector(incoming,-cut),exit:p.clone().addScaledVector(outgoing,cut)};
  });
  const planar=new CurvePath();
  for(let i=0;i<corners.length-1;i++){
    const a=corners[i],b=corners[i+1];
    if(a.exit.distanceTo(b.entry)>.001)planar.add(new LineCurve3(a.exit,b.entry));
    if(i+1===corners.length-1)continue;
    if(b.hairpin||b.express){
      // 두 개의 정확한 90도 원호가 중앙의 직선 없이 이어지는 반지름 32m 헤어핀.
      const angle=Math.acos(MathUtils.clamp(b.incoming.dot(b.outgoing),-1,1));
      const handle=b.cut*(4/3)*Math.tan(angle/4)/Math.tan(angle/2);
      planar.add(new CubicBezierCurve3(b.entry,b.entry.clone().addScaledVector(b.incoming,handle),b.exit.clone().addScaledVector(b.outgoing,-handle),b.exit));
    }else planar.add(new QuadraticBezierCurve3(b.entry,b.p,b.exit));
  }
  planar.arcLengthDivisions=12000;planar.autoClose=false;
  return planar;
}
export function createCityTrack(){
  const blocks=[...CITY_BLOCKS,...COMPACT_BLOCKS].map(point=>[...point]);
  const planar=buildPlanarCourse(blocks,COMPACT_CORNER_RULES);
  const desertRhythms=applyCompactRhythms(planar);
  const last=planar.getPoint(1),first=planar.getPoint(0);
  // 서쪽에서 돌아온 마지막 굽이는 출발점의 +z 접선으로 이어진다.
  // 다른 도로 위를 가로지르는 숨은 교차로나 강제 순간이동이 없다.
  const finishJoin=new Vector3(-20,0,-220);
  const finishCrest=new Vector3(-320,0,-100),finishDirection=new Vector3(60,0,-65);
  planar.add(new CubicBezierCurve3(last,last.clone().addScaledVector(planar.getTangent(1).normalize(),100),finishCrest.clone().sub(finishDirection),finishCrest));
  planar.add(new CubicBezierCurve3(finishCrest,finishCrest.clone().add(finishDirection),new Vector3(-20,0,-320),finishJoin));
  planar.add(new LineCurve3(finishJoin,first));
  class SydneyCourse extends Curve{
    constructor(){super();this.arcLengthDivisions=30000;this.autoClose=true;this.isClosed=true;this.courseIsClosed=true;this.courseFormat='circuit';this.courseLaps=1;}
    getPoint(t,target=new Vector3()){
      target.copy(planar.getPoint(t));
      target.z+=9*slalom((target.x-285)/140)*smooth(-95,-65,target.z)*(1-smooth(5,25,target.z));
      target.y+=sydneyTerrainHeight(target.x,target.z)+sydneyRoadFeature(target.x,target.z).height;
      return target;
    }
  }
  const curve=new SydneyCourse(),length=curve.getLength();
  const samples=[];for(let d=0;d<length;d+=5)samples.push({d,p:curve.getPointAt(d/length)});
  const distanceNear=(x,z)=>{let best=Infinity,distance=0;for(const {d,p} of samples){const error=(p.x-x)**2+(p.z-z)**2;if(error<best){best=error;distance=d;}}const coarse=distance;for(let d=Math.max(0,coarse-6);d<=Math.min(length,coarse+6);d+=.125){const p=curve.getPointAt(d/length),error=(p.x-x)**2+(p.z-z)**2;if(error<best){best=error;distance=d;}}return distance;};
  const section=(id,type,label,from,to,extra={})=>({id,type,label,start:distanceNear(...from),end:distanceNear(...to),...extra});
  curve.features=[
    section('north-finger','hairpin','밀슨스 180° 헤어핀',[-150,822],[-86,823],{direction:-1,recommendedSpeed:49}),
    section('north-switch','chicane','키리빌리 트리플 스위치',[-86,762],[30,620],{recommendedSpeed:55}),
    section('bridge-flight','jump','하버 스카이 점프',[30,315],[30,222],{minSpeed:45,launchSpeed:10}),
    section('opera-switch','chicane','오페라 S 커브',[285,-25],[423,-44],{recommendedSpeed:66}),
    section('harbour-flight','jump','오션 런치',[584,-193],[680,-264],{minSpeed:48,launchSpeed:12}),
    section('garden-tunnel','tunnel','동방 루미나 · 초고속 터널',[945,-495],[765,-950],{speedSection:true,recommendedSpeed:106,mechanic:'warp',targetSpeed:260,acceleration:180,exitSpeed:106}),
    section('tunnel-brake','braking','터널 출구 제동 구간',[743,-950],[583,-875],{recommendedSpeed:58}),
    section('garden-switch','precision','가든 니들 스위치',[580,-823],[463,-528],{recommendedSpeed:53,halfWidth:8.1}),
    section('garden-hook','hairpin','가든 더블 훅',[410,-399],[315,-421],{direction:1,recommendedSpeed:46,halfWidth:9.8}),
    section('quay-switch','chicane','서큘러 키 파이널 S',[305,-531],[153,-246],{recommendedSpeed:57}),
    section('rocks-run','speed','더 록스 해안 질주',[-145,-649],[-650,-750],{recommendedSpeed:106}),
    ...COMPACT_FEATURES.map(({from,to,...extra})=>section(extra.id,extra.type,extra.label,from,to,extra)),
    section('harbour-finger-finale','hairpin','하버 피날레 · 트리플 핑거',[-900,-90],[-500,-140],{recommendedSpeed:68,halfWidth:11.5,rhythm:'reverse',advice:'짧게 정렬 · 세 번의 반대 드리프트'}),
    section('harbour-finish-bump','speed-bump','피니시 방지턱',[-444,-127],[-401,-101],{height:1.1,recommendedSpeed:80,advice:'둥근 마루 · 정면으로 넘어가기'}),
    {id:'harbour-last-hook',type:'technical',label:'하버 피니시 훅',start:length-430,end:length-85,recommendedSpeed:70},
    {id:'harbour-finish',type:'finish',label:'하버 순환 · 출발선으로 복귀',start:length-80,end:length,recommendedSpeed:84},
  ];
  const finishBump=curve.features.find(f=>f.id==='harbour-finish-bump');finishBump.crest=distanceNear(-422.5,-114);finishBump.halfWidth=11.5;
  const gap=curve.features.find(f=>f.type==='gap');gap.launchStart=gap.start;gap.start+=12;gap.end=gap.launchStart+122;gap.resetDistance=gap.launchStart-168;
  const cliffBrake=curve.features.find(f=>f.id==='cliff-brake');cliffBrake.start=gap.end+25;
  const route=section('sandstone-sky-cut','shortcut','사암문 상층 지름길',compactPoint([-2760,-500]),compactPoint([-1990,-500]),{entryLateral:-6,entryWidth:7.2,entryApproach:28,halfWidth:4.5,minSpeed:88,requiresBoost:true,deckHeight:16,entryGap:110,launchSpeed:20,exitHeight:8,recommendedSpeed:100});
  curve.features.push(route,...createBridgeRouteFeatures(distanceNear));
  const tunnel=curve.features.find(f=>f.type==='tunnel');
  curve.features.push({id:'mach-tunnel-1',type:'dash',label:'마하 가속 패드',start:tunnel.start+110,end:tunnel.start+156,lateral:-4.5,width:5.8,targetSpeed:300,duration:1.8,acceleration:160});
  curve.features.push({id:'mach-bridge-1',type:'dash',label:'하버 런치 패드',start:130,end:176,lateral:4.5,width:5.8,targetSpeed:300,duration:1.35,acceleration:160});
  curve.features.sort((a,b)=>a.start-b.start);
  const bounds=[0,tunnel.start,distanceNear(-145,-649),distanceNear(...compactPoint([-780,-900])),distanceNear(...compactPoint([-2500,-2230])),distanceNear(...compactPoint([-3650,-1880])),distanceNear(...compactPoint([-3270,-795])),distanceNear(...compactPoint([-1730,-460])),length];
  const zoneData=[
    {id:'harbour',type:'harbour',label:'하버브리지 · 오페라',color:'#6da1b8',accent:'#88e9ff'},
    {id:'lumina-garden',type:'garden',label:'루미나 터널 · 보태닉 가든',color:'#658b68',accent:'#70e0ff'},
    {id:'rocks-coast',type:'coast',label:'더 록스 사암 해안',color:'#b6a382',accent:'#ffe0a6'},
    {id:'desert-bowl',type:'desert',label:'레드 듄 사막 보울',color:'#cf995a',groundColor:'#d0a365',accent:'#ffda91',surface:'sand',bounds:[-2670,-650,-2440,-700],center:[-1660,-1570]},
    {id:'white-ridge',type:'snow',label:'화이트 리지 · 설산 스위치백',color:'#bbdce9',groundColor:'#e6f6fc',accent:'#9eeaff',surface:'snow',bounds:[-3650,-2440,-2590,-1540],center:[-3040,-2120]},
    {id:'sandstone-cliffs',type:'cliff',label:'절벽 점프 · 사암문',color:'#aa865b',accent:'#ffdb9b'},
    {id:'factory-sky',type:'factory',label:'팩토리 · 천공 지름길',color:'#838c9a',accent:'#ffc278'},
    {id:'harbour-return',type:'harbour',label:'하버 리턴 피날레',color:'#629399',accent:'#77e4e0'},
  ];
  curve.courseZones=zoneData.map((zone,i)=>{const metadata={...zone};if(zone.bounds){const a=compactPoint([zone.bounds[0],zone.bounds[2]]),b=compactPoint([zone.bounds[1],zone.bounds[3]]);metadata.bounds=[a[0],b[0],a[1],b[1]];}if(zone.center)metadata.center=compactPoint(zone.center);return {...metadata,start:bounds[i],end:bounds[i+1]};});
  curve.sceneryZones=curve.courseZones;curve.marathonZones=curve.courseZones;curve.marathonStart=bounds[3];
  const wrap=distance=>distance>=0&&distance<length?distance:((distance%length)+length)%length;
  curve.roadHalfWidthAt=distance=>{
    const d=wrap(distance);let widening=0,narrowing=0;
    // 물리와 렌더링은 같은 폭을 읽는다. 설산 안의 빙문처럼 구간이 겹치면
    // 폭 감소를 합산하지 않고 가장 좁은 장치의 폭까지만 줄인다.
    for(const feature of curve.features){if(!feature.halfWidth||feature.type==='shortcut')continue;const blend=smooth(feature.start-70,feature.start,d)*(1-smooth(feature.end,feature.end+70,d));if(blend>0){const delta=(feature.halfWidth-11.5)*blend;widening=Math.max(widening,delta);narrowing=Math.min(narrowing,delta);}}
    const baseWidth=MathUtils.clamp(11.5+widening+narrowing,8.1,19);
    // 상층 입구의 넓어진 선택 차선도 실제 노면과 난간에 반영한다. 좁은
    // 본선 코너 앞에서는 다시 원래 폭으로 매끈하게 돌아온다.
    const approach=smooth(route.start-85,route.start-30,d)*(1-smooth(route.start+8,route.start+58,d));
    return baseWidth+(Math.max(baseWidth,10.4)-baseWidth)*approach;
  };
  curve.surfaceAt=distance=>{
    const d=wrap(distance),p=curve.getPointAt(d/length),road=sydneyRoadFeature(p.x,p.z);
    const feature=curve.features.find(f=>f.surface&&d>=f.start&&d<f.end);
    const zone=curve.courseZones.find(z=>d>=z.start&&d<z.end);
    const surface=feature?.surface||zone?.surface||'asphalt',roughness=feature?.roughness??(surface==='snow'?.12:surface==='sand'?.3:0);
    return{...road,surface,roughness,rough:Math.max(road.rough,surface==='sand'?roughness*.32:0),rolling:road.rolling};
  };
  curve.courseRhythms=desertRhythms.map(({from,to,...rhythm})=>({...rhythm,start:distanceNear(...from),end:distanceNear(...to)}));
  curve.desertRhythms=curve.courseRhythms.filter(r=>r.terrainAccent==='desert');
  curve.courseId='sydney-harbour-v15';
  return curve;
}
