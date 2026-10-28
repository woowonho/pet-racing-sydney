import * as THREE from '../vendor/three.module.js';
import {HarbourBatch} from './sydney.js';
import {bridgeTubeSection} from './bridge-routes.js';

// 파란 화살표는 실제 가속 패널, 노랑 표시는 점프/감속 판단에만 쓴다.
export function buildCourseMechanics(world){
  const batch=new HarbourBatch(world.scene);
  const cyan=new THREE.MeshBasicMaterial({color:'#32eaff',toneMapped:false,side:THREE.DoubleSide});
  const white=new THREE.MeshBasicMaterial({color:'#dcfdff',toneMapped:false,side:THREE.DoubleSide});
  const amber=new THREE.MeshBasicMaterial({color:'#ffce64',toneMapped:false,side:THREE.DoubleSide});
  const mint=new THREE.MeshBasicMaterial({color:'#b7ff79',toneMapped:false,side:THREE.DoubleSide});
  const dark=world.material('#083e62',.25,.35),steel=world.material('#173343',.35,.5);
  const c=document.createElement('canvas');c.width=256;c.height=256;const ctx=c.getContext('2d');
  ctx.fillStyle='#053d63';ctx.fillRect(0,0,256,256);ctx.strokeStyle='#43f4ff';ctx.lineWidth=25;ctx.lineJoin='round';
  for(const y of [52,142,232]){ctx.beginPath();ctx.moveTo(26,y+35);ctx.lineTo(128,y-32);ctx.lineTo(230,y+35);ctx.stroke();}
  const arrows=new THREE.CanvasTexture(c);arrows.colorSpace=THREE.SRGBColorSpace;
  const panel=new THREE.MeshBasicMaterial({map:arrows,side:THREE.DoubleSide,toneMapped:false});
  function surface(frameAt,start,end,left,right,material,height=0,step=4){
    const p=[],uv=[],indices=[],n=Math.max(1,Math.ceil((end-start)/step));
    for(let i=0;i<=n;i++){
      const d=start+(end-start)*i/n;
      for(const side of[left,right]){const f=frameAt(d,side);f.p.y+=height;p.push(...f.p.toArray());uv.push(side===left?0:1,i%2);}
      if(i<n){const k=i*2;indices.push(k,k+1,k+2,k+1,k+3,k+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();
    batch.add(g,material,[0,0,0]);g.dispose();
  }
  function beam(a,b,radius,material){
    batch.beam(a,b,radius,material);
  }
  const at=(d,lat=0)=>world.frameAt(d,lat);
  function entryFunnel(route,material){
    // 유도 범위는 실제 진입 보조와 같다. 노면 위의 선으로만 표시해 가짜 턱을 만들지 않는다.
    const approach=route.entryApproach||28,center=route.entryLateral,half=route.entryWidth/2;
    const start=Math.max(0,route.start-approach);
    for(let d=start;d<route.start;d+=2){
      const end=Math.min(route.start,d+2),t=(d-start)/Math.max(1,route.start-start);
      const edge=THREE.MathUtils.lerp(half,Math.min(half,route.halfWidth-.6),t);
      for(const side of[-1,1])surface(at,d,end,center+side*edge-.09,center+side*edge+.09,material,.055,1);
    }
    // 진입 가능한 폭을 한눈에 읽되 본선 중앙은 그대로 열린 차선으로 남긴다.
    for(const side of[-1,1])surface(at,start-2,start,center+side*(half-.55)-.5,center+side*(half-.55)+.5,material,.055,1);
  }
  for(const gate of world.apexGates||[]){
    const left=gate.lateral-gate.halfWidth,right=gate.lateral+gate.halfWidth,d=gate.distance;
    // 민트색 점선 브래킷은 벽이 아니다. 안쪽 주행선을 드리프트로 관통하는 선택 과제.
    for(const offset of[left,right]){
      surface(at,d-12,d-4,offset-.13,offset+.13,mint,.08,3);
      surface(at,d+4,d+12,offset-.13,offset+.13,mint,.08,3);
    }
    for(const cross of[d-12,d+12])surface(at,cross-.13,cross+.13,left,right,mint,.08,1);
    surface(at,d-.6,d+.6,left+.6,right-.6,mint,.08,1);
  }
  for(const feature of world.features){
    if(feature.type==='dash'){
      const center=feature.lateral||0,half=(feature.width||8)/2;
      for(let d=feature.start;d<feature.end;d+=12)surface(at,d,Math.min(d+10,feature.end),center-half,center+half,panel,.075,10);
      surface(at,feature.start,feature.end,center-half-.18,center-half,cyan,.085);
      surface(at,feature.start,feature.end,center+half,center+half+.18,cyan,.085);
    }
    if(feature.mechanic==='warp'){
      world.makeGate(feature.start-70,'WARP · 초고속 흡입','#62eeff');
      for(let i=0;i<6;i++){
        const d=feature.start-42+i*10,f=at(d),half=12.3,height=10.2;
        const point=(x,y)=>f.p.clone().addScaledVector(f.right,x).add(new THREE.Vector3(0,y,0));
        beam(point(-half,.3),point(-half,height),.095,cyan);beam(point(half,.3),point(half,height),.095,cyan);beam(point(-half,height),point(half,height),.095,white);
      }
    }
    if(feature.type==='gap'){
      world.makeGate(feature.start-112,'N₂O 필수 · 끊어진 길','#ffcb6d');
      for(const d of[feature.start-2,feature.end+2]){
        const half=world.roadHalfWidthAt(d);
        for(let side=-half;side<half;side+=1.7)surface(at,d-1,d+.8,side,Math.min(half,side+1.6),Math.floor((side+half)/1.7)%2?steel:amber,.08,2);
        for(const side of[-1,1]){const p=at(d,side*(half+1)).p;beam(p,p.clone().add(new THREE.Vector3(0,5,0)),.16,amber);}
      }
    }
    if(feature.type==='speed-bump'){
      // 물리 노면을 그대로 따라가는 얇은 도색. 별도의 충돌 없는 상자는 놓지 않는다.
      const half=world.roadHalfWidthAt((feature.start+feature.end)/2)-.65;
      const middle=(feature.start+feature.end)/2;
      for(let lateral=-half;lateral<half;lateral+=2.4){
        surface(at,middle-3.5,middle+3.5,lateral,Math.min(half,lateral+2.4),Math.round((lateral+half)/2.4)%2?steel:amber,.045,1);
      }
      for(const side of[-1,1])surface(at,feature.start,feature.end,side*half-.12,side*half+.12,amber,.05,1);
    }
  }
  function vacuumTube(route){
    const frame=(d,lateral=0)=>route.frameAt(d,lateral),width=route.halfWidth;
    const glass=new THREE.MeshStandardMaterial({name:'bridge-vacuum-glass',color:'#7de4ef',transparent:true,opacity:.09,roughness:.22,metalness:.12,side:THREE.DoubleSide,depthWrite:false});
    glass.userData.noShadow=true;
    const rim=world.material('#b6d3d9',.68,.3);
    // 아치 철골 위에 리벳 데크를 얹고, 타원형 유리관으로 하늘과 수면을 함께 보여 준다.
    surface(frame,route.start,route.end,-width,width,steel,.02,2);
    surface(frame,route.start,route.end,-width+.3,width-.3,dark,.04,3);
    for(let travel=8;travel<route.routeLength-32;travel+=19){
      const d=route.start+travel/route.routeLength*route.span;
      const end=Math.min(route.end,d+13/route.routeLength*route.span);
      surface(frame,d,end,-2.4,2.4,panel,.09,3);
    }
    for(const side of[-1,1]){
      surface(frame,route.start,route.end,side*(width-.2)-.1,side*(width-.2)+.1,cyan,.11,3);
      surface(frame,route.start,route.end,side*(width+.15)-.13,side*(width+.15)+.13,rim,-.2,3);
    }
    const ringAt=travel=>{
      const f=frame(route.start+travel/route.routeLength*route.span);
      const up=f.right.clone().cross(f.tangent).normalize();
      return angle=>{const section=bridgeTubeSection(angle);return f.p.clone().addScaledVector(f.right,section.lateral).addScaledVector(up,section.height);};
    };
    const n=Math.ceil(route.routeLength/6),sides=16,positions=[],indices=[];
    for(let i=0;i<=n;i++){
      const ring=ringAt(route.routeLength*i/n);
      for(let j=0;j<=sides;j++)positions.push(...ring(j/sides*Math.PI*2).toArray());
      if(i<n)for(let j=0;j<sides;j++){const k=i*(sides+1)+j;indices.push(k,k+1,k+sides+1,k+1,k+sides+2,k+sides+1);}
    }
    const shell=new THREE.BufferGeometry();shell.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));shell.setIndex(indices);shell.computeVertexNormals();batch.add(shell,glass,[0,0,0]);shell.dispose();
    // 유리 프레임은 일정한 실제 거리로 지나가며 마하 속도를 읽을 수 있게 한다.
    for(let travel=0;travel<=route.routeLength;travel+=24){
      const ring=ringAt(Math.min(travel,route.routeLength));
      for(let j=0;j<sides;j++)beam(ring(j/sides*Math.PI*2),ring((j+1)/sides*Math.PI*2),.12,rim);
      for(let j=1;j<8;j++)beam(ring(j/8*Math.PI),ring((j+.6)/8*Math.PI),.055,cyan);
    }
    for(const angle of[.14,Math.PI-.14,Math.PI*.5]){
      for(let travel=0;travel<route.routeLength;travel+=12)beam(ringAt(travel)(angle),ringAt(Math.min(travel+11.8,route.routeLength))(angle),.055,cyan);
    }
    world.makeGate(route.start-48,'오른쪽 분기 → 아치 진공관','#62eeff');
    entryFunnel(route,cyan);
    for(let d=Math.max(0,route.start-65);d<route.start;d+=13)surface(at,d,Math.min(d+9,route.start),route.entryLateral-1.8,route.entryLateral+1.8,panel,.085,3);
    const signPoint=frame(route.start+35/route.routeLength*route.span).p;
    const sign=world.mesh(new THREE.PlaneGeometry(8.5,1.6),new THREE.MeshBasicMaterial({map:world.labelTexture('MACH TUBE · 자동 가속','#7affef'),side:THREE.DoubleSide}),signPoint.toArray());
    sign.position.y+=8;sign.lookAt(at(route.start-25).p.clone().add(new THREE.Vector3(0,5,0)));
    const merge=frame(route.end-65/route.routeLength*route.span),exitSign=world.mesh(new THREE.PlaneGeometry(7,1.5),new THREE.MeshBasicMaterial({map:world.labelTexture('감속 · 본선 합류','#ffdf91'),side:THREE.DoubleSide}),merge.p.toArray());
    exitSign.position.y+=8;exitSign.lookAt(frame(route.end-115/route.routeLength*route.span).p.clone().add(new THREE.Vector3(0,5,0)));
  }
  for(const route of world.routes){
    if(route.kind==='bridge-mach'){vacuumTube(route);continue;}
    const frame=(d,lateral=0)=>route.frameAt(d,lateral),width=route.halfWidth;
    const deckStart=route.start+route.entryGap/route.routeLength*route.span;
    surface(frame,deckStart,route.end,-width,width,dark,.015,3);
    // 착지 후 직선에서만 작동하는 상층 가속 레일. 급커브에는 화살표를 놓지 않는다.
    for(let d=deckStart;d<route.end-12;d+=12){
      const end=Math.min(d+10,route.end-12);
      if([d,(d+end)/2,end].every(sample=>Math.abs(route.turnRateAt(sample))<.008)){
        surface(frame,d,end,-width+.65,width-.65,panel,.075,5);
      }
    }
    for(const side of[-1,1]){
      surface(frame,deckStart,route.end,side*width-.10,side*width+.10,cyan,.07,4);
      for(let d=deckStart;d<route.end;d+=22){const a=frame(d,side*width).p,b=frame(Math.min(d+18,route.end),side*width).p;a.y+=.6;b.y+=.6;beam(a,b,.07,white);}
    }
    // 상층길의 실제 입구와 출구를 표시한다. 초반 공백은 점프로만 진입한다.
    const side=route.entryLateral<0?'왼쪽':'오른쪽';
    world.makeGate(route.start-95,`${side} + N₂O · 상층 지름길`,'#9ff0ff');
    entryFunnel(route,amber);
    for(let d=route.start-75;d<route.start-12;d+=15){
      const f=at(d,route.entryLateral),mark=world.mesh(new THREE.PlaneGeometry(2.2,5),amber,f.p.toArray());mark.position.y+=.07;mark.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right,f.tangent,f.right.clone().cross(f.tangent).normalize()));
    }
    const exitPoint=frame(route.end).p;
    const exitSign=world.mesh(new THREE.PlaneGeometry(7,1.8),new THREE.MeshBasicMaterial({map:world.labelTexture('↓ 본선으로 착지','#ffdf91'),side:THREE.DoubleSide}),exitPoint.toArray());exitSign.position.y+=3;exitSign.lookAt(frame(route.end-45).p.clone().add(new THREE.Vector3(0,3,0)));
    const p=frame(deckStart+20).p;const sign=world.mesh(new THREE.PlaneGeometry(8,2),new THREE.MeshBasicMaterial({map:world.labelTexture('SKY CUT','#6feaff'),side:THREE.DoubleSide}),p.toArray());sign.position.y+=4;sign.lookAt(at(route.start-45).p.clone().add(new THREE.Vector3(0,4,0)));
  }
  batch.finish();
}
