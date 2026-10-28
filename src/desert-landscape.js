import * as THREE from '../vendor/three.module.js';

const V=(x,y,z)=>new THREE.Vector3(x,y,z);
const smooth=THREE.MathUtils.smoothstep;
const zonesOf=world=>world.curve.courseZones||world.curve.marathonZones||[];
const isSand=(world,d)=>world.curve.surfaceAt?.(d)?.surface==='sand'||world.features.some(f=>f.surface==='sand'&&d>=f.start&&d<=f.end);

// 노면은 물리가 만든 높이를 그대로 쓴다. 사구만 따로 만들고 모든 도로와
// 상층 중 가장 낮은 허용 지면으로 절삭해 가까운 다른 코너를 덮지 않는다.
export function createDesertField(world){
  const zones=zonesOf(world).filter(zone=>zone.type==='desert'||zone.surface==='sand');
  if(!zones.length)return null;
  const roads=[],sand=[],grid=new Map(),cell=96;
  const insert=(p,width,desert=false)=>{const entry={p,width,desert};roads.push(entry);if(desert)sand.push(entry);const key=`${Math.floor(p.x/cell)},${Math.floor(p.z/cell)}`;if(!grid.has(key))grid.set(key,[]);grid.get(key).push(entry);};
  for(let d=0;d<world.length;d+=6)insert(world.frameAt(d).p,world.roadHalfWidthAt(d),isSand(world,d));
  for(const route of world.routes||[])for(let d=route.start;d<=route.end;d+=6)insert(route.frameAt(d).p,route.halfWidth);
  if(!sand.length)return null;
  const xs=sand.map(s=>s.p.x),zs=sand.map(s=>s.p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const center=[(minX+maxX)/2,(minZ+maxZ)/2],radii=[(maxX-minX)/2+320,(maxZ-minZ)/2+320];
  const bounds=[minX-440,maxX+440,minZ-440,maxZ+440];
  const gaps=[];
  for(const gap of world.features.filter(feature=>feature.type==='gap'))for(let d=gap.start-10;d<gap.end+10;d+=6)gaps.push({p:world.frameAt(d).p,width:world.roadHalfWidthAt(d)+13});
  const isGapFloor=(x,z)=>gaps.some(({p,width})=>(p.x-x)**2+(p.z-z)**2<width**2);
  const sample=(x,z)=>{
    let roadDistance=Infinity,nearestSand=null,sandDistance=Infinity,cap=Infinity;
    const gx=Math.floor(x/cell),gz=Math.floor(z/cell);
    for(let ring=0;ring<=7;ring++){
      for(let dz=-ring;dz<=ring;dz++)for(let dx=-ring;dx<=ring;dx++){
        if(ring&&Math.abs(dx)!==ring&&Math.abs(dz)!==ring)continue;
        for(const road of grid.get(`${gx+dx},${gz+dz}`)||[]){
          const distance=Math.hypot(road.p.x-x,road.p.z-z);roadDistance=Math.min(roadDistance,distance);
          cap=Math.min(cap,road.p.y-2.5+Math.max(0,distance-road.width-20)*.38);
          if(road.desert&&distance<sandDistance){sandDistance=distance;nearestSand=road;}
        }
      }
      if(nearestSand&&sandDistance<Math.max(0,(ring-1)*cell))break;
    }
    if(!nearestSand)for(const road of sand){const distance=Math.hypot(road.p.x-x,road.p.z-z);if(distance<sandDistance){sandDistance=distance;nearestSand=road;}}
    const ellipse=1-Math.hypot((x-center[0])/radii[0],(z-center[1])/radii[1]);
    const land=Math.max(smooth(ellipse,-.1,.14),1-smooth(sandDistance,150,460));
    const crest=Math.sin(x*.011+Math.sin(z*.006)*1.8),ripple=Math.sin(z*.019+x*.007);
    const dunes=23+14*crest*crest+10*Math.sin(z*.007)**2+3*ripple;
    const support=nearestSand.p.y-4;
    const height=(THREE.MathUtils.lerp(support,dunes,smooth(sandDistance,20,130)))*land-10.2*(1-land);
    return {height:Math.min(height,cap),roadDistance,sandDistance,land,cap};
  };
  return {zones,bounds,sample,isGapFloor,heightAt:(x,z)=>sample(x,z).height};
}

export function buildDesertLandscape(world,Batch){
  const field=world.desertField||createDesertField(world);if(!field)return {desertTerrainTriangles:0,desertShoulderTriangles:0};
  world.desertField=field;
  const batch=new Batch(world.scene),material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.98,metalness:0,side:THREE.DoubleSide});material.userData.noShadow=true;
  const stats={desertTerrainTriangles:0,desertShoulderTriangles:0},[x0,x1,z0,z1]=field.bounds,chunkSize=384;
  for(let cz=z0;cz<z1;cz+=chunkSize)for(let cx=x0;cx<x1;cx+=chunkSize){
    const ex=Math.min(x1,cx+chunkSize),ez=Math.min(z1,cz+chunkSize),nx=Math.ceil((ex-cx)/16),nz=Math.ceil((ez-cz)/16),positions=[],colors=[],indices=[],inside=[],gapFloor=[];
    for(let j=0;j<=nz;j++)for(let i=0;i<=nx;i++){
      const x=cx+(ex-cx)*i/nx,z=cz+(ez-cz)*j/nz,s=field.sample(x,z);positions.push(x,s.height,z);inside.push(s.land>.005);gapFloor.push(field.isGapFloor(x,z));
      const strata=.5+.5*Math.sin(s.height*.6+x*.012),wind=.5+.5*Math.sin(x*.044+z*.016);
      const color=new THREE.Color('#c59e6b').lerp(new THREE.Color('#ead19a'),wind*.3+strata*.18);colors.push(color.r,color.g,color.b);
    }
    for(let j=0;j<nz;j++)for(let i=0;i<nx;i++){const a=j*(nx+1)+i,b=a+1,c=a+nx+1,d=c+1;if(![a,b,c,d].some(k=>inside[k])||[a,b,c,d].some(k=>gapFloor[k]))continue;indices.push(a,c,b,b,c,d);}
    if(!indices.length)continue;
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    stats.desertTerrainTriangles+=indices.length/3;batch.add(geometry,material,[0,0,0]);geometry.dispose();
  }
  // 모래 노면 옆을 얕게 붙이고 멀어질수록 사구 높이로 내려간다. 중앙의
  // 주행면이나 거친 요철을 덮는 가짜 평면은 만들지 않는다.
  for(const zone of field.zones)for(let start=zone.start;start<zone.end;start+=384){
    const end=Math.min(zone.end,start+384),steps=Math.ceil((end-start)/3),positions=[],colors=[],indices=[];
    for(let i=0;i<=steps;i++){
      const d=start+(end-start)*i/steps,f=world.frameAt(d),width=world.roadHalfWidthAt(d);
      for(const side of[-1,1])for(const extra of[-.3,9,27]){
        const p=f.p.clone().addScaledVector(f.right,side*(width+extra));
        p.y=extra<0?f.p.y-.04:extra===9?Math.min(f.p.y-1.4,field.heightAt(p.x,p.z)+1):field.heightAt(p.x,p.z)-.04;
        positions.push(p.x,p.y,p.z);const color=new THREE.Color(extra<0?'#ccb17f':extra===9?'#d4b986':'#c5a371');colors.push(color.r,color.g,color.b);
      }
      if(i<steps&&!world.features.some(f=>f.type==='gap'&&d<f.end&&start+(end-start)*(i+1)/steps>f.start))for(const side of[0,3])for(let j=0;j<2;j++){const a=i*6+side+j;indices.push(a,a+6,a+1,a+1,a+6,a+7);}
    }
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(indices);geometry.computeVertexNormals();
    stats.desertShoulderTriangles+=indices.length/3;batch.add(geometry,material,[0,0,0]);geometry.dispose();
  }
  const before=world.scene.children.length;batch.finish();
  for(const mesh of world.scene.children.slice(before)){mesh.name='desert-ground';mesh.userData.desertTerrain=true;}
  world.sceneryStats??={};Object.assign(world.sceneryStats,stats);return stats;
}
