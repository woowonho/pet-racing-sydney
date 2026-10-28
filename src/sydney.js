import * as THREE from '../vendor/three.module.js';
import {SYDNEY_LANDMARKS,sydneyTerrainHeight,sydneyBridgePylons} from './city-track.js';
import {addCoastalLandmarks} from './coastal-props.js';
import {addMarathonLandmarks} from './marathon-landmarks.js';
import {buildCourseLandscape} from './course-landscape.js';
import {createDesertField,buildDesertLandscape} from './desert-landscape.js';
import {buildSnowLandscape} from './snow-landscape.js';
import {BRIDGE_ARCH,bridgeArchHeight} from './bridge-routes.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),UP=V(0,1,0);
const box=new THREE.BoxGeometry(1,1,1);
const cylinder=new THREE.CylinderGeometry(1,1,1,8);
const cone=new THREE.ConeGeometry(1,1,8);
const sphere=new THREE.IcosahedronGeometry(1,1);
const rand=(n)=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};
const courseZones=world=>world.curve.courseZones||world.curve.marathonZones||[];
const sandAt=(world,d)=>world.curve.surfaceAt?.(d)?.surface==='sand'||world.features.some(f=>f.surface==='sand'&&d>=f.start&&d<=f.end);
const promenadeAt=(world,d)=>!sandAt(world,d)&&['harbour','garden','coast'].includes(courseZones(world).find(zone=>d>=zone.start&&d<zone.end)?.type);

// 노면뿐 아니라 제방·난간·지지대도 같은 구멍 구간을 비워야 한다.
export function sceneryGapIntersects(world,start,end=start){
  return (world.features||world.curve.features).some(feature=>feature.type==='gap'&&start<feature.end&&end>=feature.start);
}

// 정적인 구조물을 재질별로 합쳐 항만 전체가 적은 드로콜로 그려지도록 한다.
export class HarbourBatch {
  constructor(scene){this.scene=scene;this.buckets=new Map();this.matrix=new THREE.Matrix4();}
  add(geometry,material,position,scale=[1,1,1],quaternion=new THREE.Quaternion()){
    // 재질만으로 14km 전체를 하나로 묶으면 먼 해안의 모든 삼각형도 매번 그려진다.
    // 512m 공간 묶음으로 나누어 카메라 바깥의 기둥·수목·시설은 컬링한다.
    this.matrix.compose(V(...position),quaternion,V(...scale));
    if(!geometry.boundingSphere)geometry.computeBoundingSphere();
    const center=geometry.boundingSphere.center.clone().applyMatrix4(this.matrix);
    const key=`${material.uuid}:${Math.floor(center.x/512)}:${Math.floor(center.z/512)}`;
    const data=this.buckets.get(key)||{material,positions:[],normals:[],uvs:[],colors:[]};this.buckets.set(key,data);
    const g=geometry.index?geometry.toNonIndexed():geometry;
    this.matrix.compose(V(...position),quaternion,V(...scale));
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(this.matrix),p=V(0,0,0),n=V(0,0,0);
    const ps=g.getAttribute('position'),ns=g.getAttribute('normal'),uv=g.getAttribute('uv'),color=g.getAttribute('color');
    for(let i=0;i<ps.count;i++){p.fromBufferAttribute(ps,i).applyMatrix4(this.matrix);n.fromBufferAttribute(ns,i).applyNormalMatrix(normalMatrix);data.positions.push(p.x,p.y,p.z);data.normals.push(n.x,n.y,n.z);data.uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);if(material.vertexColors)data.colors.push(color?color.getX(i):1,color?color.getY(i):1,color?color.getZ(i):1);}
    if(g!==geometry)g.dispose();
  }
  block(material,x,y,z,w,h,d,angle=0){this.add(box,material,[x,y,z],[w,h,d],new THREE.Quaternion().setFromAxisAngle(UP,angle));}
  beam(a,b,width,material){const delta=b.clone().sub(a);this.add(cylinder,material,a.clone().add(b).multiplyScalar(.5).toArray(),[width,delta.length(),width],new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize()));}
  girder(a,b,width,material){const delta=b.clone().sub(a),length=delta.length(),q=new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize()),mid=a.clone().add(b).multiplyScalar(.5);this.add(box,material,mid.toArray(),[width*.22,length,width],q);for(const side of[-1,1])this.add(box,material,mid.clone().add(V(0,0,side*width*.46).applyQuaternion(q)).toArray(),[width,length,width*.13],q);}
  finish(){for(const b of this.buckets.values()){const material=b.material;const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));if(b.colors.length)g.setAttribute('color',new THREE.Float32BufferAttribute(b.colors,3));g.computeBoundingSphere();const m=new THREE.Mesh(g,material);m.castShadow=!material.userData.noShadow;m.receiveShadow=true;this.scene.add(m);if(this.scene.isScene){this.scene.userData.harbourChunks??=[];this.scene.userData.harbourChunks.push({mesh:m,bounds:g.boundingSphere});}}this.buckets.clear();}
}
function land(world,points,top,side,holes=[]){const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));for(const hole of holes)shape.holes.push(new THREE.Path(hole.map(([x,z])=>new THREE.Vector2(x,-z))));const geo=new THREE.ExtrudeGeometry(shape,{depth:9.2,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geo,[top,side]);mesh.position.y=-9.6;mesh.receiveShadow=true;world.scene.add(mesh);return mesh;}
function sailShell(length,width,height){
  const points=[],uv=[],indices=[],nu=28,nv=20;
  // 서로 닮은 구면 돛이 솟아오르는 오페라하우스의 겹지붕 실루엣.
  for(let i=0;i<=nu;i++){const u=i/nu;const peak=Math.pow(u,.72);const half=width*Math.sqrt(Math.max(0,2*u-u*u))/2;
    for(let j=0;j<=nv;j++){const v=j/nv*2-1;const arch=Math.pow(Math.max(0,1-Math.abs(v)),.66);points.push(half*v,2+height*peak*arch,length*(u-.5));uv.push(j/nv,u);}
  }
  for(let i=0;i<nu;i++)for(let j=0;j<nv;j++){const a=i*(nv+1)+j;indices.push(a,a+nv+1,a+1,a+1,a+nv+1,a+nv+2);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(points,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();return g;
}
function shellTexture(){const c=document.createElement('canvas');c.width=c.height=512;const x=c.getContext('2d');x.fillStyle='#faf6df';x.fillRect(0,0,512,512);for(let row=0;row<32;row++)for(let col=0;col<32;col++){x.fillStyle=(row+col)%3?'#ede7d6':'#fffdf2';x.fillRect(col*16+(row%2)*8,row*16,15,15);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(6,12);t.anisotropy=8;return t;}
function groundTexture(){const c=document.createElement('canvas');c.width=c.height=256;const x=c.getContext('2d');x.fillStyle='#76a66d';x.fillRect(0,0,256,256);for(let i=0;i<14000;i++){x.fillStyle=i%3?'#24472719':'#dddfa720';x.fillRect(rand(i+2)*256,rand(i+60)*256,1+rand(i+75)*4,1+rand(i+84)*5);}const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.repeat.set(1/32,1/32);t.anisotropy=8;return t;}
function masonryTexture(mode='stone'){
  const canvas=document.createElement('canvas');canvas.width=canvas.height=512;const c=canvas.getContext('2d'),paving=mode==='paving',slate=mode==='slate';
  c.fillStyle=slate?'#747e80':paving?'#9d9481':'#928273';c.fillRect(0,0,512,512);const rows=paving?16:32,cols=paving?8:8,h=512/rows,w=512/cols;
  for(let row=0;row<rows;row++)for(let col=-1;col<=cols;col++){const n=rand(row*22+col+5),x=col*w+(row%2)*w/2,y=row*h;const v=slate?105+n*22:paving?174+n*23:165+n*38;c.fillStyle=`rgb(${v|0},${(v*(slate?1.08:.92))|0},${(v*(slate?1.12:.77))|0})`;c.fillRect(x+1,y+1,w-2,h-2);c.fillStyle='#ffffff24';c.fillRect(x+2,y+2,w-4,1);c.fillStyle='#2c231617';c.fillRect(x+2,y+h-3,w-4,1);}
  for(let i=0;i<22000;i++){c.fillStyle=i%2?'#ffffff0b':'#241b1510';c.fillRect(rand(i+20)*512,rand(i+830)*512,1,1);}
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;return t;
}
function elevatedDeck(world,left,right,start,end,material,offset=-.32){const positions=[],indices=[];for(let i=0;i<=100;i++){const z=start+(end-start)*i/100;for(const x of[left,right])positions.push(x,sydneyTerrainHeight(x,z)+offset,z);if(i<100){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();material.side=THREE.DoubleSide;const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;world.scene.add(mesh);}
function facadeTexture(){const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;const c=canvas.getContext('2d');c.fillStyle='#b1b5ae';c.fillRect(0,0,256,512);for(let row=0;row<20;row++)for(let col=0;col<5;col++){const x=col*51.2,y=row*25.6,g=c.createLinearGradient(x,y,x+38,y+22);g.addColorStop(0,'#829aa3');g.addColorStop(.45,'#456875');g.addColorStop(1,rand(row*8+col)>.8?'#8c8974':'#294753');c.fillStyle=g;c.fillRect(x+4,y+3,42,18);c.fillStyle='#dfe6e52d';c.fillRect(x+7,y+4,12,16);c.fillStyle='#233d48';c.fillRect(x+25,y+3,1.5,18);c.fillStyle='#535f624d';c.fillRect(x+1,y+24,49,1.4);}const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=8;return t;}
function terrainBerm(world,start,end,material){
  const positions=[],colors=[],indices=[],steps=Math.ceil((end-start)*world.length/5);
  for(let i=0;i<=steps;i++){
    const d=(start+(end-start)*i/steps)*world.length,f=world.frameAt(d),wave=Math.sin(d*.018),swell=Math.sin(d*.0061);
    const left=55+10*wave,right=60+12*Math.sin(d*.014+1.7);
    const profile=[[-left,-.45],[-32-4*swell,Math.max(-.38,f.p.y*.46+2.8*wave-1)],[-17,f.p.y-.48],[17,f.p.y-.48],[35+4*swell,Math.max(-.38,f.p.y*.42-2.3*wave-1)],[right,-.45]];
    for(let j=0;j<profile.length;j++){
      const [offset,y]=profile[j],p=f.p.clone().addScaledVector(f.right,offset);p.y=y;positions.push(p.x,p.y,p.z);
      // 바깥은 노출된 사암, 위쪽은 마른 풀과 짙은 관목색이 교차한다.
      const shade=.88+.12*Math.sin(d*.024+j*.7),c=new THREE.Color(j===0||j===5?'#a89373':j===1||j===4?'#8b9a67':'#94a673').multiplyScalar(shade);colors.push(c.r,c.g,c.b);
    }
    if(i<steps&&!sceneryGapIntersects(world,d,(start+(end-start)*(i+1)/steps)*world.length))for(let j=0;j<5;j++){const a=i*6+j;indices.push(a,a+1,a+6,a+1,a+7,a+6);}
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));g.setIndex(indices);g.computeVertexNormals();
  const m=new THREE.Mesh(g,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96,side:THREE.DoubleSide}));m.receiveShadow=true;world.scene.add(m);
}
function insideLand(x,z,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function sculptedTerrain(world,polygon,bounds,heightAt,material,holes=[],theme='grass'){
  const[x0,x1,z0,z1]=bounds,nx=Math.ceil((x1-x0)/18),nz=Math.ceil((z1-z0)/18),positions=[],uv=[],indices=[],inside=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz;inside.push(insideLand(x,z,polygon)&&!holes.some(hole=>insideLand(x,z,hole)));positions.push(x,heightAt(x,z),z);uv.push(x,z);}
  // 해안선은 정밀한 기존 육지 면이 맡는다. 물 밖으로 보간되는 격자는 만들지 않는다.
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;if(![a,b,c,d].every(k=>inside[k])||Math.max(...[a,b,c,d].map(k=>positions[k*3+1]))<.05)continue;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();// 큰 해안 지형은 기울기별 확산광을 정점에 구워 검은 삼각형 음영을 없앤다.
  const normals=g.getAttribute('normal'),colors=[],sun=V(-.55,.76,-.32).normalize();
  for(let i=0;i<normals.count;i++){
    const n=V(normals.getX(i),normals.getY(i),normals.getZ(i)),shade=.57+.42*Math.max(0,n.dot(sun));
    if(theme==='sandstone'){
      const x=positions[i*3],height=positions[i*3+1],z=positions[i*3+2],steep=1-THREE.MathUtils.smoothstep(n.y,.67,.96);
      const strata=.5+.5*Math.sin(height*.72+Math.sin(x*.009+z*.006)*.7),patch=.5+.5*Math.sin(x*.025+Math.cos(z*.019))*Math.sin(z*.016);
      const dryGrass=new THREE.Color('#9ea06c').lerp(new THREE.Color('#73844f'),patch);
      const sandstone=new THREE.Color('#b2987b').lerp(new THREE.Color('#dfc59d'),strata*.58);
      // 기울어진 면에는 사암층이 드러나고 완만한 꼭대기에만 마른 풀이 남는다.
      // 정점에 방향광 음영까지 넣어 초록 천막처럼 균일하게 보이지 않게 한다.
      const exposure=Math.max(steep,THREE.MathUtils.smoothstep(height,48,88)*.42);
      const color=dryGrass.lerp(sandstone,exposure).multiplyScalar(shade);colors.push(color.r,color.g,color.b);
    }else colors.push(shade,shade,shade);
  }
  g.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));
  const terrainMaterial=new THREE.MeshBasicMaterial({map:theme==='sandstone'?null:material.map,color:theme==='sandstone'?'#ffffff':material.color,vertexColors:true,side:THREE.DoubleSide});
  const mesh=new THREE.Mesh(g,terrainMaterial);mesh.name=`${theme}-sculpted-terrain`;mesh.userData.sculptedTerrain=true;world.scene.add(mesh);
}
function gableGeometry(){const p=[-1,0,-1,1,0,-1,0,1,-1,-1,0,1,0,1,1,1,0,1,-1,0,-1,0,1,-1,-1,0,1,0,1,-1,0,1,1,-1,0,1,1,0,-1,1,0,1,0,1,-1,0,1,-1,1,0,1,0,1,1];for(let i=0;i<p.length;i+=9)for(let k=0;k<3;k++){const b=p[i+3+k];p[i+3+k]=p[i+6+k];p[i+6+k]=b;}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;}

// 철골 위 진공관과 같은 아치 높이를 쓴다. 접합판과 리벳은 상현재 위로
// 1.9m 안쪽에 머물러 상부 주행면·투명관 내부를 가로막지 않는다.
export function buildHarbourBridgeStructure(world,materials,existingBatch=null){
  const batch=existingBatch||new HarbourBatch(world.scene),{steel,steelLight,stone,sandLight,path,navy,white}=materials;
  const {centerX:center,z0,z1,sides}=BRIDGE_ARCH,span=z1-z0;
  const stats={bridgeArchCount:sides.length,bridgeJointPlates:0,bridgeRivets:0,bridgeHangers:0,bridgePylons:0};
  elevatedDeck(world,center-42,center+42,z0-8,z1+8,path);
  for(let z=z0;z<z1;z+=18){const top=Math.min(sydneyTerrainHeight(center,z-9),sydneyTerrainHeight(center,z+9))-.35;batch.block(steel,center,top-1.75,z,84,3.5,18);}
  for(const x of [-20,30])for(const z of[-58,-16,26]){const top=Math.min(sydneyTerrainHeight(x,z-3),sydneyTerrainHeight(x,z+3))-.35;batch.block(stone,x,(top-10)/2,z,19,top+10,6);}
  elevatedDeck(world,center-10.5,center+10.5,z0,z1,sandLight,-.06);
  for(const x of sides){
    let previousLow=null,previousHigh=null;
    for(let i=0;i<=34;i++){
      const t=i/34,z=z0+t*span,low=V(x,bridgeArchHeight(z,false),z),high=V(x,bridgeArchHeight(z),z);
      if(previousLow){batch.girder(previousLow,low,2.7,steel);batch.girder(previousHigh,high,2.3,steel);batch.girder(previousLow,high,1.05,steelLight);batch.girder(previousHigh,low,1.05,steelLight);}
      const deckY=sydneyTerrainHeight(x,z);batch.beam(low,high,.6,steelLight);
      if(i>1&&i<33&&low.y>deckY){
        // 두 가닥 행어와 작은 하부 정착판이 아치의 하중 전달을 보여 준다.
        for(const dz of[-.72,.72]){batch.beam(V(x,deckY+.9,z+dz),low.clone().add(V(0,0,dz)),.15,steel);stats.bridgeHangers++;}
        batch.block(steelLight,x,deckY+.72,z,1.5,.26,2.7);
        batch.beam(V(x,deckY+1,z),V(x,deckY+3,z+7),.25,steelLight);
      }
      if(i%3===0&&i>0&&i<34){
        batch.beam(low,V(center*2-x,low.y,z),.62,steel);
        // 북쪽 마지막 상부 가로보는 진공관 진출입 경로와 겹친다.
        // 하부 횡보를 남기고 이 한 칸만 열린 포털로 마감한다.
        if(i<33)batch.beam(high,V(center*2-x,high.y,z),.55,steel);
      }
      if(i%2===0&&i>0&&i<34)for(const joint of[low,high])for(const side of[-1,1]){
        batch.block(steel,x+side*1.36,joint.y,z,.24,2.8,3.5);stats.bridgeJointPlates++;
        for(const dy of[-.85,.85])for(const dz of[-1.13,1.13]){
          batch.block(steelLight,x+side*1.53,joint.y+dy,z+dz,.18,.22,.22);stats.bridgeRivets++;
        }
      }
      previousLow=low;previousHigh=high;
    }
    for(let z=z0;z<=z1;z+=12){const y=sydneyTerrainHeight(x,z),next=sydneyTerrainHeight(x,z+12);batch.beam(V(x,y+.2,z),V(x,y+1.6,z),.11,steelLight);batch.beam(V(x,y+1.6,z),V(x,next+1.6,z+12),.1,steelLight);}
  }
  for(const {x,z,base,parts} of sydneyBridgePylons()){
    stats.bridgePylons++;
    for(const part of parts)batch.block(part.material==='stone'?stone:sandLight,x,part.y,z,part.width,part.height,part.depth);
    for(const face of[-1,1]){
      for(const dx of[-7,0,7]){
        batch.block(navy,x+dx,base+30,z+face*12.6,2,9,.2);
        batch.block(sandLight,x+dx,base+25.3,z+face*12.82,2.5,.45,.45);
        batch.block(sandLight,x+dx,base+34.8,z+face*12.82,2.5,.3,.45);
      }
      for(let y=base+4;y<base+39;y+=4.8)batch.block(sandLight,x,y,z+face*12.63,24,.16,.18);
      for(const dx of[-11.15,11.15])for(let y=base+4;y<base+40;y+=2.6)batch.block(sandLight,x+dx,y,z+face*12.64,1.6,1.2,.2);
      batch.block(stone,x,base+17.8,z+face*12.73,23.7,.35,.33);
    }
    // 기존 주탑의 최대 바닥 폭 안에서만 받침과 처마 단차를 더한다.
    batch.block(sandLight,x,base+1.3,z,29.5,.45,31.5);
    batch.block(stone,x,base+40.9,z,25,.55,26);
    batch.block(sandLight,x,base+42.3,z,26.4,.45,27.4);
  }
  for(let z=55;z<560;z+=30)for(const x of [center-38,center+38]){const y=sydneyTerrainHeight(x,z);batch.beam(V(x,y,z),V(x,y+7,z),.12,steel);batch.beam(V(x,y+7,z),V(x+3,y+7,z),.1,steel);batch.block(white,x+3,y+6.95,z,1.4,.15,.7);}
  if(!existingBatch)batch.finish();
  world.sceneryStats??={};Object.assign(world.sceneryStats,stats);return stats;
}

// 물 위로 돌아 나오는 마지막 연속 코너는 얇은 공중 도로가 아니라
// 낮은 사암 부두로 받친다. 장식·반사표지는 모두 충돌 경계 바깥에 놓는다.
export function buildHarbourFinaleDetail(world,materials,existingBatch=null){
  const feature=world.features.find(f=>f.id==='harbour-finger-finale');if(!feature)return{finaleQuayLength:0,finaleCornerBoards:0};
  const batch=existingBatch||new HarbourBatch(world.scene),{stone,sandLight,path,navy,white,steel}=materials;
  const point=(d,offset,height=0)=>world.frameAt(d,offset).p.add(V(0,height,0));
  const quad=(a,b,c,d,material)=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([a,b,c,b,d,c].flatMap(p=>p.toArray()),3));g.computeVertexNormals();material.side=THREE.DoubleSide;batch.add(g,material,[0,0,0]);g.dispose();};
  const stats={finaleQuayLength:Math.round(feature.end-feature.start),finaleCornerBoards:0};
  for(let d=feature.start;d<feature.end;d+=3){
    const next=Math.min(d+3,feature.end),w=world.roadHalfWidthAt(d),wn=world.roadHalfWidthAt(next);
    for(const side of[-1,1]){
      const a=point(d,side*(w+.35),-.22),b=point(next,side*(wn+.35),-.22),c=point(d,side*(w+4.5),-.22),e=point(next,side*(wn+4.5),-.22);
      quad(a,b,c,e,path);
      quad(c,e,c.clone().setY(Math.min(-10.1,c.y-3.6)),e.clone().setY(Math.min(-10.1,e.y-3.6)),stone);
      quad(point(d,side*(w+3.9),-.12),point(next,side*(wn+3.9),-.12),point(d,side*(w+4.58),-.12),point(next,side*(wn+4.58),-.12),sandLight);
    }
    const bend=world.turnRateAt(d);if(Math.floor((d-feature.start)/3)%8||Math.abs(bend)<.010)continue;
    const f=world.frameAt(d),direction=Math.sign(bend),p=point(d,-direction*(w+2.35),2.25),yaw=Math.atan2(f.tangent.x,f.tangent.z);
    batch.block(navy,p.x,p.y,p.z,2.8,1.75,.18,yaw);
    batch.beam(p.clone().add(V(0,-1.9,0)),p.clone().add(V(0,-.8,0)),.09,steel);
    // 밝은 V자 반사띠는 실제 다음 회전 방향과 같이 바뀐다.
    const tip=p.clone().addScaledVector(f.right,direction*.7).addScaledVector(f.tangent,-.15);
    for(const vertical of[-.55,.55])batch.beam(p.clone().addScaledVector(f.right,-direction*.6).addScaledVector(f.tangent,-.15).add(V(0,vertical,0)),tip,.12,white);
    stats.finaleCornerBoards++;
  }
  if(!existingBatch)batch.finish();world.sceneryStats??={};Object.assign(world.sceneryStats,stats);return stats;
}

export function buildSydneyScenery(world){
  const {scene}=world,batch=new HarbourBatch(scene);world.landmarks=SYDNEY_LANDMARKS;world.courseId=world.curve.courseId;
  const steel=world.material('#334953',.58,.48),steelLight=world.material('#61737a',.45,.55),sand=world.material('#cfb18a'),sandLight=world.material('#e4ceb0'),path=world.material('#d3c5a9'),grass=world.material('#76a96a'),grassDark=world.material('#42794e'),leaf=world.material('#3f815c'),leafLight=world.material('#5a9662'),trunk=world.material('#78634a'),white=world.material('#f7f5e5'),navy=world.material('#224e60'),glass=world.material('#54858e',.4,.2),yellow=world.material('#f3c14f');
  grass.map=groundTexture();grass.color.set('#ffffff');grassDark.map=grass.map;grassDark.color.set('#8cb398');path.polygonOffset=true;path.polygonOffsetFactor=0;path.polygonOffsetUnits=3;
  const stoneMap=masonryTexture(),stone=new THREE.MeshStandardMaterial({map:stoneMap,bumpMap:stoneMap,bumpScale:.16,roughness:.91});
  const pavingMap=masonryTexture('paving');pavingMap.repeat.set(5,1);const paving=new THREE.MeshStandardMaterial({map:pavingMap,bumpMap:pavingMap,bumpScale:.055,roughness:.85,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-1});
  const northMap=masonryTexture('slate');northMap.repeat.set(4,1);const northPaving=new THREE.MeshStandardMaterial({map:northMap,roughness:.84,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-1});
  const water=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec3 p; void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`varying vec3 p; uniform float time;
  float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
  float wave(vec2 q){return (noise(q*.65+vec2(time*.21,-time*.09))-.5)*.22+(noise(q*1.7+vec2(-time*.14,time*.18))-.5)*.07;}
  void main(){vec2 q=p.xz;float v=wave(q);vec3 n=normalize(vec3(wave(q+vec2(.8,0.))-v,1.3,wave(q+vec2(0.,.8))-v));vec3 eye=normalize(cameraPosition-p);float fres=pow(1.-max(dot(n,eye),0.),3.);vec3 c=mix(vec3(.035,.20,.27),vec3(.22,.41,.49),fres);c+=v*.018;float glint=pow(max(dot(reflect(-normalize(vec3(-.5,1.,-.3)),n),eye),0.),140.);c+=vec3(.95,.95,.72)*glint*.43;float distanceToEye=length(cameraPosition-p);float haze=1.-exp(-distanceToEye*distanceToEye*.00042*.00042);c=mix(c,vec3(.78,.89,.94),haze);gl_FragColor=vec4(c,1.);}`});
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(40000,40000),water);ocean.rotation.x=-Math.PI/2;ocean.position.y=-10;scene.add(ocean);world.waterMaterial=water;
  const southLand=[[-1900,-2500],[3500,-2500],[3500,-1000],[2700,-860],[2100,-690],[1650,-550],[1350,-465],[1100,-430],[925,-390],[780,-330],[580,-190],[490,-120],[445,-32],[407,43],[372,196],[263,196],[250,98],[250,-32],[223,-65],[95,-65],[72,-60],[-80,-65],[-300,-140],[-750,-105],[-1350,-180]];
  const northLand=[[-1800,2500],[1400,2500],[1400,685],[850,640],[610,565],[420,535],[330,595],[205,565],[125,545],[0,550],[-160,585],[-420,540],[-850,615],[-1500,580]];
  const westLand=[[-420,-740],[-1450,-1970],[-2420,-1960],[-3480,-900],[-3500,650],[-3120,2140],[-2240,2860],[-1280,2730],[-1260,1970],[-1600,1320],[-1720,760],[-1650,180],[-1670,-410],[-1190,-480],[-520,-510]];
  // 서안 루프 안쪽은 넓은 잔디가 아니라 물이 파고든 두 항만 만이다.
  // 사암 절벽 아래 수면이 보여 고속 직선과 내리막의 높이 차를 읽을 수 있다.
  const westInlets=[
    [[-1600,-920],[-1600,-1190],[-1820,-1390],[-2030,-1300],[-2030,-1080],[-1780,-890]],
    [[-2930,-180],[-2930,170],[-2800,310],[-2490,330],[-2320,150],[-2450,-170],[-2700,-300]],
    [[-2990,-870],[-2890,-945],[-2730,-875],[-2660,-785],[-2770,-690],[-2930,-690],[-3015,-770]],
    [[-2510,1990],[-2330,1880],[-2140,1995],[-2050,2145],[-2210,2340],[-2430,2310],[-2580,2160]],
  ];
  land(world,southLand,grass,sand);land(world,northLand,grass,sand);land(world,westLand,grassDark,sand,westInlets);
  const roadSamples=world.samples.filter((_,i)=>i%3===0).map(frame=>({...frame,halfWidth:world.roadHalfWidthAt(frame.t*world.length)}));
  for(let d=-65;d<0;d+=5)roadSamples.push({...world.frameAt(d),halfWidth:world.roadHalfWidthAt(d)});
  for(let d=world.length;d<world.length+100;d+=5)roadSamples.push({...world.frameAt(d),halfWidth:world.roadHalfWidthAt(d)});
  for(const route of world.routes||[])for(let d=route.start;d<=route.end;d+=6)roadSamples.push({...route.frameAt(d),halfWidth:route.halfWidth});
  // 긴 스프린트에서도 나무·집·지형이 도로를 침범하지 않도록 9m 간격의
  // 노면 표본을 공간 격자로 찾는다. 매 소품마다 코스 전체를 훑지 않는다.
  const roadGrid=new Map(),cell=96;
  for(const f of roadSamples){const key=`${Math.floor(f.p.x/cell)},${Math.floor(f.p.z/cell)}`;if(!roadGrid.has(key))roadGrid.set(key,[]);roadGrid.get(key).push(f);}
  const nearestRoad=(x,z)=>{
    let distance2=Infinity,height=0,groundLimit=Infinity;const gx=Math.floor(x/cell),gz=Math.floor(z/cell);
    const visit=f=>{const d=(x-f.p.x)**2+(z-f.p.z)**2;groundLimit=Math.min(groundLimit,f.p.y-2.5+Math.max(0,Math.sqrt(d)-38)*.45);if(d<distance2){distance2=d;height=f.p.y;}};
    for(let ring=0;ring<=6;ring++){
      for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
        if(ring&&Math.abs(dx)!==ring&&Math.abs(dz)!==ring)continue;
        for(const f of roadGrid.get(`${gx+dx},${gz+dz}`)||[])visit(f);
      }
      if(distance2<Math.max(0,(ring-1)*cell)**2)return{distance:Math.sqrt(distance2),height,groundLimit};
    }
    for(const f of roadSamples)visit(f);return{distance:Math.sqrt(distance2),height,groundLimit};
  };
  const smooth=THREE.MathUtils.smoothstep;
  const rawHill=(x,z)=>{
    if(x<-1200){
      // 서안 원경은 평평한 초록 수평선 대신 네 사암 곶이 겹친 능선이다.
      // 지면 높이는 뒤의 도로거리 절삭으로 제한해 좁은 S자 사이를 채우지 않는다.
      const hill=(cx,cz,rx,rz,height)=>height*Math.exp(-(((x-cx)/rx)**2+((z-cz)/rz)**2));
      const ridges=hill(-2650,1630,320,390,108)+hill(-1900,810,300,440,76)+hill(-3220,-760,230,410,88)+hill(-2460,-1570,290,250,75);
      const crags=7*Math.sin(x*.014+Math.sin(z*.007))*Math.sin(z*.016);
      return Math.max(0,ridges+crags)*(1-smooth(z,2350,2800));
    }
    if(z>540){const rise=smooth(z,605,1030),edge=(1-smooth(Math.abs(x),900,1500))*(1-smooth(z,1850,2500));return-.3+edge*(rise*(36+22*Math.exp(-(((x-300)/650)**2))+8*Math.sin(x*.004))+17*Math.exp(-(((x-490)/190)**2+((z-735)/190)**2)));}
    const rocks=31*Math.exp(-(((x+370)/270)**2+((z+280)/220)**2))*(1-smooth(z,-155,-65));
    const garden=18*Math.exp(-(((x-650)/320)**2+((z+380)/250)**2));
    return-.3+rocks+garden;
  };
  // 모래와 잔디가 각각 같은 노면 높이 제한까지 올라오면 두 삼각형 격자가
  // 서로 뚫고 나온다. 사막 높이장을 먼저 만들고 바탕 지형을 그 아래로 묻는다.
  const desertField=createDesertField(world);if(desertField)world.desertField=desertField;
  const sceneGround=(x,z)=>{
    const h=x<-700?Math.max(rawHill(x,z),sydneyTerrainHeight(x,z)-1.2):rawHill(x,z),road=nearestRoad(x,z);
    let ground=Math.max(-.38,Math.min(h,road.groundLimit));
    if(desertField){const [x0,x1,z0,z1]=desertField.bounds;if(x>=x0&&x<=x1&&z>=z0&&z<=z1){
      const sand=desertField.sample(x,z),blend=smooth(sand.land,.03,.5);
      ground=THREE.MathUtils.lerp(ground,Math.min(ground,sand.height-5),blend);
    }}
    return ground;
  };
  sculptedTerrain(world,northLand,[-1500,1300,540,2350],sceneGround,grass);
  sculptedTerrain(world,southLand,[-1500,1500,-1500,50],sceneGround,grass);
  sculptedTerrain(world,westLand,[-3550,-420,-2000,2900],sceneGround,grassDark,westInlets,'sandstone');
  world.sceneryGroundHeight=sceneGround;
  world.sceneryIsLand=(x,z)=>insideLand(x,z,x<-700?westLand:z>500?northLand:southLand)&&!westInlets.some(inlet=>insideLand(x,z,inlet));
  world.sceneryStats={shoreWharves:5,walshBayPiers:0,houses:0,minimumBuildingRoadGap:Infinity};
  // 멀리 있는 항만 곶은 수평선을 막지 않는 낮은 녹지다.
  land(world,[[1300,750],[2400,800],[2800,150],[2500,-120],[2150,80],[1800,290]],grassDark,sand);
  const pavedSidewalk={include:d=>promenadeAt(world,d)};
  world.ribbon(-15,15,-.1,path,pavedSidewalk);world.ribbon(-14.7,-14.25,.02,sandLight,pavedSidewalk);world.ribbon(14.25,14.7,.02,sandLight,pavedSidewalk);
  // 육지의 코너는 제방까지 함께 솟는다. 도로 아래가 뜨지 않도록 넓은 지형 띠를 만든다.
  const featureBy=id=>world.features.find(feature=>feature.id===id);
  const finger=featureBy('north-finger'),northSwitch=featureBy('north-switch'),operaSwitch=featureBy('opera-switch'),harbourFlight=featureBy('harbour-flight'),gardenSwitch=featureBy('garden-switch'),quaySwitch=featureBy('quay-switch');
  const berms=[];if(finger&&northSwitch)berms.push([finger.start-180,northSwitch.end+35]);if(operaSwitch)berms.push([operaSwitch.start-200,operaSwitch.end+50]);
  if(harbourFlight&&world.curve.marathonStart)berms.push([harbourFlight.end+150,world.curve.marathonStart]);
  for(const [start,end] of berms)if(end>start)terrainBerm(world,Math.max(0,start)/world.length,Math.min(world.length,end)/world.length,grass);
  const sectionRange=(from,to)=>({start:Math.max(0,from)/world.length,end:Math.min(world.length,to)/world.length});
  if(finger&&northSwitch)world.ribbon(-11.18,11.18,.008,northPaving,sectionRange(finger.start-100,northSwitch.end+25));
  if(operaSwitch)world.ribbon(-11.18,11.18,.009,paving,sectionRange(operaSwitch.start-45,operaSwitch.end+30));
  const gardenRoad=world.material('#b88a68',0,.94);gardenRoad.map=world.roadTexture;gardenRoad.polygonOffset=true;gardenRoad.polygonOffsetFactor=0;gardenRoad.polygonOffsetUnits=-1;
  if(gardenSwitch&&quaySwitch)world.ribbon(-11.18,11.18,.009,gardenRoad,sectionRange(gardenSwitch.start-45,quaySwitch.end+30));
  if(!world.curve.isClosed){world.ribbon(-14.2,-11.65,.018,paving,{start:.545,end:.96,segments:460});world.ribbon(11.65,14.2,.018,paving,{start:.545,end:.96,segments:460});}
  // 물 쪽에는 낮고 투명한 난간만 두어 달리는 동안 수면이 계속 보인다.
  for(let d=0;d<world.length;d+=10){if(sceneryGapIntersects(world,d,d+10)||!promenadeAt(world,d))continue;const f=world.frameAt(d);const onBridge=f.p.z>38&&f.p.z<565&&f.p.x<95;if(onBridge)continue;for(const side of [-1,1]){const p=f.p.clone().addScaledVector(f.right,side*(world.roadHalfWidthAt(d)+2.9)),end=world.frameAt(d+9.7,side*(world.roadHalfWidthAt(d+9.7)+2.9)).p;
      batch.beam(V(p.x,p.y+1.1,p.z),V(end.x,end.y+1.1,end.z),.09,white);batch.beam(V(p.x,p.y+.15,p.z),V(p.x,p.y+1.15,p.z),.10,steelLight);
  }}
  // 원래 상판은 유지하고 양쪽 아치의 진공관 아래에 실제 철골 접합을 보인다.
  buildHarbourBridgeStructure(world,{steel,steelLight,stone,sandLight,path,navy,white},batch);
  // 베넬롱 포인트: 넓은 사암 단 위에 서로 다른 크기의 하얀 돛지붕.
  const opera=new THREE.Group();opera.position.set(320,0,108);opera.rotation.y=2.65;scene.add(opera);
  const podiumMat=world.material('#d4b79b'),tileMat=new THREE.MeshStandardMaterial({map:shellTexture(),roughness:.66,side:THREE.DoubleSide});
  const darkGlass=world.material('#194552',.5,.23);darkGlass.side=THREE.DoubleSide;
  const operaBatch=new HarbourBatch(opera);
  const makeBox=(x,y,z,w,h,d,material)=>operaBatch.block(material,x,y,z,w,h,d);
  makeBox(0,1.5,0,132,3,142,podiumMat);
  batch.block(paving,320,-.13,100,172,.22,195);batch.block(stone,320,-2,191,172,4,3);
  for(let i=0;i<9;i++)makeBox(0,.2+i*.22,-85+i*1.7,132-i*.6,.44,4.5,sandLight);
  const shells=[[-27,-30,76,43,47],[-27,7,89,49,61],[-27,42,73,41,53],[28,-22,68,36,41],[28,12,74,41,53],[28,43,58,33,40],[0,-57,40,30,25]];
  for(const [x,z,l,w,h]of shells){const geometry=sailShell(l,w,h);operaBatch.add(geometry,tileMat,[x,3,z]);geometry.dispose();
    makeBox(x,4,z,w*.60,5,l*.30,darkGlass);
    const facade=new THREE.Shape();facade.moveTo(-w/2,2);for(let j=0;j<=30;j++){const v=-1+j/15;facade.lineTo(v*w/2,2+h*Math.pow(Math.max(0,1-Math.abs(v)),.66));}facade.lineTo(w/2,2);facade.closePath();
    const facadeGeometry=new THREE.ShapeGeometry(facade);operaBatch.add(facadeGeometry,tileMat,[x,3,z+l/2-.1]);operaBatch.add(facadeGeometry,darkGlass,[x,3.65,z+l/2+.04],[.80,.64,1]);facadeGeometry.dispose();
    for(let j=-3;j<=3;j++){const v=j/4,top=4+h*.64*Math.pow(1-Math.abs(v),.66);operaBatch.add(cylinder,sandLight,[x+v*w*.4,(top+5)/2,z+l/2+.10],[.13,top-5,.13]);}
    // 세로 능선이 거대한 지붕을 작은 하얀 원뿔로 보이지 않게 한다.
    const ridge=[];for(let j=0;j<=25;j++){const u=j/25;ridge.push(V(x,5+h*Math.pow(u,.72),z+l*(u-.5)));}
    const rib=new THREE.TubeGeometry(new THREE.CatmullRomCurve3(ridge),28,.18,5,false);operaBatch.add(rib,white,[0,0,0]);rib.dispose();
  }
  operaBatch.finish();
  // U자 수면에 나란히 놓인 다섯 부두가 서큘러 키의 형태를 만든다.
  const roofGeometry=gableGeometry(),wharfRoof=world.material('#647773',.28,.57);
  const signCanvas=document.createElement('canvas');signCanvas.width=1000;signCanvas.height=128;const signContext=signCanvas.getContext('2d');signContext.fillStyle='#254c54';signContext.fillRect(0,0,1000,128);signContext.textAlign='center';for(let i=0;i<5;i++){signContext.fillStyle='#d7e7dc';signContext.font='bold 13px Arial';signContext.fillText('CIRCULAR QUAY',i*200+100,23);signContext.fillStyle='#ffffff';signContext.font='bold 76px Arial';signContext.fillText(String(6-i),i*200+100,104);}const signTexture=new THREE.CanvasTexture(signCanvas);signTexture.colorSpace=THREE.SRGBColorSpace;const signMaterial=new THREE.MeshBasicMaterial({map:signTexture,side:THREE.DoubleSide});
  batch.block(stone,155,-3.2,-65,144,6.2,9);batch.block(paving,155,-.05,-66,144,.25,13);
  for(let i=0;i<5;i++){const x=103+i*26;
    batch.block(stone,x,-2,-6,17,3.5,112);batch.block(path,x,-.09,-6,17,.3,112);
    batch.block(glass,x,2.1,-4,11,4.1,64);batch.add(roofGeometry,wharfRoof,[x,4.2,-4],[7.3,2.1,34]);
    for(let z=-58;z<=49;z+=13)for(const dx of[-7.2,7.2]){batch.beam(V(x+dx,-10,z),V(x+dx,.2,z),.5,trunk);batch.add(cylinder,navy,[x+dx,.55,z],[.25,.7,.25]);}
    for(let z=-32;z<29;z+=8)for(const dx of[-5.6,5.6])batch.block(white,x+dx,2,z,.15,4,.18);
    const sign=new THREE.PlaneGeometry(5,3.2),uv=sign.getAttribute('uv');for(let j=0;j<uv.count;j++)uv.setX(j,(uv.getX(j)+i)/5);batch.add(sign,signMaterial,[x,4.2,-38]);sign.dispose();
  }
  // 부두 뒤의 고가 철도는 남쪽 코스 바깥에 두어 출입 동선을 가리지 않는다.
  batch.block(stone,154,8,-167,132,2,9);batch.block(steel,154,9.15,-167,132,.22,6);
  for(let x=95;x<=214;x+=17){if(nearestRoad(x,-167).distance<20)continue;batch.block(stone,x,3.5,-167,3,8,5);}
  const boats=[];
  function ferry(x,z,angle=0,scale=1){const g=new THREE.Group();g.position.set(x,-7.9,z);g.rotation.y=angle;g.scale.setScalar(scale);scene.add(g);
    const mb=(geo,mat,p)=>world.mesh(geo,mat,p,null,g);
    mb(new THREE.BoxGeometry(10,2,31),navy,[0,-1,0]);mb(new THREE.BoxGeometry(11,1.4,28),white,[0,.5,0]);mb(new THREE.BoxGeometry(8,3,22),world.material('#356b54'),[0,2.2,0]);mb(new THREE.BoxGeometry(8.4,2,20),glass,[0,4.2,0]);mb(new THREE.BoxGeometry(9,1.1,25),yellow,[0,5.7,0]);mb(new THREE.BoxGeometry(2,2,3),white,[0,7.2,-2]);boats.push({g,x,z,angle,drift:scale>.9?13:0});
    const wake=new THREE.Mesh(new THREE.PlaneGeometry(14,40),new THREE.MeshBasicMaterial({map:world.glowTexture('#d6ffff'),transparent:true,opacity:.28,depthWrite:false}));wake.rotation.x=-Math.PI/2;wake.position.set(0,-1.94,-27);g.add(wake);
  }
  ferry(173,80,.12,.65);ferry(-245,210,1.3,1);ferry(580,320,-.7,.85);ferry(850,-50,2,.7);
  function yacht(x,z,angle,size){const g=new THREE.Group();g.position.set(x,-8.5,z);g.rotation.y=angle;g.scale.setScalar(size);scene.add(g);world.mesh(new THREE.BoxGeometry(3.5,1.4,12),white,[0,-.7,0],null,g);world.mesh(new THREE.CylinderGeometry(.075,.075,17,5),steelLight,[0,8,0],null,g);
    const s=new THREE.BufferGeometry();s.setAttribute('position',new THREE.Float32BufferAttribute([0,1,-4,0,16,0,0,1,6],3));s.computeVertexNormals();const sail=new THREE.Mesh(s,new THREE.MeshStandardMaterial({color:'#fff9e8',side:THREE.DoubleSide}));g.add(sail);boats.push({g,x,z,angle,drift:4});}
  for(let i=0;i<13;i++){let x=-650+rand(i+10)*1750;const z=50+rand(i+50)*475;if(x>-110&&x<130)x-=300;if(x>215&&x<440&&z<230)x+=350;yacht(x,z,rand(i)*6.28,.5+rand(i+3)*.8);}
  // 저층 부두 건물은 뒤로 물리고, 도심 스카이라인은 남쪽에만 둔다.
  const facade=facadeTexture(),cityMat=new THREE.MeshStandardMaterial({map:facade,roughness:.62,metalness:.16});
  for(let i=0;i<27;i++){const x=-550+rand(i+30)*1200,z=-540-rand(i+12)*450,h=24+rand(i+4)*105,w=18+rand(i+9)*28,base=sceneGround(x,z);if(nearestRoad(x,z).distance<Math.hypot(w/2+2,16)+26)continue;batch.block(cityMat,x,base+h/2-.5,z,w,h,28);batch.block(sandLight,x,base+h,z,w+2,1.7,30);batch.block(steelLight,x+w*.17,base+h+2.5,z,w*.35,4,11);for(let k=0;k<3;k++)batch.block(steel,x-w*.23+k*3.2,base+h+1.7,z+5,2.2,2.1,3.2);}
  batch.add(cylinder,steelLight,[180,86,-970],[2.1,172,2.1]);batch.add(cylinder,yellow,[180,178,-970],[13,13,13]);batch.add(cone,steelLight,[180,199,-970],[2,32,2]);
  const housingFootprints=[];
  const terracotta=world.material('#94573f',0,.88),brick=world.material('#ae7960'),cream=world.material('#dac6a4'),roofDark=world.material('#5b6262');
  function groundPatch(x,z,w,d,material){const positions=[],uv=[],indices=[],steps=4;for(let j=0;j<=steps;j++)for(let i=0;i<=steps;i++){const px=x+(i/steps-.5)*w,pz=z+(j/steps-.5)*d;positions.push(px,sceneGround(px,pz)+.19,pz);uv.push(i/steps,j/steps);}for(let j=0;j<steps;j++)for(let i=0;i<steps;i++){const a=j*(steps+1)+i;indices.push(a,a+steps+1,a+1,a+1,a+steps+1,a+steps+2);}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();batch.add(g,material,[0,0,0]);g.dispose();}
  function terraceHouse(x,z,w,d,floors,oldTown=false){const clearance=nearestRoad(x,z).distance-Math.hypot(w+6,d+6)/2-11.5;if(clearance<13||!insideLand(x,z,z>0?northLand:southLand))return;const corners=[[-w/2,-d/2],[w/2,-d/2],[-w/2,d/2],[w/2,d/2]].map(([dx,dz])=>sceneGround(x+dx,z+dz)),base=Math.max(...corners)+.35,h=floors*3.3,low=Math.min(...corners)-.6;batch.block(stone,x,(base+low)/2,z,w+1.6,base-low,d+1.6);batch.block(oldTown?stone:rand(x+z)>.5?cream:brick,x,base+h/2,z,w,h,d);batch.add(roofGeometry,oldTown?roofDark:terracotta,[x,base+h,z],[w*.56,Math.min(4,w*.19),d*.55]);batch.block(brick,x+w*.23,base+h+2,z-d*.22,1.6,4,1.5);
    for(let floor=0;floor<floors;floor++)for(let column=0;column<3;column++){const wx=x+(column-1)*w*.28,wy=base+floor*3.3+1.9;for(const side of[-1,1]){batch.block(sandLight,wx,wy,z+side*(d/2+.08),1.7,2.0,.13);batch.block(glass,wx,wy,z+side*(d/2+.17),1.3,1.65,.08);batch.block(white,wx,wy,z+side*(d/2+.23),.09,1.6,.05);}}
    for(let floor=0;floor<floors;floor++)for(const side of[-1,1])for(const dz of[-d*.23,d*.23]){batch.block(sandLight,x+side*(w/2+.08),base+floor*3.3+1.9,z+dz,.13,2,1.7);batch.block(glass,x+side*(w/2+.17),base+floor*3.3+1.9,z+dz,.08,1.65,1.3);}
    groundPatch(x,z,w+7,d+8,paving);groundPatch(x+w*.25,z-d/2-8,2.8,14,path);const front=z-d/2-1.4;batch.block(oldTown?cream:white,x,base+2.5,front,w+1,.18,2.8);for(const dx of[-w*.4,w*.4])batch.add(cylinder,white,[x+dx,base+1.2,front],[.1,2.4,.1]);housingFootprints.push({x,z,w,d});world.sceneryStats.houses++;world.sceneryStats.minimumBuildingRoadGap=Math.min(world.sceneryStats.minimumBuildingRoadGap,clearance);
  }
  // 키리빌리의 붉은 지붕은 곶의 낮은 층부터 뒤쪽 언덕으로 올라간다.
  for(let row=0;row<5;row++)for(let i=0;i<11;i++)terraceHouse(258+i*37+rand(i+row)*8,635+row*69+rand(i+42)*10,19+rand(i+row+2)*7,20,2+(i%4===0?1:0));
  for(let row=0;row<4;row++)for(let i=0;i<9;i++)terraceHouse(-650+i*48,730+row*86+rand(i+13)*15,23,23,2);
  // 더 록스의 조밀한 테라스 하우스와 사암 기단은 고층 도심 앞에 놓인다.
  for(let row=0;row<4;row++)for(let i=0;i<10;i++)terraceHouse(-430+i*28,-186-row*47,25,24,2+(i%5===0?1:0),true);
  for(const z of[648,720,790,860])for(let x=230;x<660;x+=12){if(nearestRoad(x,z).distance<32)continue;const y=sceneGround(x,z);batch.block(stone,x,y-1,z,12,2.5,1.5);batch.block(sandLight,x,y+.28,z,12.2,.2,1.8);}
  // 창고 부두는 지붕만이 아니라 긴 기단 전체를 검사한다. 피날레 노선이
  // 바뀌면 가까운 서쪽 수면으로 옮겨, 배경 건물을 통과하는 가짜 턱을 막는다.
  world.walshBayWharves=[];
  for(let i=0;i<4;i++){
    let placement=null;
    for(const x of[-640+i*76,-948,-1024,-1100,-1176,-1252]){
      const z=-18,halfWidth=11.2,halfDepth=86;
      if(world.walshBayWharves.some(p=>Math.abs(x-p.x)<70))continue;
      const minimumRoadGap=Math.min(...roadSamples.map(f=>Math.hypot(Math.max(0,Math.abs(f.p.x-x)-halfWidth),Math.max(0,Math.abs(f.p.z-z)-halfDepth))-f.halfWidth))-4.6;
      if(minimumRoadGap<10)continue;
      placement={x,z,halfWidth,halfDepth,minimumRoadGap};break;
    }
    if(!placement)continue;
    const {x,z}=placement;world.walshBayWharves.push(placement);
    batch.block(stone,x,-2,z,22,3.4,172);batch.block(path,x,-.13,z,22,.24,172);batch.block(stone,x,3,z-12,15,6,91);batch.add(roofGeometry,roofDark,[x,6,z-12],[8.4,3,47]);for(let dz=-80;dz<80;dz+=16)for(const dx of[-9,9])batch.beam(V(x+dx,-10,z+dz),V(x+dx,.3,z+dz),.6,trunk);
  }
  world.sceneryStats.walshBayPiers=world.walshBayWharves.length;
  function seaWall(points){for(let j=0;j<points.length-1;j++){const a=V(points[j][0],0,points[j][1]),b=V(points[j+1][0],0,points[j+1][1]),count=Math.ceil(a.distanceTo(b)/8),length=a.distanceTo(b)/count,angle=Math.atan2(b.x-a.x,b.z-a.z);for(let i=0;i<count;i++){const p=a.clone().lerp(b,(i+.5)/count),road=nearestRoad(p.x,p.z),top=Math.max(.6,sceneGround(p.x,p.z)+.6);if(road.distance<19&&top>road.height-2)continue;batch.block(stone,p.x,(top-10)/2,p.z,3.4,top+10,length+.3,angle);batch.block(sandLight,p.x,top+.15,p.z,3.8,.3,length+.35,angle);}}}
  for(const inlet of westInlets)seaWall([...inlet,inlet[0]]);
  seaWall([[-760,-107],[-520,-123],[-305,-143],[-165,-94],[-85,-66]]);
  seaWall([[92,-66],[223,-66],[251,-32],[252,98],[264,195],[372,197],[408,43]]);
  seaWall([[-420,541],[-160,586],[0,551],[124,547],[205,567],[330,597],[420,538],[610,568],[850,643]]);
  for(const x of[-355,-273]){let previous=null;for(let i=0;i<40;i++){const z=-116-i*2.8,y=Math.ceil(Math.max(0,sceneGround(x,z))/.32)*.32+.16;if(nearestRoad(x,z).distance<24)continue;batch.block(stone,x,y-.2,z,8,.4,3);for(const side of[-1,1]){const p=V(x+side*3.8,y+1,z);batch.beam(V(p.x,y,p.z),p,.07,steelLight);if(previous)batch.beam(V(p.x,previous.y+1,previous.z),p,.07,steelLight);}previous={y,z};}}
  // 베넬롱의 남쪽 넓은 계단은 반도의 밝은 포장 테라스로 이어진다.
  for(let i=0;i<12;i++)batch.block(sandLight,320,i*.24+.12,10+i*1.85,132-i*.6,.3,2.4);
  // 유칼립투스와 무화과나무의 가지·겹수관을 여러 덩어리로 만든다.
  function tree(x,z,h,flower=false){if(westInlets.some(inlet=>insideLand(x,z,inlet)))return;if(!insideLand(x,z,x<-700?westLand:z>500?northLand:southLand))return;const road=nearestRoad(x,z);if(road.distance<26||housingFootprints.some(b=>Math.abs(x-b.x)<b.w/2+5&&Math.abs(z-b.z)<b.d/2+5))return;const berm=Math.max(-.38,road.height*(1-THREE.MathUtils.smoothstep(road.distance,19,70))-.48),y=Math.max(berm,sceneGround(x,z));batch.add(cylinder,trunk,[x,y+h*.36,z],[.38,h*.72,.38]);for(let k=0;k<5;k++){const a=k*2.399+rndTree(x,z),r=1.5+rand(k+x)*1.8,tx=x+Math.sin(a)*r,tz=z+Math.cos(a)*r,ty=y+h*(.7+rand(k+z)*.23);batch.beam(V(x,y+h*.35,z),V(tx,ty-1,tz),.15,trunk);batch.add(sphere,flower?world.material('#9e84b4'):k%2?leaf:leafLight,[tx,ty,tz],[2.5+rand(k+x)*1.2,2+rand(k+z)*1.1,2.6+rand(k+x+z)]);}}
  function rndTree(x,z){return rand(x+z)*6.28;}
  for(let i=0;i<housingFootprints.length;i++){const h=housingFootprints[i];if(i%2===0)tree(h.x+(rand(i+207)-.5)*9,h.z-h.d/2-14,8+rand(i+205)*4);}
  for(let i=0;i<125;i++){let x,z;if(i<70){x=-380+rand(i+7)*1050;z=-570+rand(i+55)*170;}else{x=-480+rand(i+7)*1150;z=910+rand(i+55)*170;}tree(x,z,9+rand(i+2)*6);}
  function parkPath(points,width=5){const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>V(x,0,z))),positions=[],indices=[];for(let i=0;i<=120;i++){const p=curve.getPointAt(i/120),t=curve.getTangentAt(i/120),right=V(-t.z,0,t.x);for(const side of[-1,1]){const v=p.clone().addScaledVector(right,side*width/2);positions.push(v.x,sceneGround(v.x,v.z)+.11,v.z);}if(i<120&&nearestRoad(p.x,p.z).distance>20&&insideLand(p.x,p.z,p.z>500?northLand:southLand)){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();batch.add(g,path,[0,0,0]);g.dispose();}
  parkPath([[510,-190],[650,-255],[730,-380],[650,-530],[440,-620],[230,-570]],5);
  parkPath([[650,-165],[815,-350],[820,-610],[620,-745]],4);
  parkPath([[-780,740],[-550,690],[-360,710],[-240,875]],4);
  for(let i=0;i<32;i++)tree(585+rand(i+480)*265,-180-rand(i+930)*560,10+rand(i+120)*8,i%9===0);
  // 가든의 높은 쪽에는 숲, 바다 쪽에는 낮은 화단을 둬 전망을 열어 둔다.
  for(let i=0;i<45;i++){const d=world.length*(.685+i*.0062),f=world.frameAt(d,-27-rand(i+38)*20);if(!promenadeAt(world,d))continue;tree(f.p.x,f.p.z,8+rand(i+40)*7,i%7===0);}
  // 가든 구간에 자카란다, 전망 벤치와 경주 깃발로 거리의 척도를 준다.
  const jacaranda=world.material('#a887bc');
  for(let i=0;i<16;i++){const d=world.length*.72+i*world.length*.014,f=world.frameAt(d,25+(i%2)*5);if(f.p.z>0||!promenadeAt(world,d))continue;tree(f.p.x,f.p.z,9,i%3===0);}
  for(let d=0;d<world.length;d+=70){if(!promenadeAt(world,d))continue;const f=world.frameAt(d);if(f.p.z>30&&f.p.z<580&&f.p.x<100)continue;for(const side of[-1,1]){const p=world.frameAt(d,side*(world.roadHalfWidthAt(d)+5.5)).p;batch.beam(V(p.x,p.y,p.z),V(p.x,p.y+5.8,p.z),.07,white);const q=new THREE.Quaternion().setFromAxisAngle(UP,Math.atan2(f.tangent.x,f.tangent.z));batch.add(box,side<0?world.material('#ef7955'):world.material('#4fbec5'),[p.x,p.y+4.3,p.z],[.06,2.7,1],q);}}
  for(let i=0;i<19;i++){const d=world.length*.55+i*world.length*.021,f=world.frameAt(d,21),yaw=Math.atan2(f.tangent.x,f.tangent.z),q=new THREE.Quaternion().setFromAxisAngle(UP,yaw);if(f.p.z>30||!promenadeAt(world,d))continue;batch.add(box,trunk,[f.p.x,f.p.y+.75,f.p.z],[3.3,.18,1],q);batch.add(box,trunk,[f.p.x,f.p.y+1.35,f.p.z+.48],[3.3,.8,.12],q);for(const side of[-1,1])batch.block(steel,f.p.x+side*1.2,f.p.y+.36,f.p.z,.15,.72,.65);}
  for(let i=0;i<7;i++){const x=198+i*14,z=-183;batch.add(cylinder,white,[x,1,z],[1.5,.15,1.5]);batch.add(cylinder,steelLight,[x,1.7,z],[.07,3.4,.07]);batch.add(cone,i%2?white:world.material('#e99767'),[x,3.8,z],[3.4,1.1,3.4]);}
  // 사암 해안과 낮은 너울. 주행 공간 바깥, 수면 가까이에만 놓는다.
  const shore=[[-750,-105],[-300,-140],[-80,-65],[95,-65],[223,-65],[250,-32],[250,98],[263,196],[372,196],[407,43],[445,-32],[490,-120],[580,-190],[780,-330]];
  const rock=world.material('#ab957d'),wetRock=world.material('#776f61',0,.76);
  for(let j=0;j<shore.length-1;j++){const a=V(shore[j][0],-8,shore[j][1]),b=V(shore[j+1][0],-8,shore[j+1][1]),steps=Math.ceil(a.distanceTo(b)/9);for(let i=0;i<steps;i++){const p=a.clone().lerp(b,i/steps);batch.add(sphere,i%3?rock:wetRock,[p.x+rand(i+j)*4,-7.9+rand(i+35)*1.8,p.z+rand(i+61)*4],[3+rand(i+j)*4,1.5+rand(i+13)*2,3+rand(i+44)*3]);}}
  // 구역마다 화단·산책객·앉을 곳을 다르게 배치한다.
  const flower=world.material('#d990ba'),goldFlower=world.material('#e2bc62'),skin=world.material('#cca487'),shirt=world.material('#557e97'),coral=world.material('#c98368');
  for(let i=0;i<22;i++){const d=world.length*(.68+i*.011),f=world.frameAt(d,20),y=f.p.y,angle=Math.atan2(f.tangent.x,f.tangent.z);if(!promenadeAt(world,d))continue;batch.block(stone,f.p.x,y+.25,f.p.z,2.8,.8,7,angle);for(let k=0;k<6;k++){const p=f.p.clone().addScaledVector(f.tangent,(k-2.5));batch.add(sphere,k%2?leaf:leafLight,[p.x,y+1.0,p.z],[1.25,.75,1.0]);batch.add(sphere,i%3?flower:goldFlower,[p.x+.4,y+1.58,p.z],[.22,.2,.25]);}}
  for(let i=0;i<35;i++){const d=world.length*(i<20?.56+i*.005:.22+(i-20)*.006),f=world.frameAt(d,18.8+rand(i+3)*3),x=f.p.x,z=f.p.z,y=f.p.y;if(!promenadeAt(world,d))continue;batch.add(cylinder,i%2?shirt:coral,[x,y+1.1,z],[.29,.85,.23]);batch.add(sphere,skin,[x,y+1.77,z],[.22,.26,.22]);for(const side of[-1,1]){batch.beam(V(x+side*.14,y+.68,z),V(x+side*.18,y+.08,z),.09,navy);batch.beam(V(x+side*.25,y+1.38,z),V(x+side*.40,y+.83,z+.08),.09,skin);}}
  for(let d=world.features.find(f=>f.id==='rocks-run')?.end??world.length;d<world.length-250;d+=115){
    if(!promenadeAt(world,d))continue;const frame=world.frameAt(d),side=Math.sin(d*.01)>0?1:-1,p=world.frameAt(d,side*(32+rand(d)*30)).p;
    tree(p.x,p.z,9+rand(d+4)*8,d%460<115);
    const q=world.frameAt(d+30,-side*26).p;
    batch.block(stone,q.x,q.y+.6,q.z,3,1.2,5,Math.atan2(frame.tangent.x,frame.tangent.z));
  }
  buildHarbourFinaleDetail(world,{stone,sandLight,path,navy,white,steel},batch);
  batch.finish();
  buildRacingSetpieces(world);
  addCoastalLandmarks(world);
  buildMarathonBanks(world);
  buildSnowLandscape(world,HarbourBatch);
  buildMarathonArchitecture(world);
  addMarathonLandmarks(world);
  buildDesertLandscape(world,HarbourBatch);
  buildCourseLandscape(world,HarbourBatch);
  // 수면, 배의 흔들림, 갈매기를 렌더링 프레임과 함께 움직인다.
  const birdPositions=[],birdGeo=new THREE.BufferGeometry();for(let i=0;i<12;i++){const x=170+rand(i)*500,y=38+rand(i+4)*50,z=rand(i+9)*480;birdPositions.push(x-1.3,y,z,x,y-.35,z,x,y-.35,z,x+1.3,y,z);}birdGeo.setAttribute('position',new THREE.Float32BufferAttribute(birdPositions,3));const birds=new THREE.LineSegments(birdGeo,new THREE.LineBasicMaterial({color:'#f7f7ed'}));scene.add(birds);
  world.updateScenery=(time)=>{water.uniforms.time.value=time;for(let i=0;i<boats.length;i++){const b=boats[i];b.g.position.y=-7.9+Math.sin(time*.8+i)*.15;b.g.rotation.z=Math.sin(time*.65+i)*.012;b.g.position.x=b.x+Math.sin(time*.018+i)*b.drift;b.g.position.z=b.z+Math.cos(time*.018+i)*b.drift;}birds.position.x=Math.sin(time*.035)*25;birds.position.z=Math.cos(time*.035)*20;};
}

// 코스 장치는 지역 풍경과 별도로 재질별 결합한다. 화면을 가리는 소품 대신
// 진입선·탈출선·착지 지점을 실제 거리와 정확히 맞춰 속도에서도 읽히게 한다.
function buildRacingSetpieces(world){
  const batch=new HarbourBatch(world.scene),features=world.features;
  const navy=world.material('#102537',.58,.42),steel=world.material('#41616d',.6,.4);
  const pale=new THREE.MeshStandardMaterial({color:'#7898a5',map:world.roadTexture,roughness:.62,metalness:.18,emissive:'#163b4b',emissiveIntensity:.2}),white=world.material('#edf6e8',0,.64);
  const cyan=new THREE.MeshBasicMaterial({color:'#42dfea',toneMapped:false}),ice=new THREE.MeshBasicMaterial({color:'#b9fff1',toneMapped:false});
  const magenta=new THREE.MeshBasicMaterial({color:'#d685e6'}),amber=new THREE.MeshBasicMaterial({color:'#ffc65c'});
  const shell=new THREE.MeshStandardMaterial({color:'#18384b',roughness:.52,metalness:.25,emissive:'#173951',emissiveIntensity:.74,side:THREE.DoubleSide});
  const tunnelPanelA=new THREE.MeshStandardMaterial({color:'#24556b',roughness:.5,metalness:.35,emissive:'#123c56',emissiveIntensity:.62,side:THREE.DoubleSide});
  const tunnelPanelB=new THREE.MeshStandardMaterial({color:'#254c65',roughness:.62,metalness:.3,emissive:'#132d46',emissiveIntensity:.7,side:THREE.DoubleSide});
  const point=(d,side=0,height=0)=>world.frameAt(d,side).p.add(V(0,height,0));
  const roadPatch=(start,end,left,right,material,height=.055)=>world.ribbon(left,right,height,material,{start:start/world.length,end:end/world.length});
  const floorChevron=(d,color,width=7)=>{
    const p=world.frameAt(d),positions=[];
    const local=[[-width,-3],[-width,0],[0,4],[width,0],[width,-3],[0,1]];
    for(const i of[0,1,5,1,2,5,2,3,5,3,4,5]){const [side,ahead]=local[i],v=p.p.clone().addScaledVector(p.right,side).addScaledVector(p.tangent,ahead);v.y+=.095;positions.push(v.x,v.y,v.z);}
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.computeVertexNormals();color.side=THREE.DoubleSide;batch.add(g,color,[0,0,0]);g.dispose();
  };
  const edgePosts=(start,end,material,step=12,height=2.8)=>{
    for(let d=start;d<=end;d+=step)for(const side of[-1,1]){
      if(sceneryGapIntersects(world,d))continue;
      const a=point(d,side*(world.roadHalfWidthAt(d)+.75)),b=a.clone().add(V(0,height,0));batch.beam(a,b,.11,steel);batch.beam(a.clone().add(V(0,height-.55,0)),b,.15,material);
    }
  };
  const tunnels=features.filter(f=>f.type==='tunnel');
  for(const tunnel of tunnels){
    const reef=tunnel.theme==='reef-glass',tunnelLight=reef?new THREE.MeshBasicMaterial({color:'#ffbd76',toneMapped:false}):cyan;
    const glazing=reef?new THREE.MeshStandardMaterial({color:'#8bc6c9',roughness:.18,metalness:.16,transparent:true,opacity:.17,depthWrite:false,side:THREE.DoubleSide}):shell;
    if(reef)glazing.userData.noShadow=true;
    const {start,end}=tunnel,stops=Math.ceil((end-start)/5.5),cross=[[-13.25,.15],[-13.25,7.8],[-9.9,11.6],[9.9,11.6],[13.25,7.8],[13.25,.15]];
    // 넓은 입구가 실제 가속 구간 안에서 좁아지는 원근 깔때기다. 주행 폭은
    // 그대로 두고 벽·프레임·광선만 함께 축소해 입구가 막혀 보이지 않는다.
    const portalScale=d=>1+.58*(1-THREE.MathUtils.smoothstep(d,start,start+90));
    const tunnelPoint=(d,side=0,height=0)=>point(d,side*portalScale(d),height*portalScale(d));
    const positions=[],indices=[],uv=[];
    for(let i=0;i<=stops;i++){
      const d=start+(end-start)*i/stops;
      for(const [side,height]of cross){const p=tunnelPoint(d,side,height);positions.push(p.x,p.y,p.z);uv.push(side/27,d/20);}
      if(i<stops)for(let j=0;j<cross.length-1;j++){if(reef&&j===2&&Math.floor((d-start)/26)%3!==0)continue;const a=i*cross.length+j;indices.push(a,a+cross.length,a+1,a+1,a+cross.length,a+cross.length+1);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();batch.add(geometry,glazing,[0,0,0]);geometry.dispose();
    roadPatch(start,end,-11.15,11.15,pale,.043);
    for(let d=start;d<end;d+=5.5){
      const next=Math.min(d+5.5,end);
      for(const side of[-1,1]){
        // 바닥의 두 연속 가이드와 천장의 평행 광선은 코너 출구까지 이어진다.
        for(const height of[.55,4.65])batch.beam(tunnelPoint(d,side*13.03,height),tunnelPoint(next,side*13.03,height),height<1?.23:.14,tunnelLight);
        batch.beam(tunnelPoint(d,side*8.9,11.3),tunnelPoint(next,side*8.9,11.3),.13,tunnelLight);
      }
    }
    // 불이 꺼진 검은 빈 공간처럼 보이지 않도록 청색 내장 패널과 통풍구를 구분한다.
    for(let d=start+1;!reef&&d<end-4;d+=10.5){
      const next=Math.min(d+8.2,end-.3),material=Math.floor((d-start)/10.5)%2?tunnelPanelA:tunnelPanelB;
      for(const side of[-1,1]){
        const vertices=[tunnelPoint(d,side*13.11,1.3),tunnelPoint(next,side*13.11,1.3),tunnelPoint(d,side*13.11,4.15),tunnelPoint(next,side*13.11,4.15)];
        const panel=new THREE.BufferGeometry();panel.setAttribute('position',new THREE.Float32BufferAttribute(vertices.flatMap(p=>p.toArray()),3));panel.setIndex([0,1,2,1,3,2]);panel.computeVertexNormals();batch.add(panel,material,[0,0,0]);panel.dispose();
        for(const h of[5.35,5.72,6.09])batch.beam(tunnelPoint(d+1,side*13.04,h),tunnelPoint(next-1,side*13.04,h),.07,steel);
        batch.beam(tunnelPoint(d+1,side*12.97,2.65),tunnelPoint(d+3.6,side*12.97,2.65),.16,tunnelLight);
      }
    }
    for(let d=start+3;d<end-5;d+=12){
      for(const side of[-5.7,5.7])roadPatch(d,d+5,side-.09,side+.09,ice,.064);
    }
    for(let d=start;d<=end;d+=10.5){
      const atEnd=d> end-15,material=d<start+15||atEnd?magenta:tunnelLight;
      for(let i=0;i<cross.length-1;i++){
        const a=cross[i],b=cross[i+1];batch.girder(tunnelPoint(d,a[0],a[1]),tunnelPoint(d,b[0],b[1]),.38,steel);
        if(i>0&&i<4)batch.beam(tunnelPoint(d-.22,a[0]*.985,a[1]-.12),tunnelPoint(d-.22,b[0]*.985,b[1]-.12),.07,material);
      }
      for(const side of[-1,1]){batch.beam(tunnelPoint(d,side*12.85,1.4),tunnelPoint(d+3,side*12.85,2.5),.1,tunnelLight);}
    }
    // 입구와 출구의 겹 문틀은 어두운 내부를 일찍 인식하게 한다.
    for(const d of[start-2,start,end,end+2])for(let i=0;i<cross.length-1;i++){
      const a=cross[i],b=cross[i+1];batch.girder(tunnelPoint(d,a[0],a[1]),tunnelPoint(d,b[0],b[1]),.8,navy);batch.beam(tunnelPoint(d-.5,a[0],a[1]),tunnelPoint(d-.5,b[0],b[1]),.11,tunnelLight);
    }
    for(const [index,offset] of [-7,0,13,29].entries()){
      const d=start+offset;
      for(let j=0;j<cross.length-1;j++){
        const a=cross[j],b=cross[j+1];batch.girder(tunnelPoint(d,a[0],a[1]),tunnelPoint(d,b[0],b[1]),.65,navy);
        batch.beam(tunnelPoint(d-.45,a[0]*1.01,a[1]),tunnelPoint(d-.45,b[0]*1.01,b[1]),index%2?.16:.24,index%2?ice:cyan);
      }
    }
    roadPatch(start,end,-10.9,-10.55,tunnelLight,.06);roadPatch(start,end,10.55,10.9,tunnelLight,.06);
    world.makeGate(start-82,`초고속 진입 · ${tunnel.label}`,'#8effff');
    floorChevron(start-52,tunnelLight,6);floorChevron(end-22,ice,6);
    for(let d=start+45;d<end-35;d+=66)floorChevron(d,ice,4.4);
  }
  // 긴 터널은 부스터를 유지하는 구간이다. 출구 뒤 150m부터 점점 촘촘해지는
  // 제동선으로 다음 코너를 예고하고, 좁은 구간은 실제 도로 폭까지 함께 줄인다.
  for(const braking of features.filter(f=>f.type==='braking')){
    world.makeGate(braking.start+15,'감속 · 연속 코너 준비','#ffd481');
    for(const offset of[28,60,86,108,126,140]){
      const d=braking.start+offset;roadPatch(d,d+1.2,-10.9,10.9,amber,.065);
    }
    for(const offset of[30,80,130]){
      const d=braking.start+offset,remaining=Math.max(0,Math.round((braking.end-d)/10)*10);
      for(const side of[-1,1]){
        const p=point(d,side*(world.roadHalfWidthAt(d)+2),3.2),f=world.frameAt(d);
        const board=world.mesh(new THREE.PlaneGeometry(3.7,2.1),new THREE.MeshBasicMaterial({map:world.labelTexture(`${remaining} m`,'#ffd481'),side:THREE.DoubleSide}),p.toArray());
        board.lookAt(p.clone().addScaledVector(f.tangent,-20));
      }
    }
  }
  for(const precise of features.filter(f=>f.type==='precision')){
    world.makeGate(precise.start-48,precise.label,'#ffd481');
    const count=Math.ceil((precise.end-precise.start+80)/5);
    for(let i=0;i<count;i++){
      const d=precise.start-40+i*5;
      // 실제 폭을 따르는 기본 가드레일 위에 다른 간격의 I형 보를 겹치면
      // 윗면이 검정·분홍 톱니처럼 드러난다. 협로 표시는 노면과 진입 표지가 맡는다.
      if(i%5===0&&!sceneryGapIntersects(world,d-4,d+4))floorChevron(d,white,2.3);
    }
  }
  for(const jump of features.filter(f=>f.type==='jump'||f.type==='gap')){
    const start=jump.launchStart??jump.start,end=jump.end,isGap=jump.type==='gap',isOcean=jump.id==='harbour-flight'||jump.id==='coast-flight';
    edgePosts(start-65,end+25,amber,10,3.3);
    // 일반 점프는 연속 상판, 부스터 갭은 지지대까지 실제로 끊긴 데크다.
    for(let d=start-60;d<end+12;d+=8){
      const next=Math.min(d+8,end+12);
      if(sceneryGapIntersects(world,d,next))continue;
      for(const side of[-1,1]){
        batch.girder(point(d,side*12.5,-.35),point(next,side*12.5,-.35),.75,navy);
        batch.beam(point(d,side*12.5,.8),point(next,side*12.5,.8),.10,white);
        if(isOcean&&d%16<8){batch.beam(point(d,side*11.7,-.7),V(...point(d,side*11.7,-.7).toArray()).setY(-9),.55,steel);}
      }
      if(isOcean){batch.girder(point(d,-12.6,-.75),point(d,12.6,-.75),1.2,navy);}
    }
    for(const offset of[-50,-34,-18])floorChevron(start+offset,amber);
    roadPatch(start-2,start+1.5,-11,11,amber,.07);
    roadPatch(start-8,start-5,-11,11,navy,.055);
    // 황색 이륙선과 흰 착지선은 마하 가속을 뜻하는 파란 패드와 구분한다.
    for(let d=isGap?end+3:end-17;d<end+28;d+=6){roadPatch(d,d+2,-10.6,-6.8,white,.06);roadPatch(d,d+2,6.8,10.6,white,.06);}
    floorChevron(isGap?end+9:end-5,white,5.5);
    world.makeGate(start-74,jump.label,'#ffd481');
    // 조형물은 안전 난간 바깥에 놓아 항만 수평선을 계속 볼 수 있다.
    if(isOcean)for(const side of[-1,1])for(let i=0;i<3;i++){
      const d=start-10+i*31,a=point(d,side*(17+i*2),0),b=a.clone().add(V(side*4,14-i*2,0));batch.girder(a,b,1.5,steel);batch.beam(a.clone().add(V(0,2,0)),b,.20,i===1?magenta:cyan);
    }
  }
  for(const technical of features.filter(f=>f.type==='technical')){
    world.makeGate(technical.start-42,technical.label,'#ffd481');
    for(let d=technical.start;d<technical.end;d+=6){
      const bend=world.turnRateAt(d);if(Math.abs(bend)<.01)continue;
      const side=-Math.sign(bend),next=Math.min(d+6,technical.end);
      batch.girder(point(d,side*(world.roadHalfWidthAt(d)+.5),.9),point(next,side*(world.roadHalfWidthAt(next)+.5),.9),.7,Math.floor(d/12)%2?navy:amber);
    }
  }
  for(const hairpin of features.filter(f=>f.type==='hairpin')){
    const {start,end}=hairpin,sign=hairpin.direction||1;
    world.makeGate(start-55,hairpin.label,'#ffd481');
    for(const offset of[-44,-29,-17]){
      roadPatch(start+offset,start+offset+1.8,-10.8,10.8,amber,.05);
    }
    // 바깥쪽 경고벽과 안쪽 적백 연석이 같은 코너의 반지름을 보여 준다.
    const count=Math.ceil((end-start)/4.5);
    for(let i=0;i<count;i++){
      const d=start+(end-start)*i/count,next=start+(end-start)*(i+1)/count;
      // 피날레의 반대 방향 헤어핀 세 개는 각각 실제 곡률을 따라 표시한다.
      const direction=hairpin.rhythm==='reverse'?(Math.sign(world.turnRateAt(d))||sign):sign;
      const outer=-direction*(world.roadHalfWidthAt(d)+.5);
      batch.girder(point(d,outer,.7),point(next,outer,.7),.85,i%2?navy:amber);
      roadPatch(d,next,direction>0?9.7:-11,direction>0?11:-9.7,i%2?white:world.material('#df644e'),.035);
    }
    edgePosts(start,end,amber,8,2.2);
    // 코너 중앙의 낮은 잔디섬과 경기 기둥은 U자 회전을 한눈에 보여 준다.
    if(hairpin.id==='north-finger'){
      const middle=world.frameAt((start+end)/2),p=middle.p.clone().addScaledVector(middle.right,sign*30);
      batch.add(cylinder,navy,[p.x,p.y+2,p.z],[5.3,4,5.3]);batch.add(cylinder,cyan,[p.x,p.y+4.15,p.z],[5.5,.2,5.5]);
      batch.add(cylinder,steel,[p.x,p.y+10,p.z],[.65,12,.65]);
      const halo=new THREE.TorusGeometry(4.9,.14,6,36);batch.add(halo,amber,[p.x,p.y+15,p.z],[1,1,1],new THREE.Quaternion().setFromAxisAngle(V(1,0,0),Math.PI/2));halo.dispose();
    }
  }
  world.sceneryStats.tunnelLength=Math.round(tunnels.reduce((total,tunnel)=>total+tunnel.end-tunnel.start,0));
  world.sceneryStats.tunnelCount=tunnels.length;
  world.sceneryStats.jumpCount=features.filter(f=>f.type==='jump').length;
  world.sceneryStats.gapCount=features.filter(f=>f.type==='gap').length;
  world.sceneryStats.hairpinCount=features.filter(f=>f.type==='hairpin').length;
  batch.finish();
}


// 해안은 좁은 암반 띠, 설산은 흰 설벽, 천공 항만은 얇은 강철 데크다.
// 구멍에는 바닥 삼각형을 만들지 않아 노면 아래에도 실제 바다가 드러난다.
export function buildMarathonBanks(world){
  const meshes=[];
  for(const zone of courseZones(world)){
    if(!['reef','factory','snow','sky'].includes(zone.type))continue;
    const start=zone.start,end=zone.end;
    const bank=new THREE.Color(zone.color||'#ad9775'),top=new THREE.Color(zone.groundColor||'#ad9f7c');
    const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.9,metalness:zone.type==='sky'?.35:0,side:THREE.DoubleSide});
    for(let chunkStart=start;chunkStart<end;chunkStart+=500){
      const chunkEnd=Math.min(end,chunkStart+500),steps=Math.ceil((chunkEnd-chunkStart)/4),positions=[],colors=[],indices=[];
      for(let i=0;i<=steps;i++){
        const d=chunkStart+(chunkEnd-chunkStart)*i/steps,f=world.frameAt(d),width=world.roadHalfWidthAt(d);
        const wave=Math.sin(d*.021)*2.2+Math.sin(d*.061)*.9;
        const outer=zone.type==='sky'?width+3:zone.type==='factory'?width+9:width+15+wave;
        const bottom=zone.type==='sky'?f.p.y-2.1:-10.3;
        const foot=zone.type==='sky'||zone.type==='factory'?.3:7+Math.sin(d*.032)*2;
        const profile=[[-outer-foot,bottom],[-outer,f.p.y-.65],[-width-1,f.p.y-.3],[width+1,f.p.y-.3],[outer,f.p.y-.65],[outer+foot,bottom]];
        for(let j=0;j<profile.length;j++){
          const [off,y]=profile[j],p=f.p.clone().addScaledVector(f.right,off);p.y=y;positions.push(p.x,p.y,p.z);
          const c=(j===0||j===1||j===4||j===5?bank:top).clone();
          const shade=j===0||j===5?.65:1+(zone.type==='sky'?0:Math.sin(d*.12)*.035+Math.sin(d*.041)*.025);c.multiplyScalar(shade);colors.push(c.r,c.g,c.b);
        }
        const next=chunkStart+(chunkEnd-chunkStart)*(i+1)/steps;
        if(i<steps&&!sceneryGapIntersects(world,d,next))for(let j=0;j<5;j++){const a=i*6+j;indices.push(a,a+1,a+6,a+1,a+7,a+6);}
      }
      const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();geometry.computeBoundingSphere();
      const mesh=new THREE.Mesh(geometry,material);mesh.name=`${zone.id}-bank`;mesh.receiveShadow=true;mesh.userData={start:chunkStart,end:chunkEnd,steps,bank:true};world.scene.add(mesh);meshes.push(mesh);
      (world.scene.userData.harbourChunks??=[]).push({mesh,bounds:geometry.boundingSphere});
    }
  }
  world.marathonBankMeshes=meshes;return meshes;
}

// 도로 바로 옆의 벽과 천장이 압박→개방→재진입을 만든다. 모든 기둥은
// 주행 경계에서 2m 이상 밖에 두고 상층 분기·갭 주변은 구조물을 비운다.
export function buildMarathonArchitecture(world){
  const batch=new HarbourBatch(world.scene),stats={factoryModules:0,snowWalls:0,iceArches:0,skySupports:0,minimumStructureRoadGap:Infinity};
  const steel=world.material('#354b50',.48,.57),rib=world.material('#849895',.36,.52),copper=world.material('#c98b5c',.36,.38),wall=world.material('#577465',.2,.8),dark=world.material('#29383e',.3,.65);
  const snow=world.material('#eff7f7',0,.94),ice=world.material('#8eb5ca',.12,.68),iceLight=world.material('#b4dbe4',.1,.6),iceDeep=world.material('#6692b2',.1,.72),rock=world.material('#768b9a',0,.92),amber=new THREE.MeshBasicMaterial({color:'#ffcf79'}),white=new THREE.MeshBasicMaterial({color:'#efffff'});
  for(const material of [steel,rib,copper,wall,dark,snow,ice,iceLight,iceDeep,rock,amber,white])material.userData.noShadow=true;
  const point=(d,offset=0,height=0)=>world.frameAt(d,offset).p.add(V(0,height,0));
  const clear=(start,end)=>!world.features.some(f=>['gap','shortcut'].includes(f.type)&&start<f.end+65&&end>f.start-100);
  const quad=(a,b,c,d,material)=>{const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute([a,b,c,b,d,c].flatMap(p=>p.toArray()),3));geometry.computeVertexNormals();material.side=THREE.DoubleSide;batch.add(geometry,material,[0,0,0]);geometry.dispose();};
  for(const zone of courseZones(world)){
    if(zone.type==='factory'){
      world.makeGate(zone.start+30,'캐니언 팩토리 · 벽 사이 연속 드리프트','#ffd38a');
      // 상층 진입 앞의 남는 길이에 맞춰 공장 실내 길이를 줄인다.
      // 고정 185m를 요구하면 압축된 팩토리 구역의 실내가 통째로 빠진다.
      for(let start=zone.start+65;start<zone.end-90;start+=390){
        let end=Math.min(start+185,zone.end-20);
        for(const feature of world.features)if(['gap','shortcut'].includes(feature.type)&&feature.start-100>start)end=Math.min(end,feature.start-100);
        if(end-start<70||!clear(start,end))continue;
        stats.factoryModules++;
        for(let d=start;d<end;d+=5){
          const next=Math.min(d+5,end),w=world.roadHalfWidthAt(d)+2.5,wn=world.roadHalfWidthAt(next)+2.5;
          const height=13.8+Math.sin((d-start)/185*Math.PI)*1.5;
          for(const side of[-1,1]){
            quad(point(d,side*w,-.4),point(next,side*wn,-.4),point(d,side*w,height),point(next,side*wn,height),wall);
            if(Math.floor((d-start)/5)%4===0){
              // 리브와 기계 패널은 벽의 실내 면에 붙여 주행 시에도 보이게 한다.
              batch.beam(point(d,side*(w-.25),.3),point(d,side*(w-.25),height+.1),.22,rib);
              const panelAt=(at,h)=>point(at,side*(world.roadHalfWidthAt(at)+2.38),h);
              quad(panelAt(d+1,3.4),panelAt(d+4.4,3.4),panelAt(d+1,8.8),panelAt(d+4.4,8.8),dark);
              for(const h of[4.1,4.9,5.7,6.5])quad(panelAt(d+1.3,h),panelAt(d+4.1,h),panelAt(d+1.3,h+.14),panelAt(d+4.1,h+.14),rib);
              quad(panelAt(d+1.2,7.4),panelAt(d+2.5,7.4),panelAt(d+1.2,8),panelAt(d+2.5,8),amber);
            }
            if(Math.floor((d-start)/5)%2===0)batch.beam(point(d,side*(w-.12),1.35),point(next,side*(wn-.12),1.35),.09,amber);
            batch.beam(point(d,side*(w-.6),height-1.7),point(next,side*(wn-.6),height-1.7),.5,copper);
          }
          quad(point(d,-w,height),point(next,-wn,height),point(d,w,height),point(next,wn,height),dark);
          for(const side of[-1,1])quad(point(d,side*5-.12,height-.2),point(next,side*5-.12,height-.2),point(d,side*5+.12,height-.2),point(next,side*5+.12,height-.2),white);
          if(Math.floor((d-start)/5)%5===0)batch.beam(point(d,-w+1,height-.15),point(d,w-1,height-.15),.07,white);
          stats.minimumStructureRoadGap=Math.min(stats.minimumStructureRoadGap,2.5);
        }
        for(const d of[start,end]){const w=world.roadHalfWidthAt(d)+2.6;batch.girder(point(d,-w,0),point(d,-w,14),.55,steel);batch.girder(point(d,w,0),point(d,w,14),.55,steel);batch.girder(point(d,-w,14),point(d,w,14),.55,steel);}
      }
    }
    if(zone.type==='snow'){
      world.makeGate(zone.start+35,'화이트 리지 · 설벽과 절벽 도약','#f2ffff');
      for(let d=zone.start;d<zone.end;d+=6){
        const next=Math.min(d+6,zone.end);if(!clear(d,next))continue;
        const w=world.roadHalfWidthAt(d)+2.8,wn=world.roadHalfWidthAt(next)+2.8,height=9+4*Math.sin(d*.021)**2,nextHeight=9+4*Math.sin(next*.021)**2;
        const side=Math.sin(d*.002)>0?1:-1;
        const a=point(d,side*w,-.8),b=point(next,side*wn,-.8),c=point(d,side*(w+.8),height*.52),e=point(next,side*(wn+.8),nextHeight*.52),f=point(d,side*(w+2),height),g=point(next,side*(wn+2),nextHeight);
        // 가운데 돌출 능선과 세 가지 얼음면 명암으로 매끈한 성벽을 피한다.
        quad(a,b,c,e,Math.floor(d/36)%2?iceDeep:ice);quad(c,e,f,g,Math.floor(d/24)%2?ice:iceLight);
        quad(f,g,point(d,side*(w+10),height+3),point(next,side*(wn+10),nextHeight+3),snow);
        if(Math.floor(d/6)%13===0){const crystal=point(d,side*(w+6),height+2);batch.add(cone,iceLight,crystal.toArray(),[2.4,7.5,2.1],new THREE.Quaternion().setFromAxisAngle(V(0,0,1),side*.24));}
        stats.snowWalls++;stats.minimumStructureRoadGap=Math.min(stats.minimumStructureRoadGap,2.8);
        // 짧은 얼음 아치는 다음 열린 설벽 구간이 양 끝에서 보이는 길이만 덮는다.
        const cave=world.features.find(feature=>feature.theme==='ice-tunnel'&&d>=feature.start&&d<feature.end);
        if(cave){
          const cross=[[-1,0],[-1,7.8],[-.68,13.7],[0,16.5],[.68,13.7],[1,7.8],[1,0]];
          for(let j=0;j<cross.length-1;j++){
            const [x,h]=cross[j],[xx,hh]=cross[j+1];
            quad(point(d,x*w,h),point(next,x*wn,h),point(d,xx*w,hh),point(next,xx*wn,hh),j%2?ice:iceLight);
          }
          if(Math.floor(d/6)%4===0){
            for(const s of[-1,1]){
              batch.beam(point(d,s*(w-.15),1.1),point(next,s*(wn-.15),1.1),.1,white);
              const icicle=point(d,s*w*.53,14.3);batch.add(cone,iceLight,icicle.toArray(),[.4,2.4,.4],new THREE.Quaternion().setFromAxisAngle(V(1,0,0),Math.PI));
            }
            stats.iceArches++;
          }
        }
      }
      const road=world.samples.filter((_,i)=>i%4===0);
      for(const route of world.routes||[])for(let d=route.start;d<=route.end;d+=6)road.push(route.frameAt(d));
      for(let d=zone.start+170;d<zone.end;d+=240){
        const side=Math.floor(d/240)%2?1:-1,p=point(d,side*145,-5),radius=50,height=95+30*Math.sin(d*.01);
        if(road.some(f=>Math.hypot(f.p.x-p.x,f.p.z-p.z)<radius+35))continue;
        batch.add(cone,rock,[p.x,p.y+height*.5,p.z],[radius,height,radius]);
        batch.add(cone,snow,[p.x,p.y+height*.78,p.z],[radius*.46,height*.45,radius*.46]);
      }
    }
    if(zone.type==='sky'){
      world.makeGate(zone.start+40,'천공 항만 · 상층 지름길과 마지막 갭','#d5edff');
      for(let d=zone.start;d<zone.end;d+=24){
        if(!clear(d,d+20))continue;const w=world.roadHalfWidthAt(d)+1.5,wn=world.roadHalfWidthAt(d+20)+1.5;
        for(const side of[-1,1]){batch.girder(point(d,side*w,-1.2),point(d+20,side*wn,-1.2),1.1,steel);batch.girder(point(d,side*w,-1.2),point(d+20,side*wn,-7.5),.7,rib);}
        batch.girder(point(d,-w,-1.4),point(d,w,-1.4),1,steel);stats.skySupports++;
      }
    }
  }
  batch.finish();world.sceneryStats??={};Object.assign(world.sceneryStats,stats);return stats;
}
