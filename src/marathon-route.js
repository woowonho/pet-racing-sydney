// 기존 하버 코스의 끝 (-2180,1475)에서 이어지는 단일 풀코스 구간이다.
// 실존 도로의 좌표 복제가 아니라 시드니 외항의 암초·사암·부두를 재해석했다.
// 정확한 총 42,195m 길이와 결승 직선은 city-track에서 곡선 길이로 맞춘다.
export const MARATHON_BLOCKS = [
  // 외항: 열린 가속 → 긴 광 터널 → 파도 같은 큰 S → 점프 → 180도 전환.
  [-1700,1605],[-1200,1700],[-820,1780],[-410,1640],[-30,1680],
  [330,1890],[800,2010],[1230,1880],[1600,2100],[1820,2470],
  [2200,2530],[2490,2310],[2820,2390],[3050,2710],
  [3050,3050],[3146,3050],[3146,2730],[3500,2500],[3920,2610],[4260,2920],
  // 붉은 절벽: 넓은 내리막 아크와 좁은 역방향 커브를 번갈아 배치한다.
  [4440,3240],[4150,3520],[4240,3800],[4680,3920],[4950,4250],
  [4770,4490],[4330,4350],[3900,4430],[3610,4740],[3810,4990],
  [4210,5030],[4410,5300],[4270,5560],[3880,5540],[3530,5810],
  [3230,5610],[3000,5790],[3190,6090],[3040,6370],[2690,6460],
  [2410,6240],[2200,6470],[2290,6820],[2770,6940],[3210,6820],
  [3500,7160],[3400,7500],
  // 북쪽 항만: 낮아지는 해안 → 넓은 추월 구간 → 마지막 정밀 S → 결승.
  [3070,7720],[2650,7610],[2380,7880],[2450,8200],[2920,8420],
  [3350,8220],[3640,8470],[3740,8900],[3510,9180],[3110,9210],
  [2840,8960],[2530,9120],[2350,9470],[2600,9770],[3050,9720],
  [3510,9950],[3950,9870],[4260,10110],[4610,10340],[4620,10690],
  [4400,10810],[4570,11070],[4980,11190],[5290,11460],
];

// cut은 정점 전후의 잘라낼 거리다. circular는 해당 진입·탈출 접선 사이를
// 원호에 가까운 베지어로 잇는다. 96m 왕복은 48m 반지름 두 원호가 이어져
// 완전한 180도를 만들며, 노면끼리는 73m 이상 떨어져 있다.
export const MARATHON_CORNER_RULES = [
  {x:-1700,z:1605,cut:170,style:'circular'},
  {x:-1200,z:1700,cut:180,style:'circular'},
  {x:-820,z:1780,cut:180,style:'circular'},
  {x:-410,z:1640,cut:175,style:'circular'},
  {x:-30,z:1680,cut:175,style:'circular'},
  {x:330,z:1890,cut:190,style:'circular'},
  {x:800,z:2010,cut:195,style:'circular'},
  {x:1600,z:2100,cut:145,style:'circular'},
  {x:1820,z:2470,cut:110,style:'circular'},
  {x:2200,z:2530,cut:60,style:'circular'},
  {x:2490,z:2310,cut:95,style:'quadratic'},
  {x:3050,z:3050,cut:48,style:'circular'},
  {x:3146,z:3050,cut:48,style:'circular'},
  {x:3500,z:2500,cut:160,style:'circular'},
  {x:3920,z:2610,cut:190,style:'circular'},
  {x:4260,z:2920,cut:170,style:'circular'},
  {x:4440,z:3240,cut:135,style:'circular'},
  {x:4150,z:3520,cut:60,style:'quadratic'},
  {x:4240,z:3800,cut:80,style:'quadratic'},
  {x:4680,z:3920,cut:170,style:'circular'},
  {x:4950,z:4250,cut:140,style:'circular'},
  {x:4770,z:4490,cut:75,style:'quadratic'},
  {x:3900,z:4430,cut:175,style:'circular'},
  {x:3610,z:4740,cut:120,style:'circular'},
  {x:3810,z:4990,cut:95,style:'quadratic'},
  {x:4210,z:5030,cut:85,style:'circular'},
  {x:4410,z:5300,cut:90,style:'circular'},
  {x:4270,z:5560,cut:65,style:'quadratic'},
  {x:3880,z:5540,cut:105,style:'circular'},
  {x:3530,z:5810,cut:65,style:'quadratic'},
  {x:3230,z:5610,cut:85,style:'circular'},
  {x:3000,z:5790,cut:90,style:'circular'},
  {x:3190,z:6090,cut:80,style:'quadratic'},
  {x:3040,z:6370,cut:135,style:'circular'},
  {x:2690,z:6460,cut:105,style:'circular'},
  {x:2410,z:6240,cut:80,style:'quadratic'},
  {x:2200,z:6470,cut:115,style:'circular'},
  {x:2290,z:6820,cut:165,style:'circular'},
  {x:2770,z:6940,cut:175,style:'circular'},
  {x:3210,z:6820,cut:165,style:'circular'},
  {x:3500,z:7160,cut:145,style:'circular'},
  {x:3400,z:7500,cut:135,style:'circular'},
  {x:3070,z:7720,cut:155,style:'circular'},
  {x:2650,z:7610,cut:100,style:'quadratic'},
  {x:2380,z:7880,cut:90,style:'circular'},
  {x:2450,z:8200,cut:140,style:'circular'},
  {x:2920,z:8420,cut:205,style:'circular'},
  {x:3350,z:8220,cut:145,style:'circular'},
  {x:3640,z:8470,cut:155,style:'circular'},
  {x:3740,z:8900,cut:100,style:'circular'},
  {x:3510,z:9180,cut:115,style:'circular'},
  {x:3110,z:9210,cut:90,style:'quadratic'},
  {x:2840,z:8960,cut:80,style:'circular'},
  {x:2530,z:9120,cut:100,style:'circular'},
  {x:2350,z:9470,cut:130,style:'circular'},
  {x:2600,z:9770,cut:150,style:'circular'},
  {x:3050,z:9720,cut:180,style:'circular'},
  {x:3510,z:9950,cut:180,style:'circular'},
  {x:3950,z:9870,cut:145,style:'circular'},
  {x:4260,z:10110,cut:170,style:'circular'},
  {x:4610,z:10340,cut:135,style:'circular'},
  {x:4620,z:10690,cut:95,style:'quadratic'},
  {x:4400,z:10810,cut:70,style:'circular'},
  {x:4570,z:11070,cut:110,style:'circular'},
  {x:4980,z:11190,cut:170,style:'circular'},
];

// from/to는 거리표를 만드는 기준 좌표다. 표지판·점프·폭·AI는 변환한
// 공통 거리표를 사용해야 시각적 장치와 실제 주행 구간이 갈라지지 않는다.
export const MARATHON_FEATURES = [
  {id:'reef-arrival',type:'speed',label:'외항 리프 코스트',from:[-1700,1605],to:[-1260,1689],recommendedSpeed:106},
  {id:'reef-tunnel',type:'tunnel',label:'아쿠아 글래스 익스프레스',from:[-1120,1717],to:[728,1992],recommendedSpeed:106,speedSection:true,theme:'reef-glass',openRoofSections:true},
  {id:'reef-tunnel-brake',type:'braking',label:'리프 터널 출구 · 큰 S 준비',from:[960,1962],to:[1410,1987],recommendedSpeed:72},
  {id:'reef-sweep',type:'technical',label:'리프 와이드 스윕',from:[1490,2035],to:[1790,2420],recommendedSpeed:75},
  {id:'reef-flight',type:'jump',label:'리프 스카이 플라이트',from:[1960,2492],to:[2070,2510],minSpeed:50,launchSpeed:12.5,rampHeight:6.5},
  {id:'reef-hook-entry',type:'braking',label:'리프 헤어핀 · 180° 예고',from:[2890,2487],to:[3050,2840],recommendedSpeed:52},
  {id:'reef-hairpin',type:'hairpin',label:'리프 180° 턴어라운드',from:[3050,2880],to:[3146,2840],recommendedSpeed:52,direction:-1},
  {id:'redcliff-descent',type:'technical',label:'레드 클리프 대회전 다운힐',from:[3490,2507],to:[4415,3196],recommendedSpeed:84},
  {id:'redcliff-needle',type:'precision',label:'팩토리 진입 니들 S',from:[4370,3308],to:[4290,3814],recommendedSpeed:55,halfWidth:8.6},
  {id:'redcliff-open',type:'technical',label:'야외 정비 데크 커브',from:[4470,3863],to:[4890,4330],recommendedSpeed:76},
  {id:'redcliff-reverse',type:'chicane',label:'배관동 리버스 커브',from:[4795,4457],to:[3840,4494],recommendedSpeed:64},
  {id:'redcliff-flight',type:'jump',label:'캐니언 갭 플라이트',from:[3950,5004],to:[4050,5014],minSpeed:49,launchSpeed:12,rampHeight:6},
  {id:'redcliff-compression',type:'precision',label:'제련동 협로 컴프레션',from:[4320,5412],to:[3060,5743],recommendedSpeed:53,halfWidth:8.5},
  {id:'redcliff-stagger',type:'chicane',label:'세 반경 스태거 S',from:[3100,5948],to:[2260,6404],recommendedSpeed:58},
  {id:'redcliff-recovery',type:'speed',label:'클리프 리커버리 런',from:[2350,6835],to:[3100,6850],recommendedSpeed:102},
  {id:'north-coast-descent',type:'technical',label:'노스 헤드 해안 다운힐',from:[3270,6890],to:[2830,7657],recommendedSpeed:72},
  {id:'north-port-switch',type:'chicane',label:'설벽 리버스 커브',from:[2700,7623],to:[2440,8154],recommendedSpeed:60},
  {id:'north-port-sweep',type:'technical',label:'화이트 리지 연속 드리프트',from:[2530,8237],to:[3350,8220],recommendedSpeed:85},
  {id:'north-port-flight',type:'jump',label:'설산 절벽 플라이트',from:[3680,8642],to:[3708,8762],minSpeed:51,launchSpeed:11.5,rampHeight:5.7},
  {id:'north-port-hook',type:'technical',label:'천공 도크 더블 훅',from:[3600,9070],to:[2460,9256],recommendedSpeed:61},
  {id:'north-port-breath',type:'speed',label:'스카이 데크 워터프런트',from:[2630,9767],to:[4170,10040],recommendedSpeed:105},
  {id:'north-port-last-s',type:'precision',label:'파이널 크레인 S',from:[4620,10450],to:[4630,11088],recommendedSpeed:58,halfWidth:9.1},
].map(feature => ({...feature, id:`marathon-${feature.id}`}));

export const MARATHON_ZONES = [
  {id:'outer-reef',type:'reef',label:'외항 암초',labelPosition:[1840,2210],center:[1100,2300],bounds:[-2180,4520,1475,3320],color:'#a99c79',accent:'#6fd5df',from:[-1700,1605],to:[4440,3240],terrain:'낮은 사암 섬·넓은 수면·옅은 암초. 길 바깥 70m부터 지형을 낮춰 물이 보이게 한다.',landmarks:[{type:'lighthouse',x:2570,z:2810},{type:'rock-islands',x:1400,z:2330}]},
  {id:'red-cliffs',type:'factory',label:'캐니언 팩토리',labelPosition:[4150,5440],center:[3500,5400],bounds:[2000,5200,3180,7650],color:'#677675',groundColor:'#526d62',accent:'#e3bd78',from:[4440,3240],to:[3400,7500],terrain:'붉은 절벽 위 제련 공장. 낮은 배관 천장과 벽 사이를 빠져나오면 수면 위 열린 데크가 나온다.',landmarks:[{type:'sandstone-spires',x:4070,z:4740},{type:'sandstone-spires',x:2590,z:5770}]},
  {id:'snow-ridge',type:'snow',label:'화이트 리지 설산',labelPosition:[3050,8040],center:[3150,8130],bounds:[2180,3890,7410,9060],color:'#b9d1de',groundColor:'#e2edf1',accent:'#effaff',from:[3400,7500],to:[3740,8900],terrain:'흰 설벽과 얼음 아치 사이를 통과한 뒤 열린 절벽 갭으로 도약한다.',landmarks:[]},
  {id:'north-harbour',type:'sky',label:'천공 항만 피날레',labelPosition:[3220,9950],center:[3600,10150],bounds:[2180,5500,8820,11750],color:'#5a7286',groundColor:'#718596',accent:'#edc773',from:[3740,8900],to:[5290,11460],terrain:'물 위로 드러난 강철 플랫폼·상층 분기·마지막 부스터 갭이 결승까지 이어진다.',landmarks:[{type:'container-cranes',x:3110,z:8750},{type:'lighthouse',x:4170,z:9560}]},
].map(zone => ({...zone, start:zone.from, end:zone.to}));

const smooth = (a, b, value) => {const t = Math.max(0, Math.min(1, (value - a) / (b - a))); return t * t * (3 - 2 * t);};
const mix = (a, b, t) => a + (b - a) * t;

// 새 구역 도로와 배경이 함께 읽을 수 있는 완만한 높이장이다. baseHeight는
// 기존 지형 높이이며, 기존 도로(z≤1475)는 건드리지 않고 첫 500m에서 섞는다.
export function marathonTerrainHeight(x, z, baseHeight = 0) {
  const reef = 25 + 10 * Math.sin((x + 500) / 1100) + 7 * Math.sin((z - 1500) / 530);
  const cliff = 72 + 27 * Math.sin((z - 3000) / 710) + 14 * Math.sin((x - 3500) / 510);
  const harbour = 26 + 9 * Math.sin((z - 7600) / 900) + 5 * Math.sin(x / 720);
  const height = mix(mix(reef, cliff, smooth(2850, 3800, z)), harbour, smooth(7000, 8050, z));
  return mix(baseHeight, height, smooth(1475, 1975, z));
}

// 마지막 점 이후 북동쪽은 비어 있다. 곡선 실측 후 이 접선으로 결승을
// 연장해 총길이를 맞추며, 같은 코스의 짧은 변형이나 추가 랩을 만들지 않는다.
export const MARATHON_FINISH_RAY = {origin:[5290,11460],direction:[310,270],clearDistance:5000};

// V9의 기술 코너는 같은 반경의 긴 원호 대신 진입·역조향·탈출을 짧게 잇는다.
// 전체 길이를 유지할 여유는 직선 사이의 공간에서 확보하며 코너 절삭 길이는
// 미터 단위로 보존해 좌표 압축 때문에 코너가 다시 완만해지지 않게 한다.
const technicalScale=.96,joinOrigin=[-2180,1475];
export const marathonPoint=([x,z])=>[joinOrigin[0]+(x-joinOrigin[0])*technicalScale,joinOrigin[1]+(z-joinOrigin[1])*technicalScale];
const rhythmEnds=new Set(['1230,1880','3500,2500','4260,2920','4330,4350','3900,4430','2770,6940','3070,7720','2920,8420','3110,9210','3510,9950','4260,10110','4980,11190','5290,11460']);
const denseBlocks=[],rhythms=[];let previous=joinOrigin;
for(const current of MARATHON_BLOCKS){
  const dx=current[0]-previous[0],dz=current[1]-previous[1],length=Math.hypot(dx,dz),right=[-dz/length,dx/length];
  if(rhythmEnds.has(current.join(','))&&length>350){
    const from=previous.map((v,i)=>v+(current[i]-v)*.06),to=previous.map((v,i)=>v+(current[i]-v)*.94);
    for(const [fraction,offset] of[[.22,28],[.43,-28],[.64,28],[.82,0]]){
      const point=previous.map((v,i)=>v+(current[i]-v)*fraction+right[i]*offset);denseBlocks.push(point);
      MARATHON_CORNER_RULES.push({x:point[0],z:point[1],cut:42,style:'quadratic',rhythm:true});
    }
    rhythms.push({id:`marathon-chain-${rhythms.length+1}`,type:'chicane',label:current[1]<3200?'리프 연속 커팅':current[1]<7200?'팩토리 트리플 커브':current[1]<9900?'설산 리버스 드리프트':'천공 파이널 연속 드리프트',from,to,recommendedSpeed:52,halfWidth:8.1});
  }
  denseBlocks.push(current);previous=current;
}
const preservedCorners=new Set(['1820,2470','2200,2530','3050,3050','3146,3050','3810,4990','4210,5030','3740,8900']);
for(const rule of MARATHON_CORNER_RULES){
  const tunnelApproach=rule.z<=2010&&rule.x<=800;
  if(!tunnelApproach&&!preservedCorners.has(`${rule.x},${rule.z}`)&&!rule.rhythm){rule.cut=Math.min(rule.cut,rule.z>3200?62:72);rule.style='quadratic';}
  [rule.x,rule.z]=marathonPoint([rule.x,rule.z]);
}
MARATHON_BLOCKS.splice(0,MARATHON_BLOCKS.length,...denseBlocks.map(marathonPoint));
for(const feature of [...MARATHON_FEATURES,...rhythms]){feature.from=marathonPoint(feature.from);feature.to=marathonPoint(feature.to);}
MARATHON_FEATURES.push(...rhythms);
for(const zone of MARATHON_ZONES){
  zone.from=marathonPoint(zone.from);zone.to=marathonPoint(zone.to);zone.start=zone.from;zone.end=zone.to;zone.center=marathonPoint(zone.center);zone.labelPosition=marathonPoint(zone.labelPosition);
  const a=marathonPoint([zone.bounds[0],zone.bounds[2]]),b=marathonPoint([zone.bounds[1],zone.bounds[3]]);zone.bounds=[a[0],b[0],a[1],b[1]];
  for(const landmark of zone.landmarks)[landmark.x,landmark.z]=marathonPoint([landmark.x,landmark.z]);
}
MARATHON_FINISH_RAY.origin=marathonPoint(MARATHON_FINISH_RAY.origin);
