import * as THREE from '../vendor/three.module.js';
import {sydneyTerrainHeight} from './city-track.js';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
const UP = V(0, 1, 0);

// 구역마다 다른 실루엣을 단일 정점 색상 메시로 만든다. 멀리 있는 장식은
// 월드의 1.4km 거리 컬링에 참여하며 텍스처·광원·그림자 맵은 추가하지 않는다.
class LandmarkBatch {
  constructor(shapes) {this.shapes = shapes; this.positions = []; this.normals = []; this.colors = [];}
  add(shape, color, position, scale = [1, 1, 1], quaternion = new THREE.Quaternion()) {
    const geometry = typeof shape === 'string' ? this.shapes[shape] : shape;
    const matrix = new THREE.Matrix4().compose(V(...position), quaternion, V(...scale));
    const normalMatrix = new THREE.Matrix3().getNormalMatrix(matrix), tint = new THREE.Color(color);
    const positions = geometry.getAttribute('position'), normals = geometry.getAttribute('normal');
    const p = V(0, 0, 0), n = V(0, 0, 0);
    const count = geometry.index ? geometry.index.count : positions.count;
    for (let i = 0; i < count; i++) {
      const index = geometry.index ? geometry.index.getX(i) : i;
      p.fromBufferAttribute(positions, index).applyMatrix4(matrix);
      n.fromBufferAttribute(normals, index).applyNormalMatrix(normalMatrix);
      this.positions.push(p.x, p.y, p.z); this.normals.push(n.x, n.y, n.z);
      this.colors.push(tint.r, tint.g, tint.b);
    }
  }
  box(color, x, y, z, width, height, depth) {this.add('box', color, [x, y, z], [width, height, depth]);}
  beam(color, a, b, width = 1) {
    const delta = b.clone().sub(a);
    this.add('box', color, a.clone().add(b).multiplyScalar(.5).toArray(), [width, delta.length(), width], new THREE.Quaternion().setFromUnitVectors(UP, delta.normalize()));
  }
  geometry() {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(this.positions, 3));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(this.normals, 3));
    geometry.setAttribute('color', new THREE.Float32BufferAttribute(this.colors, 3));
    geometry.computeBoundingBox(); geometry.computeBoundingSphere();
    return geometry;
  }
}

function reefArch(batch) {
  // 해수면까지 내려간 양쪽 암반 사이로 바다가 보이는 자연 아치다.
  const path = new THREE.CatmullRomCurve3([V(-66,-12,0),V(-59,10,3),V(-38,47,-2),V(0,62,-5),V(39,49,3),V(60,15,0),V(66,-12,0)]);
  const arch = new THREE.TubeGeometry(path, 26, 10, 7, false);
  batch.add(arch, '#c7ac7e', [0,0,0]); arch.dispose();
  for (const side of [-1,1]) {
    batch.add('rock', '#a88d69', [side*64,-2,0], [24,23,25]);
    batch.add('rock', '#d9c195', [side*57,18,4], [18,24,18]);
    batch.add('rock', '#bb9c72', [side*40,44,-1], [19,13,16]);
  }
  for (let i=0;i<9;i++) {
    const side=i%2?-1:1,x=side*(66+i%3*9),z=-16+i*4;
    batch.add('rock', i%2?'#927d66':'#c3ab85', [x,-9+i%3,z], [12+i%4,7+i%2,9+i%3]);
  }
  // 물가의 어두운 띠와 낮은 풀로 암반 두께와 파도의 높이를 드러낸다.
  batch.add('rock', '#698775', [-66,17,0], [15,2.5,17]);
  batch.add('rock', '#6c866b', [64,17,3], [13,2,15]);
}

function cliffObservatory(batch, ground, snowy=false) {
  const white=snowy?'#f1f6f2':'#eeeada',steel='#53666c',sand=snowy?'#8faab5':'#a57555';
  // 높은 암반은 해저부터 세워 관측소가 공중에 뜨지 않도록 한다.
  batch.add('taper',sand,[0,(ground-13)/2,0],[57,ground+13,48]);
  for(let i=0;i<7;i++) {
    const y=ground*i/7;
    batch.add('cylinder',snowy?(i%2?'#d5e5e9':'#a7c4cf'):(i%2?'#be946d':'#9b6d53'),[0,y,0],[48-i*.8,1.1,40-i*.6]);
  }
  batch.add('cylinder',snowy?'#e5efee':'#c8bda0',[0,ground,0],[39,3,33]);
  batch.box(white,0,ground+6,0,46,11,31);
  batch.box(steel,0,ground+7,-15.6,35,3,.3);
  for(let x=-18;x<=18;x+=6)batch.box('#dfdfd3',x,ground+7,-15.9,.7,3.2,.4);
  batch.add('cylinder',white,[0,ground+15,0],[18,8,18]);
  batch.add('dome',white,[0,ground+19,0],[23,23,23]);
  // 반구의 능선은 적은 면으로도 기상관측돔의 실루엣을 보여 준다.
  for(let i=0;i<8;i++) {
    const a=i/8*Math.PI*2;
    let previous=V(Math.cos(a)*23,ground+19,Math.sin(a)*23);
    for(let j=1;j<=6;j++) {
      const t=j/6*Math.PI/2,p=V(Math.cos(a)*23*Math.cos(t),ground+19+23*Math.sin(t),Math.sin(a)*23*Math.cos(t));
      batch.beam('#acb9b8',previous,p,.22); previous=p;
    }
  }
  batch.beam(steel,V(28,ground,9),V(28,ground+34,9),.65);
  batch.box('#dacaac',28,ground+25,9,4,1,4);
  batch.box('#d3b87d',28,ground+31,9,5,.7,2);
  for(let i=0;i<16;i++) {
    const a=i/16*Math.PI*2,b=(i+1)/16*Math.PI*2;
    const p=V(Math.cos(a)*37,ground+2,Math.sin(a)*31),q=V(Math.cos(b)*37,ground+2,Math.sin(b)*31);
    batch.beam(steel,p.clone().add(V(0,-2,0)),p,.2);batch.beam(steel,p,q,.2);
  }
}

function cargoTerminal(batch) {
  const dark='#304e5b',white='#e4e7d7',steel='#74938b',yellow='#dec176';
  const outline=new THREE.Shape([[-119,-21],[91,-21],[133,0],[91,21],[-119,21]].map(([x,z])=>new THREE.Vector2(x,-z)));
  const hull=new THREE.ExtrudeGeometry(outline,{depth:12,bevelEnabled:false});hull.rotateX(-Math.PI/2);
  batch.add(hull,dark,[0,-13,0]);hull.dispose();
  batch.box('#b66a52',-10,-8,0,210,5,39);
  batch.box('#bcc0ad',-4,-.3,0,225,1.1,40);
  const colors=['#b76649','#d2ae62','#507b87','#728b72'];
  for(let row=0;row<4;row++)for(let col=0;col<7;col++) {
    const x=-56+col*22,z=-15+row*10,layers=2+(col+row)%2;
    for(let layer=0;layer<layers;layer++) {
      batch.box(colors[(row+col+layer)%4],x,3.2+layer*6.5,z,20,6.1,8.5);
      for(let rib=-7;rib<=7;rib+=3.5)batch.box('#335059',x+rib,3.2+layer*6.5,z-4.3,.14,5.3,.1);
    }
  }
  batch.box(white,-94,10,0,25,21,35);batch.box(white,-94,24,0,30,7,38);
  batch.box('#346774',-94,24,-19.15,26,3.5,.2);batch.box('#346774',-78.9,24,0,.2,3.5,32);
  batch.box(dark,-100,32,7,7,10,8);batch.box('#b96549',-100,36,7,8,4,9);
  batch.beam(white,V(-91,28,-4),V(-91,44,-4),.5);batch.beam(white,V(-98,39,-4),V(-84,39,-4),.35);
  // 배 옆의 짧은 하역 부두는 수면 아래까지 내려가는 지지대를 둔다.
  batch.box('#878d82',0,-5,73,254,10,44);batch.box('#c5c1a7',0,.3,73,255,.6,45);
  for(let x=-119;x<=119;x+=17)batch.add('cylinder',dark,[x,-8,95],[1.4,17,1.4]);
  for(const x of[-34,34])for(const z of[58,85])batch.beam(steel,V(x,1,z),V(x*.48,60,z),2.7);
  for(const z of[59,84]) {
    batch.beam(steel,V(-34,2,z),V(16,58,z),1.1);batch.beam(steel,V(34,2,z),V(-16,58,z),1.1);
  }
  for(const x of[-8,8]) {
    batch.beam(steel,V(x,61,-14),V(x,61,106),1.7);batch.beam(steel,V(x,69,-14),V(x,69,106),1.4);
    for(let z=-14;z<102;z+=12)batch.beam(steel,V(x,61,z),V(x,69,z+12),.7);
  }
  batch.box(white,0,57,44,14,6,10);batch.box('#416c79',0,57,38.8,11,3,.2);
  for(const x of[-4,4])batch.beam(dark,V(x,61,12),V(x,24,12),.22);
  batch.box(yellow,0,23,12,13,2.3,9);
}

export function addMarathonLandmarks(world) {
  if(world.marathonLandmarks)return world.marathonLandmarks;
  const zones=world.curve.courseZones||world.curve.marathonZones||[];
  if(!zones.some(zone=>['reef','factory','snow','sky'].includes(zone.type)))return world.marathonLandmarks=[];
  const shapes={box:new THREE.BoxGeometry(1,1,1),cylinder:new THREE.CylinderGeometry(1,1,1,12),taper:new THREE.CylinderGeometry(.67,1,1,10),rock:new THREE.IcosahedronGeometry(1,1),dome:new THREE.SphereGeometry(1,20,10,0,Math.PI*2,0,Math.PI/2)};
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.85,metalness:.08}),landmarks=[];
  const road=[];for(let d=0;d<world.length;d+=6)road.push(world.frameAt(d).p);road.push(world.frameAt(world.length).p);
  for(const route of world.routes||[])for(let d=route.start;d<=route.end;d+=6)road.push(route.frameAt(d).p);
  const add=(id,x,z,build,zoneId,distance,yaw=0)=>{
    const batch=new LandmarkBatch(shapes);build(batch);const geometry=batch.geometry(),p=geometry.getAttribute('position');
    let radius=0;for(let i=0;i<p.count;i++)radius=Math.max(radius,Math.hypot(p.getX(i),p.getZ(i)));
    let gap=Infinity;for(const point of road)gap=Math.min(gap,Math.hypot(point.x-x,point.z-z));gap-=radius+3;
    if(gap<60){geometry.dispose();return false;}
    const mesh=new THREE.Mesh(geometry,material);mesh.name=id;mesh.position.set(x,0,z);mesh.rotation.y=yaw;mesh.receiveShadow=true;mesh.castShadow=false;
    mesh.userData={marathonLandmark:true,minimumRoadGap:gap,horizontalRadius:radius,zoneId,distance};world.scene.add(mesh);
    const bounds=geometry.boundingSphere.clone();bounds.center.applyAxisAngle(UP,yaw).add(mesh.position);
    (world.scene.userData.harbourChunks??=[]).push({mesh,bounds});
    landmarks.push({id,x,z,radius,minimumRoadGap:gap,zoneId,distance,mesh});return true;
  };
  // 구역의 실제 중간 지점과 진행 방향에서 배치한다. 이전 42km 확장맵의
  // 절대 좌표에 멀리 남는 배·관측소를 만들지 않는다.
  for(const zone of zones){
    if(!['reef','factory','snow','sky'].includes(zone.type))continue;
    let placed=false;
    for(const fraction of[.5,.25,.75,.12,.88]){
    const distance=THREE.MathUtils.lerp(zone.start,zone.end,fraction),frame=world.frameAt(distance),yaw=Math.atan2(frame.tangent.x,frame.tangent.z);
    const offsets=zone.type==='sky'?[340,-340,460,-460]:[190,-190,270,-270];
    for(const offset of offsets){
      const p=frame.p.clone().addScaledVector(frame.right,offset),ground=Math.max(0,world.sceneryGroundHeight?.(p.x,p.z)??sydneyTerrainHeight(p.x,p.z))+2;
      if(zone.type==='sky'&&world.sceneryIsLand?.(p.x,p.z))continue;
      const name=zone.type==='snow'?'화이트 리지 기상관측소':zone.type==='sky'?'천공 항만 화물선':zone.type==='factory'?'팩토리 관제소':'리프 바다 아치';
      const build=zone.type==='sky'?cargoTerminal:zone.type==='reef'?reefArch:batch=>cliffObservatory(batch,ground,zone.type==='snow');
      if(add(name,p.x,p.z,build,zone.id,distance,yaw)){placed=true;break;}
    }
    if(placed)break;
    }
  }
  for(const shape of Object.values(shapes))shape.dispose();if(!landmarks.length)material.dispose();
  world.marathonLandmarks=landmarks;return landmarks;
}
