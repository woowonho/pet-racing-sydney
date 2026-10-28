import {RhythmLine} from './course-rhythm.js';

// 넓은 사막의 반경 변화 → 설산 스위치백 → 절벽 도약 → 공장 협로를
// 한 번씩만 지난다. 실제 지역 사이 거리는 1랩 경기 공간으로 압축했다.
export const COMPACT_BLOCKS = [
 [-1120,-1120],[-870,-1480],[-1210,-1820],[-1640,-1550],
 [-1910,-1900],[-2440,-2200],
 [-2800,-2390],[-3140,-2360],[-3150,-2120],[-2780,-2010],
 [-2780,-1760],[-3150,-1700],[-3220,-1970],[-3650,-1970],
 [-3650,-800],[-3100,-780],[-2850,-500],[-2550,-500],
 [-2380,-210],[-2180,-500],[-1400,-500],
 // 사암 상층의 착지 직선 뒤, 반지름 48m인 세 번의 왕복 코너를 이어 붙인다.
 [-1570,-210],[-1050,-360],[-1200,-12],[-960,-12],[-960,-128],
 [-720,-128],[-720,-12],[-612,-12],[-612,-140],[-500,-140],
];
export const COMPACT_CORNER_RULES = [
 {x:-700,z:-760,cut:140,style:'circular'},
 ...[
 [-1120,-1120,120],[-870,-1480,105],[-1210,-1820,125],[-1640,-1550,115],
 [-1910,-1900,130],[-2440,-2200,140],
 [-2800,-2390,120],[-3140,-2360,100],[-3150,-2120,85],[-2780,-2010,94],
 [-2780,-1760,96],[-3150,-1700,102],[-3220,-1970,95],[-3650,-1970,112],
 [-3650,-800,95],[-3100,-780,125],[-2850,-500,95],[-2550,-500,65],
 [-2380,-210,150],[-2180,-500,70],[-1400,-500,100],
 [-1570,-210,110],[-1050,-360,112],[-1200,-12,48],[-960,-12,48],[-960,-128,48],
 [-720,-128,48],[-720,-12,48],[-612,-12,48],[-612,-140,48],
 ].map(([x,z,cut])=>({x,z,cut,style:'circular'})),
];
const smooth=(a,b,v)=>{const t=Math.max(0,Math.min(1,(v-a)/(b-a)));return t*t*(3-2*t);};
const bell=t=>t>0&&t<1?Math.sin(Math.PI*t)**4:0;
const ROAD_PATCHES=[
 // 실제 사막 중심선을 따라 둥근 마루와 압축을 반복한다. 모든 범프는
 // 끝의 높이·경사가 0으로 이어져 물리와 보이는 모래 노면이 같이 움직인다.
 {world:true,from:[-820,-860],to:[-830,-965],height:2,rough:.8,rolling:1},
 {world:true,from:[-806,-999],to:[-826,-1108],height:1.6,rough:.9,rolling:1},
 {world:true,from:[-914,-1148],to:[-1001,-1124],height:1,rough:.65,rolling:1},
 {world:true,from:[-1021,-1110],to:[-1127,-1140],height:2,rough:.9,rolling:1},
 {world:true,from:[-1147,-1166],to:[-1237,-1245],height:2.2,rough:1,rolling:1},
 {world:true,from:[-1263,-1260],to:[-1372,-1322],height:1.5,rough:.8,rolling:1},
 {world:true,from:[-444,-127],to:[-401,-101],height:1.1,rough:.5,rolling:.2,bump:true},
 {from:[-3650,-1600],to:[-3650,-1380],height:6.5,ramp:true},
 {from:[-3070,-660],to:[-2850,-500],height:1,rough:.6,cycles:8},
];
export function compactRoadFeature(x,z){
 const [rawX,rawZ]=uncompactPoint([x,z]);
 let height=0,rough=0,rolling=0,ramp=0,bump=0;
 for(const patch of ROAD_PATCHES){
  const from=patch.world?patch.from:compactPoint(patch.from),to=patch.world?patch.to:compactPoint(patch.to);
  const dx=to[0]-from[0],dz=to[1]-from[1],length=Math.hypot(dx,dz),px=x-from[0],pz=z-from[1];
  const along=(px*dx+pz*dz)/length,across=Math.abs(px*dz-pz*dx)/length;
  const mask=1-smooth(28,64,across),t=along/length;
  const shape=patch.ramp?bell((along+200)/400):bell(t);
  const wave=patch.cycles?Math.sin(Math.PI*t*Math.max(3,Math.round(patch.cycles*.5)))**2:1;
  height+=patch.height*shape*wave*mask;rough=Math.max(rough,(patch.rough||0)*shape*mask);rolling=Math.max(rolling,(patch.rolling||0)*shape*mask);ramp=Math.max(ramp,patch.ramp?shape*mask:0);bump=Math.max(bump,patch.bump?shape*mask:0);
 }
 const desert=smooth(650,1000,-rawX)*(1-smooth(2380,2700,-rawX))*smooth(750,1100,-rawZ);
 rolling=Math.max(rolling,desert*(.45+.4*Math.sin((rawX-rawZ)/220)**2));
 return{height,rough,rolling,ramp,bump};
}
export function compactTerrainHeight(x,z,base){
 const worldX=x,worldZ=z;
 [x,z]=uncompactPoint([x,z]);
 const blend=smooth(500,1050,-worldX)*smooth(600,1100,-worldZ);
 // 짧은 구간에서도 마루·압축의 경사를 읽을 수 있도록 높이와 진입 경사를 함께 조절한다.
 const dunes=43+5*Math.sin((x+1800)/230)+4*Math.cos((z+1700)/245);
 const snow=smooth(2050,2880,-x)*smooth(1690,2200,-z);
 const ridge=64+6*Math.sin((z+2080)/480)+3*Math.sin((x+3100)/380);
 const terrain=dunes+(ridge-dunes)*snow;
 const land=base+(terrain-base)*blend;
 // 절벽 발판 뒤의 낙차를 줄여 공중에서 코너를 맞지 않고 먼저 착지하게 한다.
 const cliffX=compactPoint([-3650,0])[0],cliff=(1-smooth(75,380,Math.abs(worldX-cliffX)))*(1-smooth(-820,-520,worldZ));
 return land+(48-land)*cliff;
}
export const COMPACT_FEATURES=[
 {id:'desert-entry',type:'technical',label:'레드 듄 · 상승 역코너',from:[-780,-850],to:[-925,-1570],recommendedSpeed:80,halfWidth:18,surface:'sand',roughness:.35,rhythm:'reverse',terrainAccent:'desert',advice:'마루 전 감속 · 역방향 드리프트'},
 {id:'dune-bowl',type:'technical',label:'와이드 듄 · 반경이 좁아지는 보울',from:[-925,-1570],to:[-1660,-1576],recommendedSpeed:78,halfWidth:19,surface:'sand',roughness:.4,rhythm:'sweep',terrainAccent:'desert',advice:'넓게 진입 · 안쪽으로 회전'},
 {id:'sand-whoops',type:'technical',label:'샌드 롤러 · 연속 압축과 요철',from:[-1660,-1576],to:[-2250,-2090],recommendedSpeed:87,halfWidth:18,surface:'sand',roughness:.85,rhythm:'compression',terrainAccent:'desert',advice:'마루에서 정렬 · 압축 뒤 역드리프트'},
 {id:'desert-banked-exit',type:'technical',label:'레드 듄 · 설산 진입 크레스트',from:[-2250,-2090],to:[-2500,-2230],recommendedSpeed:80,halfWidth:17,surface:'sand',roughness:.32,rhythm:'crest',terrainAccent:'desert',advice:'마루 너머 설산 · 부스터 보관'},
 {id:'snow-ridge',type:'technical',label:'화이트 리지 · 고개 진입',from:[-2500,-2230],to:[-3100,-2370],recommendedSpeed:80,halfWidth:12,surface:'snow',roughness:.12,rhythm:'crest',terrainAccent:'snow',advice:'능선 끝 · 내리막 헤어핀'},
 {id:'snow-switchbacks',type:'hairpin',label:'설산 · 삼단 내리막 스위치백',from:[-3100,-2370],to:[-3240,-1970],recommendedSpeed:56,halfWidth:10.2,surface:'snow',roughness:.14,rhythm:'reverse',terrainAccent:'snow',advice:'짧게 정렬 · 반대 드리프트'},
 {id:'snow-ice-arch',type:'precision',theme:'ice-tunnel',label:'블루 아이스 게이트',from:[-2850,-1990],to:[-2880,-1750],recommendedSpeed:60,halfWidth:9.6,surface:'snow',roughness:.08,rhythm:'compression',terrainAccent:'snow',advice:'빙문 진입 · 출구 왼쪽'},
 {id:'cliff-boost-gap',type:'gap',label:'노르테유 · 부스터 절벽 도약',from:[-3650,-1600],to:[-3650,-1478],halfWidth:11.5,minSpeed:96,requiresBoost:true,launchSpeed:16,rampHeight:6.5,respawnDelay:1.4,dropDepth:30,advice:'발판 전 부스터 · 착지 후 우회전'},
 {id:'cliff-brake',type:'braking',label:'착지 정렬 · 팩토리 감속',from:[-3650,-1250],to:[-3290,-830],recommendedSpeed:64,advice:'착지 후 감속 · 공장 우회전'},
 {id:'factory-approach',type:'technical',label:'팩토리 · 짧은 정렬과 상층 선택',from:[-3270,-795],to:[-2770,-500],recommendedSpeed:86,halfWidth:11,surface:'asphalt',roughness:.12,rhythm:'reverse',terrainAccent:'factory',advice:'상층은 왼쪽 · 부스터 준비'},
 {id:'sandstone-switch',type:'precision',label:'팩토리 · 더블 에이펙스',from:[-2770,-500],to:[-1960,-500],recommendedSpeed:56,halfWidth:8.6,surface:'asphalt',roughness:.15,rhythm:'reverse',terrainAccent:'factory',advice:'협로 역코너 · 짧게 커팅'},
 {id:'coast-return',type:'technical',label:'하버 리턴 · 피날레 진입',from:[-1730,-430],to:[-1200,-90],recommendedSpeed:77,halfWidth:12.6,surface:'asphalt',roughness:.08,rhythm:'reverse',terrainAccent:'harbour',advice:'좌우 전환 · 마지막 부스터'},
];

// 길이를 늘려 난도를 만드는 대신 사막과 설산의 공간을 함께 압축한다.
export const compactPoint=([x,z])=>[x<-700?-700+(x+700)*.4:x,z<-760?-760+(z+760)*.4:z];
const uncompactPoint=([x,z])=>[x<-700?-700+(x+700)/.4:x,z<-760?-760+(z+760)/.4:z];
for(const p of COMPACT_BLOCKS)[p[0],p[1]]=compactPoint(p);
for(const r of COMPACT_CORNER_RULES)[r.x,r.z]=compactPoint([r.x,r.z]);
for(const f of COMPACT_FEATURES){f.from=compactPoint(f.from);f.to=compactPoint(f.to);}

// 코너 묶음 사이에 남는 연결 선분도 실제 조향과 높낮이로 바꾼다.
// 초고속 터널, 주탑 사이 교량, 공중 발판, 상층 합류선은 직선 보호한다.
export function applyCompactRhythms(planar){
 const placed=[];
 for(let i=0;i<planar.curves.length;i++){
  const line=planar.curves[i];if(!line.isLineCurve3)continue;
  const span=line.getLength(),p=line.getPoint(.5),a=line.getPoint(0),b=line.getPoint(1);
  const [px,pz]=uncompactPoint([p.x,p.z]);
  const sand=px<-760&&px>-2460&&pz<-800;
  const snow=px<-2520&&pz<-1680&&px>-3460;
  const quay=p.x<-100&&p.x>-160&&p.z<-330;
  const coast=(p.x<-180&&p.x>-720&&p.z<-600)||quay;
  // 피날레 원호 사이의 짧은 정렬선은 남겨 반대 드리프트를 바로 연결한다.
  const returnLine=p.x<-815&&p.z>-430;
  if(!(sand||snow||coast||returnLine)||span<45)continue;
  const n=placed.filter(r=>!r.id.startsWith('v13-quay')).length,rhythm=sand?['sweep','reverse','crest','compression'][n%4]:snow?'sweep':n%2?'reverse':'sweep';
  const technical=rhythm==='reverse'||rhythm==='compression';
  const amplitude=Math.min(sand?40:25,span*(technical?.08:.135),span*span*(technical?.00033:.0005));
  const rise=sand?Math.min(9.5,span*.019):snow?-Math.min(4,span*.016):Math.min(3.5,span*.014);
  const spec={id:`v13-${quay?'quay':sand?'dune':snow?'snow':'coast'}-${n+1}`,rhythm,amplitude,rise,polarity:n%2?-1:1,terrainAccent:sand?'desert':snow?'snow':'harbour'};
  planar.curves[i]=new RhythmLine(a,b,spec);
  placed.push({...spec,from:[a.x,a.z],to:[b.x,b.z],baseSpan:span});
 }
 planar.updateArcLengths();return placed;
}
