import * as THREE from '../vendor/three.module.js';
import {SYDNEY_LANDMARKS,sydneyTerrainHeight} from './city-track.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z),UP=V(0,1,0);
const box=new THREE.BoxGeometry(1,1,1);
const cylinder=new THREE.CylinderGeometry(1,1,1,8);
const cone=new THREE.ConeGeometry(1,1,8);
const sphere=new THREE.IcosahedronGeometry(1,1);
const rand=(n)=>{const s=Math.sin(n*127.1+311.7)*43758.5453;return s-Math.floor(s);};

// 정적인 구조물을 재질별로 합쳐 항만 전체가 적은 드로콜로 그려지도록 한다.
class HarbourBatch {
  constructor(scene){this.scene=scene;this.buckets=new Map();this.matrix=new THREE.Matrix4();}
  add(geometry,material,position,scale=[1,1,1],quaternion=new THREE.Quaternion()){
    const data=this.buckets.get(material)||{positions:[],normals:[],uvs:[]};this.buckets.set(material,data);
    const g=geometry.index?geometry.toNonIndexed():geometry;
    this.matrix.compose(V(...position),quaternion,V(...scale));
    const normalMatrix=new THREE.Matrix3().getNormalMatrix(this.matrix),p=V(0,0,0),n=V(0,0,0);
    const ps=g.getAttribute('position'),ns=g.getAttribute('normal'),uv=g.getAttribute('uv');
    for(let i=0;i<ps.count;i++){p.fromBufferAttribute(ps,i).applyMatrix4(this.matrix);n.fromBufferAttribute(ns,i).applyNormalMatrix(normalMatrix);data.positions.push(p.x,p.y,p.z);data.normals.push(n.x,n.y,n.z);data.uvs.push(uv?uv.getX(i):0,uv?uv.getY(i):0);}
    if(g!==geometry)g.dispose();
  }
  block(material,x,y,z,w,h,d,angle=0){this.add(box,material,[x,y,z],[w,h,d],new THREE.Quaternion().setFromAxisAngle(UP,angle));}
  beam(a,b,width,material){const delta=b.clone().sub(a);this.add(cylinder,material,a.clone().add(b).multiplyScalar(.5).toArray(),[width,delta.length(),width],new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize()));}
  girder(a,b,width,material){const delta=b.clone().sub(a),length=delta.length(),q=new THREE.Quaternion().setFromUnitVectors(UP,delta.normalize()),mid=a.clone().add(b).multiplyScalar(.5);this.add(box,material,mid.toArray(),[width*.22,length,width],q);for(const side of[-1,1])this.add(box,material,mid.clone().add(V(0,0,side*width*.46).applyQuaternion(q)).toArray(),[width,length,width*.13],q);}
  finish(){for(const [material,b] of this.buckets){const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.positions,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(b.normals,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uvs,2));g.computeBoundingSphere();const m=new THREE.Mesh(g,material);m.castShadow=true;m.receiveShadow=true;this.scene.add(m);}this.buckets.clear();}
}
function land(world,points,top,side){const shape=new THREE.Shape(points.map(([x,z])=>new THREE.Vector2(x,-z)));const geo=new THREE.ExtrudeGeometry(shape,{depth:9.2,bevelEnabled:false,steps:1});geo.rotateX(-Math.PI/2);const mesh=new THREE.Mesh(geo,[top,side]);mesh.position.y=-9.6;mesh.receiveShadow=true;world.scene.add(mesh);return mesh;}
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
function terrainBerm(world,start,end,material){const positions=[],uv=[],indices=[],offsets=[-70,-45,-17,17,45,70],steps=350;for(let i=0;i<=steps;i++){const f=world.frameAt((start+(end-start)*i/steps)*world.length);for(const offset of offsets){const p=f.p.clone().addScaledVector(f.right,offset);p.y=Math.max(-.38,f.p.y*(1-THREE.MathUtils.smoothstep(Math.abs(offset),19,70))-.48);positions.push(p.x,p.y,p.z);uv.push(p.x,p.z);}if(i<steps)for(let j=0;j<5;j++){const a=i*6+j;indices.push(a,a+1,a+6,a+1,a+7,a+6);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();material.side=THREE.DoubleSide;const m=new THREE.Mesh(g,material);m.receiveShadow=true;world.scene.add(m);}
function insideLand(x,z,polygon){let inside=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])inside=!inside;}return inside;}
function sculptedTerrain(world,polygon,bounds,heightAt,material){
  const[x0,x1,z0,z1]=bounds,nx=Math.ceil((x1-x0)/18),nz=Math.ceil((z1-z0)/18),positions=[],uv=[],indices=[],inside=[];
  for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){const x=x0+(x1-x0)*i/nx,z=z0+(z1-z0)*j/nz;inside.push(insideLand(x,z,polygon));positions.push(x,heightAt(x,z),z);uv.push(x,z);}
  // 해안선은 정밀한 기존 육지 면이 맡는다. 물 밖으로 보간되는 격자는 만들지 않는다.
  for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;if(![a,b,c,d].every(k=>inside[k])||Math.max(...[a,b,c,d].map(k=>positions[k*3+1]))<.05)continue;indices.push(a,c,b,b,c,d);}
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();const mesh=new THREE.Mesh(g,material);mesh.receiveShadow=true;world.scene.add(mesh);
}
function gableGeometry(){const p=[-1,0,-1,1,0,-1,0,1,-1,-1,0,1,0,1,1,1,0,1,-1,0,-1,0,1,-1,-1,0,1,0,1,-1,0,1,1,-1,0,1,1,0,-1,1,0,1,0,1,-1,0,1,-1,1,0,1,0,1,1];for(let i=0;i<p.length;i+=9)for(let k=0;k<3;k++){const b=p[i+3+k];p[i+3+k]=p[i+6+k];p[i+6+k]=b;}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.computeVertexNormals();return g;}

export function buildSydneyScenery(world){
  const {scene}=world,batch=new HarbourBatch(scene);world.landmarks=SYDNEY_LANDMARKS;world.courseId='sydney-harbour-v5';
  const steel=world.material('#334953',.58,.48),steelLight=world.material('#61737a',.45,.55),sand=world.material('#cfb18a'),sandLight=world.material('#e4ceb0'),path=world.material('#d3c5a9'),grass=world.material('#76a96a'),grassDark=world.material('#42794e'),leaf=world.material('#3f815c'),leafLight=world.material('#5a9662'),trunk=world.material('#78634a'),white=world.material('#f7f5e5'),navy=world.material('#224e60'),glass=world.material('#54858e',.4,.2),yellow=world.material('#f3c14f');
  grass.map=groundTexture();grass.color.set('#ffffff');path.polygonOffset=true;path.polygonOffsetFactor=0;path.polygonOffsetUnits=3;
  const stoneMap=masonryTexture(),stone=new THREE.MeshStandardMaterial({map:stoneMap,bumpMap:stoneMap,bumpScale:.16,roughness:.91});
  const pavingMap=masonryTexture('paving');pavingMap.repeat.set(5,1);const paving=new THREE.MeshStandardMaterial({map:pavingMap,bumpMap:pavingMap,bumpScale:.055,roughness:.85,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-1});
  const northMap=masonryTexture('slate');northMap.repeat.set(4,1);const northPaving=new THREE.MeshStandardMaterial({map:northMap,roughness:.84,polygonOffset:true,polygonOffsetFactor:0,polygonOffsetUnits:-1});
  const water=new THREE.ShaderMaterial({uniforms:{time:{value:0}},vertexShader:`varying vec3 p; void main(){vec4 w=modelMatrix*vec4(position,1.);p=w.xyz;gl_Position=projectionMatrix*viewMatrix*w;}`,fragmentShader:`varying vec3 p; uniform float time;
  float hash(vec2 q){return fract(sin(dot(q,vec2(127.1,311.7)))*43758.5453);}
  float noise(vec2 q){vec2 i=floor(q),f=fract(q);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
  float wave(vec2 q){return (noise(q*.65+vec2(time*.21,-time*.09))-.5)*.22+(noise(q*1.7+vec2(-time*.14,time*.18))-.5)*.07;}
  void main(){vec2 q=p.xz;float v=wave(q);vec3 n=normalize(vec3(wave(q+vec2(.8,0.))-v,1.3,wave(q+vec2(0.,.8))-v));vec3 eye=normalize(cameraPosition-p);float fres=pow(1.-max(dot(n,eye),0.),3.);vec3 c=mix(vec3(.035,.20,.27),vec3(.22,.41,.49),fres);c+=v*.018;float glint=pow(max(dot(reflect(-normalize(vec3(-.5,1.,-.3)),n),eye),0.),140.);c+=vec3(.95,.95,.72)*glint*.43;float distanceToEye=length(cameraPosition-p);float haze=1.-exp(-distanceToEye*distanceToEye*.00042*.00042);c=mix(c,vec3(.78,.89,.94),haze);gl_FragColor=vec4(c,1.);}`});
  const ocean=new THREE.Mesh(new THREE.PlaneGeometry(12000,12000),water);ocean.rotation.x=-Math.PI/2;ocean.position.y=-10;scene.add(ocean);world.waterMaterial=water;
  const southLand=[[-1900,-1500],[1500,-1500],[1500,-350],[780,-330],[580,-190],[490,-120],[445,-32],[407,43],[372,196],[263,196],[250,98],[250,-32],[223,-65],[95,-65],[72,-60],[-80,-65],[-300,-140],[-750,-105],[-1350,-180]];
  const northLand=[[-1800,2500],[1400,2500],[1400,685],[850,640],[610,565],[420,535],[330,595],[205,565],[125,545],[0,550],[-160,585],[-420,540],[-850,615],[-1500,580]];
  land(world,southLand,grass,sand);land(world,northLand,grass,sand);
  const roadSamples=world.samples.filter((_,i)=>i%3===0);
  const nearestRoad=(x,z)=>{let distance2=Infinity,height=0;for(const f of roadSamples){const d=(x-f.p.x)**2+(z-f.p.z)**2;if(d<distance2){distance2=d;height=f.p.y;}}return{distance:Math.sqrt(distance2),height};};
  const smooth=THREE.MathUtils.smoothstep;
  const rawHill=(x,z)=>{
    if(z>540){const rise=smooth(z,605,1030),edge=(1-smooth(Math.abs(x),900,1500))*(1-smooth(z,1850,2500));return-.3+edge*(rise*(36+22*Math.exp(-(((x-300)/650)**2))+8*Math.sin(x*.004))+17*Math.exp(-(((x-490)/190)**2+((z-735)/190)**2)));}
    const rocks=31*Math.exp(-(((x+370)/270)**2+((z+280)/220)**2))*(1-smooth(z,-155,-65));
    const garden=18*Math.exp(-(((x-650)/320)**2+((z+380)/250)**2));
    return-.3+rocks+garden;
  };
  const sceneGround=(x,z)=>{const h=rawHill(x,z),road=nearestRoad(x,z),roadBank=road.height-1.6+Math.max(0,road.distance-35)*.20;return Math.max(-.38,Math.min(h,roadBank));};
  sculptedTerrain(world,northLand,[-1500,1300,540,2350],sceneGround,grass);
  sculptedTerrain(world,southLand,[-1500,1500,-1500,50],sceneGround,grass);
  world.sceneryStats={shoreWharves:5,walshBayPiers:4,houses:0,minimumBuildingRoadGap:Infinity};
  // 멀리 있는 항만 곶은 수평선을 막지 않는 낮은 녹지다.
  land(world,[[1300,750],[2400,800],[2800,150],[2500,-120],[2150,80],[1800,290]],grassDark,sand);
  world.ribbon(-15,15,-.1,path);world.ribbon(-14.7,-14.25,.02,sandLight);world.ribbon(14.25,14.7,.02,sandLight);
  // 육지의 코너는 제방까지 함께 솟는다. 도로 아래가 뜨지 않도록 넓은 지형 띠를 만든다.
  for(const range of[[.185,.37],[.53,.99]])terrainBerm(world,range[0],range[1],grass);
  world.ribbon(-11.18,11.18,.008,northPaving,{start:.205,end:.340,segments:210});
  world.ribbon(-11.18,11.18,.009,paving,{start:.565,end:.665,segments:230});
  const gardenRoad=world.material('#b88a68',0,.94);gardenRoad.map=world.roadTexture;gardenRoad.polygonOffset=true;gardenRoad.polygonOffsetFactor=0;gardenRoad.polygonOffsetUnits=-1;
  world.ribbon(-11.18,11.18,.009,gardenRoad,{start:.742,end:.913,segments:270});
  world.ribbon(-14.2,-11.65,.018,paving,{start:.545,end:.96,segments:460});world.ribbon(11.65,14.2,.018,paving,{start:.545,end:.96,segments:460});
  // 물 쪽에는 낮고 투명한 난간만 두어 달리는 동안 수면이 계속 보인다.
  for(let d=0;d<world.length;d+=10){const f=world.frameAt(d);const onBridge=f.p.z>38&&f.p.z<565&&f.p.x<95;if(onBridge)continue;for(const side of [-1,1]){const p=f.p.clone().addScaledVector(f.right,side*14.4),end=world.frameAt(d+9.7,side*14.4).p;
      batch.beam(V(p.x,p.y+1.1,p.z),V(end.x,end.y+1.1,end.z),.09,white);batch.beam(V(p.x,p.y+.15,p.z),V(p.x,p.y+1.15,p.z),.10,steelLight);
  }}
  // 하버브리지: 상·하부 아치, 수직 행어, X자 가새와 사암 주탑 네 개.
  const center=5,z0=35,z1=565,span=z1-z0;
  elevatedDeck(world,center-42,center+42,z0-8,z1+8,path);
  // 수평 지지보는 중심 높이가 아니라 아래쪽 모서리의 노면보다 낮게 놓는다.
  // 경사 진입로에서 사암·철골의 윗면이 주행면을 뚫고 나오는 것을 막는다.
  for(let z=z0;z<z1;z+=18){const top=Math.min(sydneyTerrainHeight(center,z-9),sydneyTerrainHeight(center,z+9))-.35;batch.block(steel,center,top-1.75,z,84,3.5,18);}
  for(const x of [-20,30]){for(const z of[-58,-16,26]){const top=Math.min(sydneyTerrainHeight(x,z-3),sydneyTerrainHeight(x,z+3))-.35;batch.block(stone,x,(top-10)/2,z,19,top+10,6);}}
  // 중앙 보행 전망대. 도로 사이를 채워 큰 허공처럼 보이지 않도록 한다.
  elevatedDeck(world,center-10.5,center+10.5,z0,z1,sandLight,-.06);
  for(const x of [center-40,center+40]){
    let previousLow=null,previousHigh=null;
    for(let i=0;i<=34;i++){const t=i/34,z=z0+t*span,y=10+105*Math.pow(Math.sin(Math.PI*t),.78),low=V(x,y,z),high=V(x,y+12,z);
      if(previousLow){batch.girder(previousLow,low,2.7,steel);batch.girder(previousHigh,high,2.3,steel);batch.girder(previousLow,high,1.05,steelLight);batch.girder(previousHigh,low,1.05,steelLight);}
      const deckY=sydneyTerrainHeight(x,z);batch.beam(low,high,.6,steelLight);if(i>1&&i<33&&low.y>deckY){batch.beam(V(x,deckY+1,z),low,.28,steel);batch.beam(V(x,deckY+1,z),V(x,deckY+3,z+7),.25,steelLight);}
      if(i%3===0&&i>0&&i<34){batch.beam(low,V(center*2-x,y,z),.62,steel);batch.beam(high,V(center*2-x,y+12,z),.55,steel);}
      previousLow=low;previousHigh=high;
    }
    for(let z=z0;z<=z1;z+=12){const y=sydneyTerrainHeight(x,z),next=sydneyTerrainHeight(x,z+12);batch.beam(V(x,y+.2,z),V(x,y+1.6,z),.11,steelLight);batch.beam(V(x,y+1.6,z),V(x,next+1.6,z+12),.1,steelLight);}
  }
  for(const x of [center-56,center+56])for(const z of [z0-2,z1+2]){
    const base=sydneyTerrainHeight(x,z);batch.block(stone,x,(base+38)/2-3,z,24,base+44,25);batch.block(sandLight,x,base+40,z,28,3,29);batch.block(stone,x,base+43,z,25,2,26);batch.block(stone,x,-3,z,31,9,33);
    for(const dx of [-7,0,7]){batch.block(navy,x+dx,base+30,z-12.6,2,9,.2);batch.block(navy,x+dx,base+30,z+12.6,2,9,.2);}for(let y=3;y<base+39;y+=5)batch.block(sandLight,x,y,z-12.6,24,.18,.2);
  }
  for(let z=55;z<560;z+=30){for(const x of [center-38,center+38]){const y=sydneyTerrainHeight(x,z);batch.beam(V(x,y,z),V(x,y+7,z),.12,steel);batch.beam(V(x,y+7,z),V(x+3,y+7,z),.1,steel);batch.block(white,x+3,y+6.95,z,1.4,.15,.7);}}
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
  for(let i=0;i<27;i++){const x=-550+rand(i+30)*1200,z=-540-rand(i+12)*450,h=24+rand(i+4)*105,w=18+rand(i+9)*28,base=sceneGround(x,z);batch.block(cityMat,x,base+h/2-.5,z,w,h,28);batch.block(sandLight,x,base+h,z,w+2,1.7,30);batch.block(steelLight,x+w*.17,base+h+2.5,z,w*.35,4,11);for(let k=0;k<3;k++)batch.block(steel,x-w*.23+k*3.2,base+h+1.7,z+5,2.2,2.1,3.2);}
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
  // 왈시 베이의 긴 창고 부두 네 동은 더 록스 서쪽 수면으로 돌출된다.
  for(let i=0;i<4;i++){const x=-640+i*76,z=-18;batch.block(stone,x,-2,z,22,3.4,172);batch.block(path,x,-.13,z,22,.24,172);batch.block(stone,x,3,z-12,15,6,91);batch.add(roofGeometry,roofDark,[x,6,z-12],[8.4,3,47]);for(let dz=-80;dz<80;dz+=16)for(const dx of[-9,9])batch.beam(V(x+dx,-10,z+dz),V(x+dx,.3,z+dz),.6,trunk);}
  function seaWall(points){for(let j=0;j<points.length-1;j++){const a=V(points[j][0],0,points[j][1]),b=V(points[j+1][0],0,points[j+1][1]),count=Math.ceil(a.distanceTo(b)/8),length=a.distanceTo(b)/count,angle=Math.atan2(b.x-a.x,b.z-a.z);for(let i=0;i<count;i++){const p=a.clone().lerp(b,(i+.5)/count),road=nearestRoad(p.x,p.z),top=Math.max(.6,sceneGround(p.x,p.z)+.6);if(road.distance<19&&top>road.height-2)continue;batch.block(stone,p.x,(top-10)/2,p.z,3.4,top+10,length+.3,angle);batch.block(sandLight,p.x,top+.15,p.z,3.8,.3,length+.35,angle);}}}
  seaWall([[-760,-107],[-520,-123],[-305,-143],[-165,-94],[-85,-66]]);
  seaWall([[92,-66],[223,-66],[251,-32],[252,98],[264,195],[372,197],[408,43]]);
  seaWall([[-420,541],[-160,586],[0,551],[124,547],[205,567],[330,597],[420,538],[610,568],[850,643]]);
  for(const x of[-355,-273]){let previous=null;for(let i=0;i<40;i++){const z=-116-i*2.8,y=Math.ceil(Math.max(0,sceneGround(x,z))/.32)*.32+.16;if(nearestRoad(x,z).distance<24)continue;batch.block(stone,x,y-.2,z,8,.4,3);for(const side of[-1,1]){const p=V(x+side*3.8,y+1,z);batch.beam(V(p.x,y,p.z),p,.07,steelLight);if(previous)batch.beam(V(p.x,previous.y+1,previous.z),p,.07,steelLight);}previous={y,z};}}
  // 베넬롱의 남쪽 넓은 계단은 반도의 밝은 포장 테라스로 이어진다.
  for(let i=0;i<12;i++)batch.block(sandLight,320,i*.24+.12,10+i*1.85,132-i*.6,.3,2.4);
  // 유칼립투스와 무화과나무의 가지·겹수관을 여러 덩어리로 만든다.
  function tree(x,z,h,flower=false){if(!insideLand(x,z,z>500?northLand:southLand))return;const road=nearestRoad(x,z);if(road.distance<26||housingFootprints.some(b=>Math.abs(x-b.x)<b.w/2+5&&Math.abs(z-b.z)<b.d/2+5))return;const berm=Math.max(-.38,road.height*(1-THREE.MathUtils.smoothstep(road.distance,19,70))-.48),y=Math.max(berm,sceneGround(x,z));batch.add(cylinder,trunk,[x,y+h*.36,z],[.38,h*.72,.38]);for(let k=0;k<5;k++){const a=k*2.399+rndTree(x,z),r=1.5+rand(k+x)*1.8,tx=x+Math.sin(a)*r,tz=z+Math.cos(a)*r,ty=y+h*(.7+rand(k+z)*.23);batch.beam(V(x,y+h*.35,z),V(tx,ty-1,tz),.15,trunk);batch.add(sphere,flower?world.material('#9e84b4'):k%2?leaf:leafLight,[tx,ty,tz],[2.5+rand(k+x)*1.2,2+rand(k+z)*1.1,2.6+rand(k+x+z)]);}}
  function rndTree(x,z){return rand(x+z)*6.28;}
  for(let i=0;i<housingFootprints.length;i++){const h=housingFootprints[i];if(i%2===0)tree(h.x+(rand(i+207)-.5)*9,h.z-h.d/2-14,8+rand(i+205)*4);}
  for(let i=0;i<125;i++){let x,z;if(i<70){x=-380+rand(i+7)*1050;z=-570+rand(i+55)*170;}else{x=-480+rand(i+7)*1150;z=910+rand(i+55)*170;}tree(x,z,9+rand(i+2)*6);}
  function parkPath(points,width=5){const curve=new THREE.CatmullRomCurve3(points.map(([x,z])=>V(x,0,z))),positions=[],indices=[];for(let i=0;i<=120;i++){const p=curve.getPointAt(i/120),t=curve.getTangentAt(i/120),right=V(-t.z,0,t.x);for(const side of[-1,1]){const v=p.clone().addScaledVector(right,side*width/2);positions.push(v.x,sceneGround(v.x,v.z)+.11,v.z);}if(i<120&&nearestRoad(p.x,p.z).distance>20&&insideLand(p.x,p.z,p.z>500?northLand:southLand)){const a=i*2;indices.push(a,a+2,a+1,a+1,a+2,a+3);}}const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));g.setIndex(indices);g.computeVertexNormals();batch.add(g,path,[0,0,0]);g.dispose();}
  parkPath([[510,-190],[650,-255],[730,-380],[650,-530],[440,-620],[230,-570]],5);
  parkPath([[650,-165],[815,-350],[820,-610],[620,-745]],4);
  parkPath([[-780,740],[-550,690],[-360,710],[-240,875]],4);
  for(let i=0;i<32;i++)tree(585+rand(i+480)*265,-180-rand(i+930)*560,10+rand(i+120)*8,i%9===0);
  // 가든의 높은 쪽에는 숲, 바다 쪽에는 낮은 화단을 둬 전망을 열어 둔다.
  for(let i=0;i<45;i++){const d=world.length*(.685+i*.0062),f=world.frameAt(d,-27-rand(i+38)*20);tree(f.p.x,f.p.z,8+rand(i+40)*7,i%7===0);}
  // 가든 구간에 자카란다, 전망 벤치와 경주 깃발로 거리의 척도를 준다.
  const jacaranda=world.material('#a887bc');
  for(let i=0;i<16;i++){const d=world.length*.72+i*world.length*.014,f=world.frameAt(d,25+(i%2)*5);if(f.p.z>0)continue;tree(f.p.x,f.p.z,9,i%3===0);}
  for(let d=0;d<world.length;d+=70){const f=world.frameAt(d);if(f.p.z>30&&f.p.z<580&&f.p.x<100)continue;for(const side of[-1,1]){const p=world.frameAt(d,side*17).p;batch.beam(V(p.x,p.y,p.z),V(p.x,p.y+5.8,p.z),.07,white);const q=new THREE.Quaternion().setFromAxisAngle(UP,Math.atan2(f.tangent.x,f.tangent.z));batch.add(box,side<0?world.material('#ef7955'):world.material('#4fbec5'),[p.x,p.y+4.3,p.z],[.06,2.7,1],q);}}
  for(let i=0;i<19;i++){const d=world.length*.55+i*world.length*.021,f=world.frameAt(d,21),yaw=Math.atan2(f.tangent.x,f.tangent.z),q=new THREE.Quaternion().setFromAxisAngle(UP,yaw);if(f.p.z>30)continue;batch.add(box,trunk,[f.p.x,f.p.y+.75,f.p.z],[3.3,.18,1],q);batch.add(box,trunk,[f.p.x,f.p.y+1.35,f.p.z+.48],[3.3,.8,.12],q);for(const side of[-1,1])batch.block(steel,f.p.x+side*1.2,f.p.y+.36,f.p.z,.15,.72,.65);}
  for(let i=0;i<7;i++){const x=198+i*14,z=-183;batch.add(cylinder,white,[x,1,z],[1.5,.15,1.5]);batch.add(cylinder,steelLight,[x,1.7,z],[.07,3.4,.07]);batch.add(cone,i%2?white:world.material('#e99767'),[x,3.8,z],[3.4,1.1,3.4]);}
  // 사암 해안과 낮은 너울. 주행 공간 바깥, 수면 가까이에만 놓는다.
  const shore=[[-750,-105],[-300,-140],[-80,-65],[95,-65],[223,-65],[250,-32],[250,98],[263,196],[372,196],[407,43],[445,-32],[490,-120],[580,-190],[780,-330]];
  const rock=world.material('#ab957d'),wetRock=world.material('#776f61',0,.76);
  for(let j=0;j<shore.length-1;j++){const a=V(shore[j][0],-8,shore[j][1]),b=V(shore[j+1][0],-8,shore[j+1][1]),steps=Math.ceil(a.distanceTo(b)/9);for(let i=0;i<steps;i++){const p=a.clone().lerp(b,i/steps);batch.add(sphere,i%3?rock:wetRock,[p.x+rand(i+j)*4,-7.9+rand(i+35)*1.8,p.z+rand(i+61)*4],[3+rand(i+j)*4,1.5+rand(i+13)*2,3+rand(i+44)*3]);}}
  // 구역마다 화단·산책객·앉을 곳을 다르게 배치한다.
  const flower=world.material('#d990ba'),goldFlower=world.material('#e2bc62'),skin=world.material('#cca487'),shirt=world.material('#557e97'),coral=world.material('#c98368');
  for(let i=0;i<22;i++){const d=world.length*(.68+i*.011),f=world.frameAt(d,20),y=f.p.y,angle=Math.atan2(f.tangent.x,f.tangent.z);batch.block(stone,f.p.x,y+.25,f.p.z,2.8,.8,7,angle);for(let k=0;k<6;k++){const p=f.p.clone().addScaledVector(f.tangent,(k-2.5));batch.add(sphere,k%2?leaf:leafLight,[p.x,y+1.0,p.z],[1.25,.75,1.0]);batch.add(sphere,i%3?flower:goldFlower,[p.x+.4,y+1.58,p.z],[.22,.2,.25]);}}
  for(let i=0;i<35;i++){const d=world.length*(i<20?.56+i*.005:.22+(i-20)*.006),f=world.frameAt(d,18.8+rand(i+3)*3),x=f.p.x,z=f.p.z,y=f.p.y;batch.add(cylinder,i%2?shirt:coral,[x,y+1.1,z],[.29,.85,.23]);batch.add(sphere,skin,[x,y+1.77,z],[.22,.26,.22]);for(const side of[-1,1]){batch.beam(V(x+side*.14,y+.68,z),V(x+side*.18,y+.08,z),.09,navy);batch.beam(V(x+side*.25,y+1.38,z),V(x+side*.40,y+.83,z+.08),.09,skin);}}
  batch.finish();
  // 수면, 배의 흔들림, 갈매기를 렌더링 프레임과 함께 움직인다.
  const birdPositions=[],birdGeo=new THREE.BufferGeometry();for(let i=0;i<12;i++){const x=170+rand(i)*500,y=38+rand(i+4)*50,z=rand(i+9)*480;birdPositions.push(x-1.3,y,z,x,y-.35,z,x,y-.35,z,x+1.3,y,z);}birdGeo.setAttribute('position',new THREE.Float32BufferAttribute(birdPositions,3));const birds=new THREE.LineSegments(birdGeo,new THREE.LineBasicMaterial({color:'#f7f7ed'}));scene.add(birds);
  world.updateScenery=(time)=>{water.uniforms.time.value=time;for(let i=0;i<boats.length;i++){const b=boats[i];b.g.position.y=-7.9+Math.sin(time*.8+i)*.15;b.g.rotation.z=Math.sin(time*.65+i)*.012;b.g.position.x=b.x+Math.sin(time*.018+i)*b.drift;b.g.position.z=b.z+Math.cos(time*.018+i)*b.drift;}birds.position.x=Math.sin(time*.035)*25;birds.position.z=Math.cos(time*.035)*20;};
}
