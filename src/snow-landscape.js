import * as THREE from '../vendor/three.module.js';

// 짧은 설산 구간도 하얀 노면만 남지 않도록 길의 양쪽에 실제 능선을 만든다.
// 모든 본선·상층을 함께 절삭하므로 높아진 산이 다른 코너를 가리지 않는다.
export function buildSnowLandscape(world,Batch){
  const zones=(world.curve.courseZones||[]).filter(zone=>zone.type==='snow');
  if(!zones.length)return {snowTerrainTriangles:0,snowMountainZones:0};
  const roads=[],gaps=[];
  for(let d=0;d<world.length;d+=6)roads.push({p:world.frameAt(d).p,width:world.roadHalfWidthAt(d)});
  for(const route of world.routes||[])for(let d=route.start;d<=route.end;d+=6)roads.push({p:route.frameAt(d).p,width:route.halfWidth});
  for(const gap of world.features.filter(feature=>feature.type==='gap'))for(let d=gap.start-12;d<gap.end+12;d+=6)gaps.push({p:world.frameAt(d).p,width:world.roadHalfWidthAt(d)+14});
  const capAt=(x,z)=>{let cap=Infinity;for(const {p,width} of roads){const distance=Math.hypot(p.x-x,p.z-z);if(distance>450)continue;cap=Math.min(cap,p.y-5+Math.max(0,distance-width-24)*.7);}return cap;};
  const gapAt=(x,z)=>gaps.some(({p,width})=>(p.x-x)**2+(p.z-z)**2<width**2);
  const material=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.94,side:THREE.DoubleSide});material.userData.noShadow=true;
  const batch=new Batch(world.scene),stats={snowTerrainTriangles:0,snowMountainZones:zones.length};
  for(const zone of zones)for(let start=zone.start;start<zone.end;start+=300){
    const end=Math.min(zone.end,start+300),steps=Math.ceil((end-start)/6),positions=[],colors=[],indices=[],holes=[];
    const profile=[7,23,62,111,185,260],sections=[];
    for(let j=0;j<profile.length-1;j++){const count=Math.ceil((profile[j+1]-profile[j])/10);for(let n=0;n<count;n++)sections.push({j,t:n/count});}sections.push({j:4,t:1});
    const stride=sections.length*2;
    for(let i=0;i<=steps;i++){
      const d=start+(end-start)*i/steps,frame=world.frameAt(d),width=world.roadHalfWidthAt(d),progress=(d-zone.start)/(zone.end-zone.start);
      for(const side of[-1,1]){
        const peak=48+27*Math.sin(d*.009+side*1.7)**2+16*Math.sin(d*.022)**2;
        const offsets=[width+7,width+23,width+62,width+111,width+185,width+260];
        const heights=[-2,8,peak*.55,peak,peak*.4,-12-frame.p.y];
        for(const {j,t} of sections){
          const section=j+t,offset=THREE.MathUtils.lerp(offsets[j],offsets[j+1],t)+(section>1?Math.sin(d*.018+section+side)*8:0),p=frame.p.clone().addScaledVector(frame.right,side*offset);
          const envelope=.5+.5*Math.sin(Math.PI*THREE.MathUtils.clamp(progress,0,1));
          const y0=frame.p.y+heights[j]*(j===5?1:envelope),y1=frame.p.y+heights[j+1]*(j+1===5?1:envelope);
          p.y=Math.min(THREE.MathUtils.lerp(y0,y1,t),capAt(p.x,p.z));positions.push(p.x,p.y,p.z);holes.push(gapAt(p.x,p.z));
          const strata=.5+.5*Math.sin(p.y*.31+d*.018),color=new THREE.Color(section<1?'#c7e0e9':section>4.7?'#6d8f9e':'#f0f6f4');
          if(section>1&&section<3||section>3.5&&section<4.8)color.lerp(new THREE.Color('#8daebb'),.22+strata*.24);color.multiplyScalar(.94+Math.sin(d*.031+section)*.04);colors.push(color.r,color.g,color.b);
        }
      }
      const next=start+(end-start)*(i+1)/steps;
      if(i<steps&&!world.features.some(f=>f.type==='gap'&&d<f.end+12&&next>f.start-12))for(const side of[0,sections.length])for(let j=0;j<sections.length-1;j++){
        const a=i*stride+side+j,b=a+1,c=a+stride,e=a+stride+1;
        if([a,b].some(k=>holes[k]))continue;
        indices.push(a,c,b,b,c,e);
      }
    }
    // 다음 단면의 갭 표본까지 생성된 뒤 구멍을 최종 거른다.
    const safe=[];for(let i=0;i<indices.length;i+=3){const triangle=indices.slice(i,i+3);if(!triangle.some(index=>holes[index]))safe.push(...triangle);}
    const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setIndex(safe);geometry.computeVertexNormals();
    stats.snowTerrainTriangles+=safe.length/3;batch.add(geometry,material,[0,0,0]);geometry.dispose();
  }
  const before=world.scene.children.length;batch.finish();
  for(const mesh of world.scene.children.slice(before)){mesh.name='snow-ridge-terrain';mesh.userData.snowTerrain=true;}
  world.sceneryStats??={};Object.assign(world.sceneryStats,stats);return stats;
}
