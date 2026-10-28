import * as THREE from '../vendor/three.module.js';
import {sydneyTerrainHeight} from './city-track.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),UP=V(0,1,0);
const random=n=>{const v=Math.sin(n*127.1+311.7)*43758.5453;return v-Math.floor(v);};
const THEME_RADIUS={headland:22,quay:12,reef:26,desert:30,factory:18,snow:28,sky:16};

// 장식 전체의 외곽까지 본선과 상층에서 떨어뜨린다. 가까운 다른 코너와
// 고가 지름길도 같은 격자로 검사하므로 새 코너가 생겨도 바위가 길을 막지 않는다.
export function createLandscapePlan(world){
  const grid=new Map(),cell=80,step=6,features=world.features||world.curve.features;
  const insert=(p,width)=>{const key=`${Math.floor(p.x/cell)},${Math.floor(p.z/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push({p,width});};
  for(let d=0;d<=world.length;d+=step)insert(world.frameAt(d).p,world.roadHalfWidthAt(d));
  insert(world.frameAt(world.length).p,world.roadHalfWidthAt(world.length));
  for(const route of world.routes||[])for(let d=route.start;d<=route.end;d+=step)insert(route.frameAt(d).p,route.halfWidth);
  const clearance=(x,z,radius)=>{
    const gx=Math.floor(x/cell),gz=Math.floor(z/cell),reach=Math.ceil((radius+32)/cell);let gap=Infinity;
    for(let dz=-reach;dz<=reach;dz++)for(let dx=-reach;dx<=reach;dx++)for(const {p,width} of grid.get(`${gx+dx},${gz+dz}`)||[])gap=Math.min(gap,Math.hypot(p.x-x,p.z-z)-width-radius-step/2);
    return gap;
  };
  const plan=[],distances=[];
  for(let d=420;d<world.length-150;d+=112)distances.push(d);
  // 짧아진 절벽에서도 도약 전·후의 사암을 남긴다. 일정 거리 표본만
  // 쓰면 구역 전체가 도약 안전 여백에 걸려 풍경 테마가 사라질 수 있다.
  for(const zone of world.curve.courseZones||[])if(zone.type==='cliff')for(const d of[zone.start+28,zone.end-28])if(!distances.some(at=>Math.abs(at-d)<24))distances.push(d);
  distances.sort((a,b)=>a-b);
  for(const [index,d] of distances.entries()){
    if(features.some(f=>['gap','jump'].includes(f.type)&&d>f.start-110&&d<f.end+90))continue;
    const frame=world.frameAt(d),zone=(world.curve.courseZones||world.curve.marathonZones||[]).find(z=>d>=z.start&&d<z.end);
    const accent=features.find(f=>(f.v10||f.v11)&&d>=f.start&&d<f.end)?.terrainAccent;
    const surface=world.curve.surfaceAt?.(d)?.surface;
    const rawTheme=surface==='sand'?'desert':accent==='sandstone'?'reef':accent||zone?.type||(d<3100?'quay':'headland');
    const theme=rawTheme==='harbour'||rawTheme==='coast'?(frame.p.x>-700?'quay':'headland'):rawTheme==='garden'?'headland':rawTheme==='cliff'?'reef':rawTheme;
    const radius=THEME_RADIUS[theme]||22,side=index%2?1:-1;
    // 하버브리지와 오페라하우스의 원래 실루엣은 비워 둔다.
    if(frame.p.x>-115&&frame.p.x<145&&frame.p.z>-100&&frame.p.z<625)continue;
    if(Math.hypot(frame.p.x-320,frame.p.z-108)<235)continue;
    for(const extra of[0,20,43]){
      const offset=side*(world.roadHalfWidthAt(d)+radius+10+extra),p=frame.p.clone().addScaledVector(frame.right,offset),gap=clearance(p.x,p.z,radius);
      if(gap<6)continue;
      const grounded=theme==='headland'||theme==='quay';
      // 도로를 받치는 제방 바깥 지면에 묻혀 세운다. 해안 암초·시설은
      // 수면 아래 기초부터 모델링하므로 수직 단면이 실제로 드러난다.
      const ground=theme==='desert'&&world.desertField?world.desertField.heightAt(p.x,p.z):d<(world.curve.marathonStart??world.length)&&world.sceneryGroundHeight?world.sceneryGroundHeight(p.x,p.z):grounded?Math.max(-.38,Math.min(sydneyTerrainHeight(p.x,p.z)-1.2,frame.p.y-1.1)):frame.p.y-1.1;
      plan.push({id:`landscape-${index}`,theme,d,side,x:p.x,z:p.z,y:ground,yaw:Math.atan2(frame.tangent.x,frame.tangent.z),radius,minimumRoadGap:gap,variant:index%5,seed:index});break;
    }
  }
  // 먼 사암 곶은 민둥산으로 남기지 않는다. 넓은 숲 덩어리와 노두를
  // 도로에서 150m 이상 물린 실제 지면 위에 드문드문 놓아 원경 크기를 읽힌다.
  for(let d=5200,index=0;d<Math.min(world.curve.marathonStart,14800);d+=640,index++)for(const side of[-1,1]){
    if(world.curve.surfaceAt?.(d)?.surface==='sand')continue;
    const frame=world.frameAt(d),p=frame.p.clone().addScaledVector(frame.right,side*(170+random(index+side)*60));
    if(p.x>-1000||world.sceneryIsLand&&!world.sceneryIsLand(p.x,p.z))continue;
    const radius=32,gap=clearance(p.x,p.z,radius),y=world.sceneryGroundHeight?.(p.x,p.z)??sydneyTerrainHeight(p.x,p.z)-1.2;
    if(gap<28||y<8)continue;
    plan.push({id:`headland-grove-${index}-${side}`,theme:'headland',background:true,d,side,x:p.x,z:p.z,y,yaw:index*2.399,radius,minimumRoadGap:gap,variant:index%5,seed:500+index});
  }
  return plan;
}

// 수십 가지 도장 색을 정점에 넣어 모든 지역 소품이 같은 재질 하나를 쓴다.
// 개별 볼트·풀·배관을 객체로 남기지 않고 512m 공간 묶음으로 컬링한다.
class Model {
  constructor(shapes){this.shapes=shapes;this.positions=[];this.normals=[];this.colors=[];}
  add(shape,color,position,scale=[1,1,1],q=new THREE.Quaternion()){
    const geometry=this.shapes[shape],matrix=new THREE.Matrix4().compose(V(...position),q,V(...scale)),normalMatrix=new THREE.Matrix3().getNormalMatrix(matrix),tint=new THREE.Color(color),p=V(0,0,0),n=V(0,0,0);
    const positions=geometry.getAttribute('position'),normals=geometry.getAttribute('normal'),count=geometry.index?.count||positions.count;
    for(let i=0;i<count;i++){const j=geometry.index?geometry.index.getX(i):i;p.fromBufferAttribute(positions,j).applyMatrix4(matrix);n.fromBufferAttribute(normals,j).applyNormalMatrix(normalMatrix);this.positions.push(p.x,p.y,p.z);this.normals.push(n.x,n.y,n.z);this.colors.push(tint.r,tint.g,tint.b);}
  }
  box(color,x,y,z,w,h,d,yaw=0){this.add('box',color,[x,y,z],[w,h,d],new THREE.Quaternion().setFromAxisAngle(UP,yaw));}
  beam(color,a,b,width=.2){const v=b.clone().sub(a);this.add('cylinder',color,a.clone().add(b).multiplyScalar(.5).toArray(),[width,v.length(),width],new THREE.Quaternion().setFromUnitVectors(UP,v.normalize()));}
  rock(color,x,y,z,w,h,d,yaw=0){this.add('rock',color,[x,y,z],[w,h,d],new THREE.Quaternion().setFromAxisAngle(UP,yaw));}
  geometry(){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(this.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(this.normals,3));g.setAttribute('color',new THREE.Float32BufferAttribute(this.colors,3));g.computeBoundingSphere();return g;}
}

function plants(model,seed,snow=false){
  for(let i=0;i<4;i++){
    const angle=i*2.399+seed,x=Math.sin(angle)*(4+i),z=Math.cos(angle)*(4+i),h=5+random(seed+i)*4;
    model.add('cylinder','#615c48',[x,h*.32,z],[.21,h*.64,.21]);
    if(snow){for(let j=0;j<3;j++){model.add('cone','#456c6b',[x,h*(.46+j*.18),z],[2.5-j*.5,h*.65,2.5-j*.5]);model.add('cone','#e9f4f2',[x,h*(.56+j*.18),z],[1.7-j*.35,h*.35,1.7-j*.35]);}}
    else for(let j=0;j<3;j++){const a=j*2.4;model.rock(j%2?'#78925a':'#477659',x+Math.cos(a)*1.4,h*.73+j*.55,z+Math.sin(a)*1.4,2.4,2.3,2.1,a);}
  }
  for(let i=0;i<8;i++){const a=i*2.399,r=9+random(i+seed)*7;model.rock(snow?'#e2eff0':i%2?'#68854e':'#899c62',Math.cos(a)*r,.3,Math.sin(a)*r,2.4,.7,1.8,a);}
}

function headland(model,node){
  // 반들반들한 잔디판 위에 풀색 덩어리를 얹는 대신 흙 단면·낮은 암반·
  // 관목·유칼립투스를 서로 다른 높이로 묶어 능선과 빈 공간을 만든다.
  model.rock('#ae9069',0,-2,0,21,4.2,17,node.seed);
  model.rock('#7f8b58',0,-.5,0,19,1.2,15,node.seed);
  for(let i=0;i<4;i++)model.rock(i%2?'#c5af86':'#8d8061',-12+i*7,-.1,9+(i%2)*2,4.6,2.1+i%2,3.1,node.seed+i);
  plants(model,node.seed);
  if(node.background)for(let i=0;i<4;i++){
    const a=i*2.399,x=Math.cos(a)*(16+i),z=Math.sin(a)*(16+i),h=8+random(i+node.seed)*6;
    model.add('cylinder','#6d6854',[x,h*.35,z],[.3,h*.7,.3]);
    model.rock(i%2?'#6b824e':'#536e50',x,h*.74,z,3.8,4,3.4,a);
    if(i%2===0)model.rock('#b9a185',x*.8,1.2,z*.8,4.6,3,3.7,a);
  }
  if(node.variant===0){model.box('#cbb78c',0,.2,-9,8,.35,5);model.box('#77664d',0,1,-9,4,.2,1.2);for(const x of[-1.5,1.5])model.box('#475357',x,.6,-9,.18,.8,.8);}
}

function quay(model,node){
  const depth=Math.max(4,node.y+10),base=-depth/2;
  model.box('#a38a6f',0,base,0,17,depth,14);model.box('#d3bd98',0,.12,0,18,.25,15);
  // 옥외 노점은 얇은 줄무늬 차양, 상자와 스툴로 사람 크기가 읽힌다.
  model.box('#9a714e',0,1,1,6,2,2.5);model.box('#d4b887',0,2.1,1,6.5,.18,3);
  for(const x of[-3,3])model.beam('#5d6c65',V(x,0,1),V(x,4.3,1),.09);
  for(let i=0;i<6;i++)model.box(i%2?'#f0dec0':node.variant%2?'#d5805b':'#639a93',-2.5+i,4,1,1,.2,5);
  for(const x of[-5,5])model.box('#725a48',x,.6,3,1.8,1.2,1.8);
  const sx=-7;model.beam('#526770',V(sx,0,-3),V(sx,7,-3),.11);model.beam('#526770',V(sx,6.9,-3),V(sx+2,6.9,-3),.09);model.box('#fff0bd',sx+1.5,6.7,-3,1.6,.24,.6);
  for(const x of[-6,6]){model.add('cylinder','#856448',[x,.5,-5],[1,1,1]);model.rock('#517e57',x,1.4,-5,1.7,1.2,1.7);}
}

function reef(model,node){
  const depth=node.y+10,top=3+node.variant*1.3;
  model.rock('#a38b6f',0,-depth*.45,0,24,depth*.55+top,19,node.seed);
  model.rock('#c7ac81',2,top-1,-1,18,3.5,16,node.seed);
  model.rock('#849467',1,top+1.3,-2,13,.8,10,node.seed);
  // 해수면 가까운 암초와 잘게 부서진 파도 무늬는 코스 높이와 속도를 드러낸다.
  for(let i=0;i<7;i++){
    const a=i/7*Math.PI*2,x=Math.cos(a)*20,z=Math.sin(a)*19;
    model.rock(i%2?'#8c8571':'#c5b390',x,-depth+1.2,z,3.4,2,2.8,a);
    model.box('#ceeae1',x*1.06,-depth+.16,z*1.07,4.4,.06,.8,-a);
  }
  if(node.variant%2===0){model.add('cylinder','#f1e6c7',[0,top+4,-1],[.4,6,.4]);model.box('#cc7653',1,top+5,-1,2,1.4,.1);}
}

function factory(model,node){
  const depth=node.y+10;
  model.box('#758680',0,-1.3,0,26,2.6,22);
  for(const x of[-10,10])for(const z of[-8,8])model.box('#52656a',x,-depth/2,z,1.8,depth,1.8);
  model.box('#c9ad69',0,.1,-10,26,.15,.5);
  for(let i=0;i<9;i++)model.box('#34484d',-12+i*3,.21,-10,1,.08,.52,.6);
  model.box('#78968a',-5,3.6,1,10,7.2,12);model.box('#394e54',-5,7.4,1,11,.6,13);
  model.box('#294653',-5,4,-5.06,7,2,.1);for(const x of[-7,-3])model.box('#c0c7b1',x,4,-5.13,.16,2,.1);
  model.add('cylinder','#bdbea5',[6,4,3],[3,8,3]);model.add('cone','#7e9792',[6,8.5,3],[3.1,1.2,3.1]);
  for(const y of[1,3.2,6.7])model.add('cylinder','#647b7c',[6,y,3],[3.08,.18,3.08]);
  model.beam('#b87b53',V(-5,9,1),V(6,9,1),.6);model.beam('#b87b53',V(6,9,1),V(6,6,1),.6);
  for(let i=0;i<3;i++){model.box('#b48757',6,.65,-6+i*2,3,1.3,1.6);model.box('#ded0a3',6,1.35,-6+i*2,3.2,.15,1.8);}
  model.beam('#c4cfbd',V(-10,0,-8),V(-10,12,-8),.13);model.box('#ffe0a4',-10,11.5,-8,1,.5,.6);
}

function snowRidge(model,node){
  const depth=node.y+10;
  model.rock('#8195a0',0,-depth*.45,0,26,depth*.58,22,node.seed);
  const peaks=[[-10,0,17],[4,-6,24],[13,8,13]];
  for(const [x,z,h]of peaks){model.add('ridge','#86aabe',[x,h*.36,z],[12,h,10],new THREE.Quaternion().setFromAxisAngle(UP,node.seed+x));model.add('ridge','#e8f2f2',[x,h*.61,z],[8.7,h*.58,7.3],new THREE.Quaternion().setFromAxisAngle(UP,node.seed+x));}
  if(node.variant===0)plants(model,node.seed,true);
}

function skyDock(model,node){
  const depth=node.y+10;
  model.box('#567583',0,-.8,0,20,1.6,18);model.box('#9baca7',0,.1,0,20,.15,18);
  for(const x of[-8,8])for(const z of[-7,7])model.box('#395866',x,-depth/2,z,1.3,depth,1.3);
  for(const z of[-7,7]){model.beam('#7d989b',V(-8,-2,z),V(8,-depth+2,z),.4);model.beam('#7d989b',V(8,-2,z),V(-8,-depth+2,z),.4);}
  // 가느다란 크레인의 전체 외곽은 안전 반경 안에 남아 상층을 가리지 않는다.
  model.box('#d2bd82',-5,5,2,3,10,3);model.beam('#d2bd82',V(-5,10,2),V(8,14,2),.65);model.beam('#7b969a',V(-5,14,2),V(8,14,2),.3);model.beam('#3c5964',V(8,14,2),V(8,5,2),.08);
  model.box('#cb795a',5,1.6,0,6,3.2,9);model.box('#e1d2a8',5,3.3,0,6,.15,9);
  for(let z=-3;z<=3;z+=1.5)model.box('#6b6359',8.05,1.7,z,.08,2.8,.15);
  model.beam('#e5e8ce',V(-8,0,-7),V(-8,13,-7),.14);model.box('#f2b974',-8,12.4,-7,1.1,.8,.7);
}

function desert(model,node){
  // 사구를 가리는 높은 벽 대신 낮은 사암 테이블과 부서진 자갈, 마른
  // 관목을 띄엄띄엄 묶어 넓은 모래길의 폭과 다음 둔덕을 계속 보인다.
  if(node.variant===0||node.variant===3){
    const yaw=node.seed*.47;
    model.rock('#ad8057',0,2.8,2,24,6.5,19,yaw);
    model.rock('#b78d60',-2,7.3,1,17,6,14,yaw);
    model.rock('#d0aa72',-3,11.2,0,13,2.1,11,yaw);
    model.rock('#e0c08c',-3,12.6,0,11.5,.7,9.4,yaw);
    for(let i=0;i<5;i++)model.rock(i%2?'#ad885f':'#c6a273',-17+i*8,.9,13-i%2*3,3.5,2,2.7,i);
  }else{
    for(let i=0;i<6;i++){
      const a=i*2.399+node.seed,r=5+i*2.2,x=Math.cos(a)*r,z=Math.sin(a)*r;
      model.rock(i%2?'#c6a574':'#b18a5b',x,.7,z,2.7,1.2,2.1,a);
      model.rock(i%2?'#8d9060':'#a4a276',x+3,1,z-1,2.1,1.2,1.8,a);
      for(let blade=0;blade<3;blade++)model.beam('#a99c6c',V(x+3,0,z-1),V(x+3+Math.sin(blade*2.1)*.9,1.7,z-1+Math.cos(blade*2.1)*.9),.045);
    }
  }
  if(node.variant===2){
    for(const x of[-4,4])model.box('#8b6c47',x,2,-8,.3,4,.3,.09);
    model.box('#c4b082',0,2.9,-8,9,.18,.28);model.box('#c4b082',0,1.9,-8,9,.18,.28);
    model.box('#b58c59',-6,.6,-8,1.8,1.2,1.8);
  }
}

const builders={headland,quay,reef,desert,factory,snow:snowRidge,sky:skyDock};

export function buildCourseLandscape(world,Batch){
  const plan=createLandscapePlan(world),batch=new Batch(world.scene),shapes={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,7),cone:new THREE.ConeGeometry(1,1,7),ridge:new THREE.ConeGeometry(1,1,5),rock:new THREE.IcosahedronGeometry(1,0)};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:.06});material.userData.noShadow=true;
  const stats={landscapeClusters:0,landscapeTriangles:0,landscapeThemes:{},minimumLandscapeRoadGap:Infinity};
  for(const node of plan){
    const model=new Model(shapes);(builders[node.theme]||headland)(model,node);const geometry=model.geometry();
    // 모델 확장 때 안전 반경을 벗어난 조각이 생기면 그대로 배치하지 않는다.
    const positions=geometry.getAttribute('position');let radius=0;
    for(let i=0;i<positions.count;i++)radius=Math.max(radius,Math.hypot(positions.getX(i),positions.getZ(i)));
    if(radius>node.radius+.01){geometry.dispose();continue;}
    batch.add(geometry,material,[node.x,node.y,node.z],[1,1,1],new THREE.Quaternion().setFromAxisAngle(UP,node.yaw));geometry.dispose();
    stats.landscapeClusters++;stats.landscapeTriangles+=positions.count/3;stats.landscapeThemes[node.theme]=(stats.landscapeThemes[node.theme]||0)+1;stats.minimumLandscapeRoadGap=Math.min(stats.minimumLandscapeRoadGap,node.minimumRoadGap);
  }
  batch.finish();for(const shape of Object.values(shapes))shape.dispose();
  world.landscapePlan=plan;world.sceneryStats??={};Object.assign(world.sceneryStats,stats);return stats;
}
