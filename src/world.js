import * as THREE from '../vendor/three.module.js';
import {trackFrame, trackCurvature, trackTurnRate} from './track-space.js';
import {createCharacter} from './characters.js';
import {createCityTrack,sydneyRoadFeature} from './city-track.js';
import {buildSydneyScenery} from './sydney.js';
import {SpeedFX} from './speed-fx.js';
import {createRaceRoutes,isTrackGap} from './race-routes.js';
import {buildCourseMechanics} from './course-mechanics.js';
import {createApexGates} from './apex-gates.js';
import {fitMenuShowcase} from './menu-showcase.js';

const UP = new THREE.Vector3(0, 1, 0);
const clamp = THREE.MathUtils.clamp;
const mix = THREE.MathUtils.lerp;
const mod = (x, n) => ((x % n) + n) % n;

export class CityWorld {
  constructor(canvas, quality = 'high', characterTextures) {
    this.renderer = new THREE.WebGLRenderer({canvas, antialias:true, powerPreference:'high-performance'});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio, quality === 'high' ? 1.65 : 1));
    this.renderer.setSize(innerWidth, innerHeight);
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.04;
    this.renderer.shadowMap.enabled = quality === 'high';
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2('#c5deeb', .00042);
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, .2, 9000);
    this.camera.position.set(0, 25, -40);
    this.clock = 0;
    this.characterTextures=characterTextures;
    this.racerMeshes = [];
    this.menuScene=new THREE.Scene();
    this.menuCamera=new THREE.OrthographicCamera(0,innerWidth,innerHeight,0,.1,10);
    this.menuCamera.position.z=2;
    this.menuSprite=new THREE.Sprite();this.menuSprite.material.dispose();this.menuSprite.center.set(.5,0);
    this.menuScene.add(this.menuSprite);
    this.trailSegments = [];
    this.previousFeet = null;
    this.particles = [];
    this.mat = {};
    this.roadHalfWidth = 11.5;
    this.curve = createCityTrack();
    this.length = this.curve.getLength();
    this.features = this.curve.features;
    this.apexGates = createApexGates(this.curve,this.length,this.features);
    this.routes = createRaceRoutes(this.curve,this.length,this.features);
    // 선택 화면은 분기 램프 앞에 둬서 펫의 전신이 구조물에 가리지 않는다.
    this.menuDistance = Math.max(0,Math.min(this.length*.01,(this.routes.find(r=>r.kind==='bridge-mach')?.start??Infinity)-40));
    this.courseId = this.curve.courseId;
    this.courseLaps = this.curve.courseLaps;
    this.courseFormat = this.curve.courseFormat;
    this.isClosed = this.curve.isClosed;
    this.sampleDivisions = Math.ceil(this.length/3);
    this.samples = Array.from({length:this.sampleDivisions+1}, (_,i)=>this.frameAt(i/this.sampleDivisions*this.length));
    this.buildSky(); this.buildTrack(); this.buildScenery(); buildCourseMechanics(this); this.buildParticles();
    this.scene.add(new THREE.HemisphereLight('#d9efff','#516543',1.4));
    const sun = new THREE.DirectionalLight('#fff0d8',2.8);sun.position.set(-70,100,-45);sun.castShadow=true;
    sun.shadow.mapSize.set(2048,2048);Object.assign(sun.shadow.camera,{left:-105,right:105,top:105,bottom:-105,near:1,far:440});sun.shadow.camera.updateProjectionMatrix();sun.shadow.bias=-.00015;sun.shadow.normalBias=.07;
    this.scene.add(sun,sun.target);this.sun=sun;
    const fill = new THREE.DirectionalLight('#86c9ef',.65);fill.position.set(300,160,-450);this.scene.add(fill);
    this.cameraReady = false;
    this.speedFX=new SpeedFX(this);
    window.addEventListener('resize',()=>this.resize());
  }
  frameAt(distance,lateral=0) {return trackFrame(this.curve,this.length,distance,lateral);}
  routeFor(racer,distance=racer?.distance){return racer?.routeId?this.routes.find(r=>r.id===racer.routeId&&distance>=r.start&&distance<=r.end):null;}
  frameAtRacer(racer,distance=racer.distance,lateral=racer.lateral||0){const route=this.routeFor(racer,distance);return route?route.frameAt(distance,lateral):this.frameAt(distance,lateral);}
  roadHalfWidthAt(distance=0,racer=null) {return this.routeFor(racer,distance)?.halfWidth??this.curve.roadHalfWidthAt(distance);}
  heightAt(distance,racer=null){return racer?this.frameAtRacer(racer,distance,0).p.y:this.frameAt(distance).p.y;}
  isGap(distance){return isTrackGap(this.features,distance);}
  featureAt(distance,racer=null) {const route=this.routeFor(racer,distance);if(route)return route;const d=this.isClosed?mod(distance,this.length):clamp(distance,0,this.length);return this.features.find(f=>f.type!=='shortcut'&&d>=f.start&&d<=f.end);}
  curvatureAt(distance,racer=null) {return this.routeFor(racer,distance)?.curvatureAt(distance)??trackCurvature(this.curve,this.length,distance);}
  screenPosition(distance,lateral=0,racer=null) {
    const p=(racer?this.frameAtRacer(racer,distance,lateral):this.frameAt(distance,lateral)).p;p.y+=1.6;p.project(this.camera);
    return {x:(p.x+1)*innerWidth/2,y:(1-p.y)*innerHeight/2};
  }
  turnRateAt(distance,racer=null) {return this.routeFor(racer,distance)?.turnRateAt(distance)??trackTurnRate(this.curve,this.length,distance);}
  gradeAt(distance,racer=null) {const t=(racer?this.frameAtRacer(racer,distance):this.frameAt(distance)).tangent;return t.y/Math.max(.001,Math.hypot(t.x,t.z));}
  surfaceAt(distance) {
    if(this.curve.surfaceAt)return this.curve.surfaceAt(distance);
    const {x,z}=this.frameAt(distance).p;return {...sydneyRoadFeature(x,z),surface:'asphalt'};
  }
  sectorAt(distance,racer=null) {
    if(distance<0)return '서큘러 키 출발';
    const t=(this.isClosed?mod(distance,this.length):clamp(distance,0,this.length))/this.length;
    const p=this.frameAt(distance).p;
    const feature=this.featureAt(distance,racer);if(feature)return feature.label;
    const d=this.isClosed?mod(distance,this.length):clamp(distance,0,this.length);
    const zone=(this.curve.courseZones||this.curve.marathonZones)?.find(zone=>d>=zone.start&&d<=zone.end);if(zone)return zone.label;
    if(p.x<-1450&&p.z>1300) return '북서 해안 피날레';
    if(p.x<-1450&&p.z>250) return '버치그로브 해안';
    if(p.x<-1450) return '코카투 클리프';
    if(p.x<-600) return '발메인 워터프런트';
    if(p.z>590) return '밀슨스 포인트';
    if(p.z>35&&p.x<0) return '하버브리지';
    if(p.z>35&&p.x<100) return '브리지 리턴';
    if(p.x>240&&p.z>-120) return '오페라하우스';
    if(p.x>360||p.z<-310) return '보타닉 가든';
    if(t>.85) return '서큘러 키 피니시';
    if(t>.55) return '베넬롱 포인트';
    return '서큘러 키';
  }

  material(color, metalness=0, roughness=.8) {
    const key=color+metalness+roughness;
    return this.mat[key] ??= new THREE.MeshStandardMaterial({color,metalness,roughness});
  }
  mesh(geometry,material,pos,scale,parent=this.scene) {
    const o=new THREE.Mesh(geometry,material);
    if(pos)o.position.set(...pos);if(scale)o.scale.set(...scale);parent.add(o);return o;
  }
  buildSky() {
    const sky=new THREE.Mesh(new THREE.SphereGeometry(6500,32,20),new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 v; void main(){v=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:`varying vec3 v;
      float hash(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
      float noise(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1,0)),f.x),mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x),f.y);}
      float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+vec2(13.1,7.5);a*=.5;}return s;}
      void main(){vec3 d=normalize(v);float h=d.y;vec3 c=mix(vec3(.78,.89,.94),vec3(.16,.42,.69),smoothstep(-.04,.95,h));vec2 p=d.xz/max(.16,h)*2.3;float f=fbm(p+fbm(p*.7));float cloud=smoothstep(.53,.76,f)*smoothstep(.16,.29,h);vec3 lit=mix(vec3(.77,.83,.88),vec3(1.,.99,.96),smoothstep(.53,.70,f));c=mix(c,lit,cloud*.83);float sun=pow(max(dot(d,normalize(vec3(-.55,.65,-.3))),0.),110.);c+=vec3(.16,.11,.035)*sun;gl_FragColor=vec4(c,1.);}`
    }));this.scene.add(sky);this.sky=sky;
  }
  glowTexture(color='#7bfcff') {
    const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    const g=ctx.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,color);g.addColorStop(.16,color+'cc');g.addColorStop(.48,color+'44');g.addColorStop(1,color+'00');ctx.fillStyle=g;ctx.fillRect(0,0,128,128);return new THREE.CanvasTexture(c);
  }
  ribbon(left,right,height,material,{start=0,end=1,include=null}={}) {
    const p=[],n=[],uv=[],idx=[];
    // 포장 색·차선·요철이 같은 도로 단면을 공유해야 언덕에서 서로 뚫고 나오지 않는다.
    const divisions=this.samples.length-1,stops=[start];
    for(let step=Math.floor(start*divisions)+1;step<divisions&&step/divisions<end;step++)stops.push(step/divisions);
    stops.push(end);
    for(let i=0;i<stops.length;i++) {
      const d=stops[i]*this.length,u=stops[i]*divisions,k=Math.min(divisions-1,Math.floor(u)),blend=u-k;
      const a=this.samples[k],b=this.samples[k+1],f={p:a.p.clone().lerp(b.p,blend),right:a.right.clone().lerp(b.right,blend)};
      const widthScale=this.roadHalfWidthAt(d)/this.roadHalfWidth;
      for(const offset of [left,right]){const v=f.p.clone().addScaledVector(f.right,offset*widthScale);v.y+=height;p.push(v.x,v.y,v.z);n.push(0,1,0);uv.push(offset===left?0:1,d/15);}
      const middle=i<stops.length-1?(stops[i]+stops[i+1])*.5*this.length:d;
      if(i<stops.length-1&&!this.isGap(middle)&&(!include||include(middle))){let a=i*2;idx.push(a,a+1,a+2,a+1,a+3,a+2);}
    }
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.computeVertexNormals();
    const m=this.mesh(g,material);m.material.side=THREE.DoubleSide;m.receiveShadow=true;return m;
  }
  buildTrack() {
    const asphalt=document.createElement('canvas');asphalt.width=asphalt.height=512;const ctx=asphalt.getContext('2d');ctx.fillStyle='#65737a';ctx.fillRect(0,0,512,512);
    let seed=811;for(let i=0;i<62000;i++){seed=(seed*16807)%2147483647;const x=seed%512;seed=(seed*16807)%2147483647;ctx.fillStyle=i%2?'#728087':'#59686f';ctx.fillRect(x,seed%512,1,1);}
    const tex=new THREE.CanvasTexture(asphalt);tex.wrapS=tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2,1);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=8;
    this.roadTexture=tex;
    const surface=d=>this.surfaceAt(d).surface;
    const paved=d=>surface(d)==='asphalt';
    this.ribbon(-11.5,11.5,0,new THREE.MeshStandardMaterial({map:tex,roughness:.95,metalness:0}),{include:paved});
    const sand=document.createElement('canvas');sand.width=sand.height=512;const sc=sand.getContext('2d');
    sc.fillStyle='#d9b278';sc.fillRect(0,0,512,512);
    for(let i=0;i<38000;i++){seed=(seed*16807)%2147483647;const x=seed%512;seed=(seed*16807)%2147483647;sc.fillStyle=i%3?'#e3c28d':'#ba945e';sc.fillRect(x,seed%512,1.3,1);}
    // 낮은 모래 물결은 실제 둔덕의 높이를 가리지 않는 질감이다.
    for(let y=12;y<512;y+=24){sc.beginPath();sc.strokeStyle='rgba(123,87,43,.12)';sc.lineWidth=2;for(let x=0;x<=512;x+=8){const h=y+Math.sin(x*.036+y)*2.8;if(x===0)sc.moveTo(x,h);else sc.lineTo(x,h);}sc.stroke();}
    const sandTex=new THREE.CanvasTexture(sand);sandTex.wrapS=sandTex.wrapT=THREE.RepeatWrapping;sandTex.repeat.set(3,1);sandTex.colorSpace=THREE.SRGBColorSpace;sandTex.anisotropy=8;
    this.sandTexture=sandTex;
    this.ribbon(-11.5,11.5,0,new THREE.MeshStandardMaterial({map:sandTex,roughness:1}),{include:d=>surface(d)==='sand'});
    const snow=document.createElement('canvas');snow.width=snow.height=512;const nc=snow.getContext('2d');
    nc.fillStyle='#d2e5ed';nc.fillRect(0,0,512,512);
    for(let i=0;i<32000;i++){seed=(seed*16807)%2147483647;const x=seed%512;seed=(seed*16807)%2147483647;nc.fillStyle=i%3?'#edf5f7':'#b5d1df';nc.fillRect(x,seed%512,1.5,1);}
    // 압설 노면의 길게 이어지는 결은 파란 빙벽과 흰 갓길 사이에서 주행선을 읽게 한다.
    for(let x=0;x<512;x+=15){nc.fillStyle='rgba(244,252,255,.16)';nc.fillRect(x,0,3,512);}
    const snowTex=new THREE.CanvasTexture(snow);snowTex.wrapS=snowTex.wrapT=THREE.RepeatWrapping;snowTex.repeat.set(2,1);snowTex.colorSpace=THREE.SRGBColorSpace;snowTex.anisotropy=8;
    this.snowTexture=snowTex;
    this.ribbon(-11.5,11.5,0,new THREE.MeshStandardMaterial({map:snowTex,roughness:.72,metalness:.03}),{include:d=>surface(d)==='snow'});
    // 결승을 통과한 시선 끝에 노면이 갑자기 잘리지 않도록 100m 회복 공간을 둔다.
    for(const range of(this.isClosed?[]:[[-65,0],[this.length,this.length+100]])){
      const runoff=[];for(const d of range)for(const side of[-11.5,11.5])runoff.push(...this.frameAt(d,side).p.toArray());
      const runoffGeometry=new THREE.BufferGeometry();runoffGeometry.setAttribute('position',new THREE.Float32BufferAttribute(runoff,3));runoffGeometry.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,7,1,7],2));runoffGeometry.setIndex([0,2,1,1,2,3]);runoffGeometry.computeVertexNormals();this.mesh(runoffGeometry,new THREE.MeshStandardMaterial({map:tex,roughness:.95,side:THREE.DoubleSide}));
    }
    this.buildRoughRoad();
    const white=this.material('#d4d0c2'),yellow=this.material('#dfb654');
    this.ribbon(-11.45,-11.2,.025,white,{include:paved});this.ribbon(11.2,11.45,.025,white,{include:paved});
    this.ribbon(-.28,-.15,.026,yellow,{include:paved});this.ribbon(.15,.28,.026,yellow,{include:paved});
    const dummy=new THREE.Object3D();
    const dash=new THREE.InstancedMesh(new THREE.PlaneGeometry(.12,4),white,Math.ceil(this.length/12)*2);let di=0;
    for(let d=8;d<this.length;d+=12){if(this.isGap(d)||!paved(d))continue;for(const off of [-5.8,5.8]){const f=this.frameAt(d,off*this.roadHalfWidthAt(d)/this.roadHalfWidth);dummy.position.copy(f.p);dummy.position.y+=.04;dummy.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f.right,f.tangent,f.right.clone().cross(f.tangent).normalize()));dummy.updateMatrix();dash.setMatrixAt(di++,dummy.matrix);}}dash.count=di;this.scene.add(dash);
    const barrierGeometry=new THREE.BoxGeometry(.55,.95,3.2),barrierMaterial=this.material('#d6cfc0');
    this.scene.userData.harbourChunks??=[];
    for(let start=0;start<this.length;start+=640){
      const end=Math.min(start+640,this.length),barrier=new THREE.InstancedMesh(barrierGeometry,barrierMaterial,Math.ceil((end-start)/4)*2);let bi=0;
      for(let d=start;d<end;d+=4){if(this.isGap(d))continue;const width=this.roadHalfWidthAt(d),kind=surface(d);for(const side of [-1,1]){const f=this.frameAt(d,side*(width+.3));dummy.position.copy(f.p);dummy.position.y+=.46;dummy.rotation.set(0,Math.atan2(f.tangent.x,f.tangent.z),0);dummy.updateMatrix();barrier.setMatrixAt(bi,dummy.matrix);barrier.setColorAt(bi,new THREE.Color(Math.floor(d/12)%2?'#f5eed9':kind==='sand'?'#ae7950':kind==='snow'?'#4188b1':'#47aeb7'));bi++;}}
      barrier.count=bi;barrier.castShadow=true;barrier.receiveShadow=true;barrier.computeBoundingSphere();this.scene.add(barrier);this.scene.userData.harbourChunks.push({mesh:barrier,bounds:barrier.boundingSphere});
    }
    this.makeGate(0,'START / FINISH · 1 LAP','#b4f2e8',true);
    if(!this.isClosed)this.makeGate(this.length-5,'FINISH','#ffe6a1');
    const check=document.createElement('canvas');check.width=256;check.height=64;const cx=check.getContext('2d');for(let y=0;y<2;y++)for(let x=0;x<16;x++){cx.fillStyle=(x+y)%2?'#202327':'#e9e5dd';cx.fillRect(x*16,y*32,16,32);}
    const ct=new THREE.CanvasTexture(check);ct.colorSpace=THREE.SRGBColorSpace;
    const finishMaterial=new THREE.MeshStandardMaterial({map:ct,roughness:1});
    this.ribbon(-11.2,11.2,.04,finishMaterial,{start:0,end:4/this.length,segments:2});
    if(!this.isClosed)this.ribbon(-11.2,11.2,.04,finishMaterial,{start:(this.length-7)/this.length,end:(this.length-3)/this.length,segments:2});
    const arrows=document.createElement('canvas');arrows.width=256;arrows.height=128;const ac=arrows.getContext('2d');ac.fillStyle='#edb743';ac.fillRect(0,0,256,128);ac.strokeStyle='#24262b';ac.lineWidth=22;for(let i=0;i<3;i++){ac.beginPath();ac.moveTo(25+i*78,25);ac.lineTo(55+i*78,64);ac.lineTo(25+i*78,103);ac.stroke();}
    const at=new THREE.CanvasTexture(arrows);at.colorSpace=THREE.SRGBColorSpace;const am=new THREE.MeshBasicMaterial({map:at,side:THREE.DoubleSide});
    for(let d=70;d<this.length;d+=40){const bend=this.curvatureAt(d);if(Math.abs(bend)<.68)continue;const f=this.frameAt(d,-Math.sign(bend)*(this.roadHalfWidthAt(d)+1.6));const m=this.mesh(new THREE.PlaneGeometry(5,2),am,f.p.toArray());m.position.y+=1.8;m.lookAt(this.frameAt(d-14).p.clone().add(new THREE.Vector3(0,1.8,0)));if(bend<0)m.scale.x=-1;}
  }
  buildRoughRoad() {
    // 도로와 같은 단면을 사용해 요철 위의 보수 포장·가장자리 경고가 뜨지 않게 한다.
    const positions=[],colors=[],uv=[],indices=[];
    const add=(a,b,left,right,tint,d,height=.018)=>{
      const base=positions.length/3,color=new THREE.Color(tint);
      for(const [frame,offset] of [[a,left],[a,right],[b,left],[b,right]]){
        const p=frame.p.clone().addScaledVector(frame.right,offset*this.roadHalfWidthAt(d)/this.roadHalfWidth);p.y+=height;
        positions.push(p.x,p.y,p.z);colors.push(color.r,color.g,color.b);uv.push((offset+11.5)/11.5,(d+(frame===b?this.length/this.sampleDivisions:0))/15);
      }
      indices.push(base,base+1,base+2,base+1,base+3,base+2);
    };
    for(let i=0;i<this.samples.length-1;i++){
      const a=this.samples[i],b=this.samples[i+1],d=i/this.sampleDivisions*this.length;
      const surface=this.surfaceAt(d);
      if(this.isGap(d+this.length/this.sampleDivisions*.5)||surface.surface!=='asphalt'||surface.rough<.1)continue;
      add(a,b,-11.05,11.05,Math.floor(d/15)%2?'#adb2b0':'#858e8b',d);
      if(i%3===0){add(a,b,-10.95,-10.25,'#f5d295',d,.022);add(a,b,10.25,10.95,'#f5d295',d,.022);}
    }
    const geometry=new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));geometry.setAttribute('color',new THREE.Float32BufferAttribute(colors,3));geometry.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));geometry.setIndex(indices);geometry.computeVertexNormals();
    const surface=this.mesh(geometry,new THREE.MeshStandardMaterial({map:this.roadTexture,vertexColors:true,roughness:1,side:THREE.DoubleSide}));surface.receiveShadow=true;
  }
  labelTexture(text,color='#e7ffff') {
    const c=document.createElement('canvas');c.width=1024;c.height=160;const ctx=c.getContext('2d');ctx.fillStyle='#152e42';ctx.fillRect(0,0,c.width,c.height);ctx.fillStyle=color;ctx.fillRect(0,0,14,160);ctx.fillRect(1010,0,14,160);ctx.font='900 73px Arial, sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,512,85);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;
  }
  makeGate(d,text,color,start=false) {
    const f=this.frameAt(d);const g=new THREE.Group();g.position.copy(f.p);g.rotation.y=Math.atan2(f.tangent.x,f.tangent.z);this.scene.add(g);
    this.scene.userData.harbourChunks??=[];this.scene.userData.harbourChunks.push({mesh:g,bounds:new THREE.Sphere(f.p.clone(),30)});
    const mat=this.material('#163548',.4,.45),glow=new THREE.MeshBasicMaterial({color}),half=this.roadHalfWidthAt(d)+1;
    for(const x of [-half,half]){this.mesh(new THREE.BoxGeometry(1,10,1.2),mat,[x,5,0],null,g);this.mesh(new THREE.BoxGeometry(.18,8,.18),glow,[x-.6,4.5,-.65],null,g);}
    this.mesh(new THREE.BoxGeometry(half*2+1,2.9,1.4),mat,[0,9.5,0],null,g);
    const sign=this.mesh(new THREE.PlaneGeometry(half*2-1,2.65),new THREE.MeshBasicMaterial({map:this.labelTexture(text,color),side:THREE.DoubleSide}),[0,9.5,-.72],null,g);sign.rotation.y=Math.PI;
    if(start)for(let i=0;i<5;i++)this.mesh(new THREE.SphereGeometry(.26,12,8),glow,[-2.4+i*1.2,7.5,-.7],null,g);
  }
  buildScenery() {buildSydneyScenery(this);}
  createRacer(pet) {
    const model=createCharacter(pet,this.characterTextures),g=model.group;
    const shadow=this.mesh(new THREE.PlaneGeometry(3.5,3.5),new THREE.MeshBasicMaterial({map:this.glowTexture('#0c1720'),transparent:true,opacity:.45,depthWrite:false}),[0,.05,0],null,g);shadow.rotation.x=-Math.PI/2;
    const aura=new THREE.Sprite(new THREE.SpriteMaterial({map:this.glowTexture(pet.color),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending,opacity:.36}));aura.position.y=1.8;aura.scale.set(5.4,5.4,1);aura.visible=false;g.add(aura);
    this.scene.add(g);return {g,model,pet,shadow,aura};
  }
  setRacers(roster) {
    for(const r of this.racerMeshes){this.scene.remove(r.g);r.model.dispose();r.shadow.geometry.dispose();r.shadow.material.map.dispose();r.shadow.material.dispose();r.aura.material.map.dispose();r.aura.material.dispose();}
    this.speedFX?.reset();this.sandDust=[];this.dustClock=0;
    this.racerMeshes=roster.map(p=>this.createRacer(p));this.particles=[];this.trailSegments=[];this.previousFeet=null;
  }
  buildParticles() {
    this.particleGeometry=new THREE.BufferGeometry();this.particlePositions=new Float32Array(300*3);this.particleColors=new Float32Array(300*3);
    this.particleGeometry.setAttribute('position',new THREE.BufferAttribute(this.particlePositions,3));this.particleGeometry.setAttribute('color',new THREE.BufferAttribute(this.particleColors,3));
    this.particleSystem=new THREE.Points(this.particleGeometry,new THREE.PointsMaterial({size:.55,vertexColors:true,map:this.glowTexture('#ffffff'),transparent:true,depthWrite:false,blending:THREE.AdditiveBlending}));this.particleSystem.frustumCulled=false;this.scene.add(this.particleSystem);
    this.sandDust=[];this.dustClock=0;
    this.dustPositions=new Float32Array(96*3);this.dustColors=new Float32Array(96*3);this.dustGeometry=new THREE.BufferGeometry();
    this.dustGeometry.setAttribute('position',new THREE.BufferAttribute(this.dustPositions,3));this.dustGeometry.setAttribute('color',new THREE.BufferAttribute(this.dustColors,3));
    this.dustSystem=new THREE.Points(this.dustGeometry,new THREE.PointsMaterial({size:2.6,map:this.glowTexture('#ffffff'),vertexColors:true,opacity:.3,transparent:true,depthWrite:false}));this.dustSystem.frustumCulled=false;this.scene.add(this.dustSystem);
  }
  emit(f,boost,drift) {
    const side=Math.random()>.5?1:-1;
    const p=f.p.clone().addScaledVector(f.right,side*1.2).addScaledVector(f.tangent,-1.4);p.y+=.35;
    this.particles.push({p,v:f.tangent.clone().multiplyScalar(-4-Math.random()*8).addScaledVector(f.right,side*(2+Math.random()*3)),life:1,max:1,color:new THREE.Color(boost?'#7eefff':drift>65?'#ffe076':'#58d9ff')});
    if(this.particles.length>290)this.particles.shift();
  }
  update(dt,race,{menu=false,reducedMotion=false}={}) {
    const mobileShowcase=menu&&document.body.classList.contains('touch');
    this.clock+=dt;
    this.updateScenery?.(this.clock);
    const running=race.state==='racing',player=race.player;
    race.racers.forEach((r,i)=>{
      const o=this.racerMeshes[i];if(!o)return;
      o.g.visible=!menu||i===0&&!mobileShowcase;
      const f=menu?this.frameAt(this.menuDistance,0):this.frameAtRacer(r),height=menu?0:(r.jumpHeight||0);o.g.position.copy(f.p);o.g.position.y+=height;
      const heading=r.heading||0;const facing=f.tangent.clone().multiplyScalar(Math.cos(heading)).addScaledVector(f.right,Math.sin(heading));
      o.g.rotation.y=Math.atan2(facing.x,facing.z)+(menu?Math.PI+.17:0);
      const motion=running?{...r,boostTime:Math.max(r.boostTime||0,r.speed>145?.1:0)}:{...r,speed:0,steer:0,drift:false,boostTime:0};
      o.model.update(motion,this.clock,dt,{menu,reducedMotion,camera:this.camera});
      const boosting=running&&(r.boostTime>0||r.speed>145);o.aura.visible=boosting;
      o.shadow.visible=!r.falling&&!this.isGap(r.distance);
      // 캐릭터가 떠도 그림자는 노면에 남아 착지 위치를 알려 준다.
      o.shadow.position.y=.05-height;
      o.shadow.scale.setScalar((boosting?.87:1)*(1+height*.065));
      o.shadow.material.opacity=.45/(1+height*.16);
      if(i===0&&running&&boosting&&r.speed>12&&!reducedMotion){this.emit({...f,p:f.p.clone().add(new THREE.Vector3(0,height,0))},true,r.driftCharge);}
      const groundKind=i===0&&running?this.surfaceAt(r.distance).surface:'asphalt';
      if(i===0&&running&&!r.airborne&&!r.falling&&!r.routeId&&r.speed>30&&!reducedMotion&&['sand','snow'].includes(groundKind)){
        this.dustClock+=dt;
        // 낮은 모래먼지·눈가루는 발뒤꿈치에서만 생기며 코너 시야를 가리지 않는다.
        if(this.dustClock>1/24){this.dustClock%=1/24;for(const side of[-1,1]){
          const p=f.p.clone().addScaledVector(f.tangent,-1.1).addScaledVector(f.right,side*.55);p.y+=.2;
          this.sandDust.push({p,v:f.tangent.clone().multiplyScalar(-5).addScaledVector(f.right,side*(r.drift?3:1.1)),life:.8,color:new THREE.Color(groundKind==='snow'?'#e7f6ff':'#c7a66e')});
        }}
      }
      if(i===0)this.updateFootTrails(f,motion,dt);
      // 초고속 FOV에서도 원래 펫의 화면상 크기는 보존한다.
      const art=o.model.group.children.find(child=>child.isSprite&&child!==o.aura);
      if(art&&!menu)art.scale.multiplyScalar(Math.max(1,Math.tan(this.camera.fov*Math.PI/360)/Math.tan(68*Math.PI/360)));
    });
    for(const p of this.particles){p.life-=dt*1.8;p.p.addScaledVector(p.v,dt);p.p.y+=dt*.8;}
    this.particles=this.particles.filter(p=>p.life>0);
    this.particles.forEach((p,i)=>{this.particlePositions.set(p.p.toArray(),i*3);this.particleColors.set(p.color.clone().multiplyScalar(p.life).toArray(),i*3);});
    this.particleGeometry.setDrawRange(0,this.particles.length);this.particleGeometry.attributes.position.needsUpdate=true;this.particleGeometry.attributes.color.needsUpdate=true;
    for(const dust of this.sandDust){dust.life-=dt;dust.p.addScaledVector(dust.v,dt);dust.p.y+=dt*.45;}
    this.sandDust=this.sandDust.filter(dust=>dust.life>0).slice(-96);
    this.sandDust.forEach((dust,i)=>{this.dustPositions.set(dust.p.toArray(),i*3);this.dustColors.set(dust.color.toArray(),i*3);});
    this.dustGeometry.setDrawRange(0,this.sandDust.length);this.dustGeometry.attributes.position.needsUpdate=true;this.dustGeometry.attributes.color.needsUpdate=true;
    const f=menu?this.frameAt(this.menuDistance,0):this.frameAtRacer(player),boost=running&&(player.boostTime>0||player.speed>145);
    let eye,target;
    if(menu){const narrow=innerWidth<700;eye=f.p.clone().addScaledVector(f.tangent,narrow?-13:-9).addScaledVector(f.right,narrow?1.1:4);eye.y+=narrow?4.6:3.6;target=f.p.clone().addScaledVector(f.tangent,narrow?4.5:3);target.y+=2.45;}
    else{
      // 카메라는 주자를 따라간다. 차선을 옮길 때 반대로 미는 오프셋을 주지 않는다.
      // 드리프트 때도 실제 진행 방향의 일부만 따라가 수평선이 흔들리지 않는다.
      const heading=clamp(player.velocityHeading||0,-.32,.32)*.38;
      const direction=f.tangent.clone().multiplyScalar(Math.cos(heading)).addScaledVector(f.right,Math.sin(heading));
      const flight=Math.max(0,player.jumpHeight||0);
      eye=f.p.clone().addScaledVector(direction,-12);eye.y+=5.1+flight*.75;
      target=this.frameAtRacer(player,player.distance+Math.min(65,24+Math.max(0,player.speed-110)*.2),player.lateral).p;target.addScaledVector(f.right,Math.sin(heading)*8);target.y+=3.05+flight*.5;
    }
    if(!this.cameraReady){this.camera.position.copy(eye);this.lookTarget=target.clone();this.cameraReady=true;}
    const smooth=1-Math.exp(-dt*(menu?3:10));this.camera.position.lerp(eye,smooth);this.lookTarget.lerp(target,smooth);this.camera.lookAt(this.lookTarget);
    const fov=menu?56:reducedMotion?68:player.speed>145?Math.min(83,72+(player.speed-145)*.07):boost?72:65+player.speed*.025;this.camera.fov=mix(this.camera.fov,fov,1-Math.exp(-dt*10));this.camera.updateProjectionMatrix();
    // PC 홈에서는 하단 선택 패널 위로 발까지 보이도록 시점을 필요한 만큼 올린다.
    if(this.camera.view?.enabled)this.camera.clearViewOffset();
    if(menu&&!mobileShowcase){
      const art=this.racerMeshes[0]?.model.group.children.find(child=>child.isSprite),dock=document.querySelector('.garage-dock')?.getBoundingClientRect();
      if(art&&dock){
        this.camera.updateMatrixWorld();
        const center=art.getWorldPosition(new THREE.Vector3()),depth=-center.clone().applyMatrix4(this.camera.matrixWorldInverse).z;
        const height=art.getWorldScale(new THREE.Vector3()).y*this.camera.projectionMatrix.elements[5]*innerHeight/(2*depth);
        const feet=(1-center.project(this.camera).y)*innerHeight/2+art.center.y*height;
        const rise=Math.max(0,feet-dock.top+24);
        if(rise>0)this.camera.setViewOffset(innerWidth,innerHeight,0,rise,innerWidth,innerHeight);
      }
    }
    const lightTarget=this.frameAt(menu?this.menuDistance:player.distance+18).p;this.sun.position.copy(lightTarget).add(new THREE.Vector3(-115,160,-68));this.sun.target.position.copy(lightTarget);
    this.speedFX.update(dt,race,{menu,reducedMotion});
    // 안개 너머 1.4km 밖의 공간 묶음은 GPU에 보내지 않는다.
    // 현재 주행 구역의 가드레일·장식만 그리며 멀리 보이는 큰 지형은 유지한다.
    for(const {mesh,bounds} of this.scene.userData.harbourChunks||[])mesh.visible=bounds.center.distanceToSquared(this.camera.position)<(1400+bounds.radius)**2;
    if(this.sky)this.sky.position.copy(this.camera.position);
    this.renderer.render(this.scene,this.camera);
    this.menuShowcaseBounds=null;
    if(mobileShowcase){
      const art=this.racerMeshes[0]?.model.group.children.find(child=>child.isSprite);
      if(art){
        const rect=selector=>document.querySelector(selector)?.getBoundingClientRect();
        const box=fitMenuShowcase({width:innerWidth,height:innerHeight,hall:rect('#hall-of-fame'),track:rect('.track-card'),dock:rect('.garage-dock'),header:rect('.topbar'),stage:rect('#portrait-character-stage'),aspect:art.scale.x/art.scale.y});
        if(box){
          this.menuSprite.material=art.material;this.menuSprite.scale.set(box.width,box.height,1);this.menuSprite.position.set(box.x,innerHeight-box.y,0);
          this.menuCamera.right=innerWidth;this.menuCamera.top=innerHeight;this.menuCamera.updateProjectionMatrix();
          this.menuShowcaseBounds={left:box.x-box.width/2,right:box.x+box.width/2,top:box.y-box.height,bottom:box.y};
          const clear=this.renderer.autoClear;this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.menuScene,this.menuCamera);this.renderer.autoClear=clear;
        }
      }
    }
  }
  updateFootTrails(frame,racer,dt) {
    const feet=[-.48,.48].map(side=>{const p=frame.p.clone().addScaledVector(frame.right,side);p.y+=.06;return p;});
    if(!racer.airborne&&racer.petId!=='yongyong'&&racer.drift&&racer.speed>20&&this.previousFeet){
      // 두 바퀴 자국 대신 착지한 발에서만 짧은 마찰광이 남는다.
      const step=this.clock*(8+racer.speed*.045),foot=Math.floor(step)%2;
      if(step%1<.64)this.trailSegments.push({a:this.previousFeet[foot],b:feet[foot],life:.14,color:new THREE.Color(racer.driftCharge>=65?'#ffdf85':'#8ceaf2')});
    }
    this.previousFeet=racer.airborne?null:feet;
    this.trailSegments=this.trailSegments.filter(t=>(t.life-=dt)>0).slice(-190);
    if(!this.trailGeometry){this.trailGeometry=new THREE.BufferGeometry();this.trailVertices=new Float32Array(200*18);this.trailColors=new Float32Array(200*18);this.trailGeometry.setAttribute('position',new THREE.BufferAttribute(this.trailVertices,3));this.trailGeometry.setAttribute('color',new THREE.BufferAttribute(this.trailColors,3));const trail=new THREE.Mesh(this.trailGeometry,new THREE.MeshBasicMaterial({vertexColors:true,transparent:true,opacity:.62,side:THREE.DoubleSide,depthWrite:false}));trail.frustumCulled=false;this.scene.add(trail);}
    this.trailSegments.forEach((t,i)=>{const side=t.b.clone().sub(t.a).cross(UP).normalize().multiplyScalar(.09);const vertices=[t.a.clone().add(side),t.b.clone().add(side),t.a.clone().sub(side),t.a.clone().sub(side),t.b.clone().add(side),t.b.clone().sub(side)];vertices.forEach((v,j)=>{this.trailVertices.set(v.toArray(),i*18+j*3);this.trailColors.set(t.color.clone().multiplyScalar(Math.min(1,t.life)).toArray(),i*18+j*3);});});
    this.trailGeometry.setDrawRange(0,this.trailSegments.length*6);this.trailGeometry.attributes.position.needsUpdate=true;this.trailGeometry.attributes.color.needsUpdate=true;
  }
  resize() {this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();}
  quality(high) {this.renderer.shadowMap.enabled=high;this.renderer.setPixelRatio(Math.min(devicePixelRatio,high?1.65:1));this.resize();}
  get mapPoints(){return this.samples.filter((_,i,points)=>i%10===0||i===points.length-1).map(f=>({x:f.p.x,z:f.p.z}));}
}
