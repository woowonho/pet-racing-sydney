import {CityWorld} from './world.js';
import {Race,formatTime} from './physics.js';
import {createHallOfFame} from './hall-of-fame.js';
import {loadCharacterTextures} from './characters.js';
import {RaceAudio} from './audio.js';
import {bindTouchInput} from './touch-input.js';
import {bindRecording} from './recording-ui.js';
import {RunStats} from './run-stats.js';

const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id).classList.toggle('hidden',!on);
const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem('pet-racing-'+key))??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem('pet-racing-'+key,JSON.stringify(value));}catch{}}};
const touchDevice=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
const appleKeyboard=/Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform||navigator.platform||'');
const boostKeys=appleKeyboard?['Space']:['ControlLeft','ControlRight','Space'];
const settings=Object.assign({auto:touchDevice,high:!matchMedia('(pointer:coarse)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,muted:false},storage.get('settings-sydney-v4',{}));
const keys=new Set(),touch={};
let touchInput;
let recording, recordingPausedRace = false;
let pendingPortraitStart=false,startingRace=false;
const autoAccelerate=()=>touchDevice||settings.auto;
const portrait=()=>touchDevice&&innerHeight>innerWidth;
function clearInput(){keys.clear();touchInput?.clear();Object.keys(touch).forEach(key=>touch[key]=false);}
function syncOrientation(){
  const blocked=portrait()&&(!menu||pendingPortraitStart),gate=$('landscape-dialog');
  document.body.classList.toggle('portrait-blocked',blocked);
  if(blocked){clearInput();if(!menu&&race)pause();if(gate&&!gate.open)gate.showModal();}
  else if(gate?.open)gate.close();
  // 홈은 세로로 둘러보고, 시작 요청 뒤 가로로 돌리면 한 번만 출발한다.
  if(!portrait()&&menu&&pendingPortraitStart&&!startingRace)void startRace();
}
const fullscreenElement=()=>document.fullscreenElement||document.webkitFullscreenElement;
function fullscreenLabel(){
  const active=Boolean(fullscreenElement()),button=$('fullscreen');
  const label=$('fullscreen-label');if(label)label.textContent=active?'화면 축소':'전체화면';
  button.setAttribute('aria-label',active?'전체화면 종료':'전체화면으로 플레이');
  button.setAttribute('aria-pressed',String(active));button.title=active?'전체화면 종료':'전체화면으로 플레이';
}
async function requestFullscreen(notifyUnavailable=false){
  const element=document.documentElement,request=element.requestFullscreen||element.webkitRequestFullscreen;
  try{
    if(!request)throw new Error('fullscreen unavailable');
    if(!fullscreenElement())await request.call(element);
  }catch{
    if(notifyUnavailable)toast(touchDevice?'전체화면을 지원하지 않는 브라우저예요. 휴대폰을 가로로 돌려 플레이하세요.':'이 브라우저에서는 전체화면을 사용할 수 없어요.',3500);
  }
  fullscreenLabel();
}
async function enterLandscape({notifyUnavailable=false}={}){
  if(!touchDevice)return;
  // 전체 화면·방향 잠금을 지원하는 브라우저에서만 요청한다. 실패해도 직접 회전해 플레이할 수 있다.
  await requestFullscreen(notifyUnavailable);
  try{await screen.orientation?.lock?.('landscape');}catch{}
  syncOrientation();
}
let pets,world,race,runStats,selected,menu=true,toastTimer=0,countTimer=0,hudClock=0,last=0,wasBoosting=false,wasState='',gamepadSteer=0;
const audio=new RaceAudio();audio.setMuted(settings.muted);
// 1랩 순환 코스 기록은 이전 편도 코스와 따로 비교한다.
const recordKey='records-sydney-v15-circuit';
const recorded=storage.get(recordKey,{});
let feedback={text:'',detail:'',kind:'',until:0},leaderboardRows=[];
let hall;
const courseFeatures=()=>world?.features||world?.curve?.features||[];
const wrapDistance=d=>world.isClosed===false?Math.max(0,Math.min(world.length,d)):((d%world.length)+world.length)%world.length;
function featureAhead(distance){
  // 한 바퀴를 마친 뒤의 출발 구간을 다음 목표로 다시 예고하지 않는다.
  const here=Math.max(0,Math.min(world.length,distance));
  // 철골 위에서는 아래 본선의 점프나 코너 대신 현재 분기의 출구를 안내한다.
  const route=world?.routes?.find(r=>r.id===race?.player?.routeId);
  if(route)return{...route,active:true,distance:0,remaining:Math.max(0,route.end-here)};
  const candidates=courseFeatures().filter(feature=>Number.isFinite(feature.start)&&Number.isFinite(feature.end)
    &&!(feature.type==='shortcut'&&here>feature.start+15&&!race?.player?.routeId)).map(feature=>{
    const start=Math.max(0,Math.min(world.length,feature.start)),end=Math.max(0,Math.min(world.length,feature.end));
    const active=start<=end?here>=start&&here<=end:here>=start||here<=end;
    return{...feature,active,distance:active?0:start>=here?start-here:Infinity,remaining:active?Math.max(0,end-here):0};
  }).filter(feature=>Number.isFinite(feature.distance)).sort((a,b)=>a.distance-b.distance||({gap:9,shortcut:8,dash:7,tunnel:6,precision:5.5,'speed-bump':5.2,hairpin:5}[b.type]||(b.rhythm?4:0))-({gap:9,shortcut:8,dash:7,tunnel:6,precision:5.5,'speed-bump':5.2,hairpin:5}[a.type]||(a.rhythm?4:0)));
  const speed=race?.player?.speed||65,active=candidates.find(f=>f.active);
  const warnings=candidates.filter(f=>!f.active&&['gap','shortcut','hairpin','braking','precision','chicane','technical','speed-bump'].includes(f.type)
    &&f.distance<Math.max(120,speed*(['gap','shortcut'].includes(f.type)?2.6:2.1)));
  // 이륙·급코너 한가운데서는 현재 동작을 읽게 하고, 출구에 가까워지면
  // 긴 지역 이름 대신 바로 다음 코너를 미리 보여 준다.
  const nestedWarning=active&&warnings.find(f=>f.start<active.end&&['precision','gap','shortcut','speed-bump'].includes(f.type));
  if(active&&!nestedWarning&&['gap','jump','shortcut','hairpin','dash'].includes(active.type)&&active.remaining>Math.max(35,speed*.55))return active;
  if(active?.type==='tunnel'&&active.remaining>Math.max(160,speed*1.2))return active;
  return warnings[0]||active||candidates[0]||null;
}
function courseAdvice(feature,p){
  if(p.falling)return '부스터를 준비해 다시 도전';
  if(p.routeId){
    const route=world.routes.find(r=>r.id===p.routeId);
    if(route?.kind==='bridge-mach')return p.routeProgress>route.routeLength*.7?'출구 감속 · 본선 합류 준비':'철골 진공관 · 아치 위로 마하 질주';
    return '상층 라인 유지 · 출구에서 본선 착지';
  }
  if(p.airborne)return '착지할 방향을 맞춰';
  const type=feature.type,theme=feature.theme||'',label=feature.label||'';
  if(type==='gap')return `N₂O 유지 · ${Math.ceil((feature.minSpeed||96)*3.6/10)*10} km/h 이상`;
  if(type==='shortcut')return feature.kind==='bridge-mach'?`${feature.entryLateral<0?'왼쪽':'오른쪽'} 청록 입구로 · 본선도 선택 가능`:`${feature.entryLateral<0?'왼쪽':'오른쪽'} 진입 + N₂O · 상층 지름길`;
  if(type==='speed-bump')return '둥근 방지턱 · 정면으로 넘어가기';
  if(type==='dash')return '푸른 화살표 차선 · 빠르게 가속';
  if(type==='hairpin')return feature.active?(feature.advice||'시선을 출구로 · 역조향으로 회복'):feature.surface==='snow'?'설산 내리막 · 다음 180°':'다음 180° · 진입 전에 감속';
  if(type==='tunnel')return feature.active&&feature.remaining<Math.max(180,p.speed*1.5)?'터널 출구 제동 · 다음 코너 대비':'중앙 정렬 · 초고속 터널 진입';
  if(type==='braking')return feature.advice||(/tunnel|터널/.test((feature.id||'')+label)?'터널 출구 제동 · 코너 전에 감속':'내리막 끝 · 코너 전에 감속');
  if(feature.advice)return feature.advice;
  if((theme==='ice'||theme==='snow'||/설산|설벽/.test(label))&&/내리막|다운힐|descent|downhill/.test(label+(feature.rhythm||'')))return '설산 내리막 · 속도를 줄이고 다음 코너';
  if(/슬랄롬|slalom/.test(label+(feature.rhythm||'')))return '짧게 꺾고 회복 · 반대 코너로 연결';
  const rhythmAdvice={sweep:'안쪽 라인을 잡고 탈출에서 가속',crest:'정상 너머 내리막 · 다음 굽이를 봐',reverse:'한 번 회수하고 반대 코너로 연결',compression:'내려갔다 올라올 때 자세를 회복',rolling:'연속 요철 · 시선을 다음 굽이로'};
  if(rhythmAdvice[feature.rhythm])return rhythmAdvice[feature.rhythm];
  return ({jump:'정면으로 진입 · 속도 유지',precision:'협로 진입 · 짧고 정확하게 조향',chicane:'짧게 미끄러지고 반대로 전환',speed:'탈출을 정렬하고 부스터',finish:'마지막 코너를 돌아 출발선으로'}[type])||'시선을 다음 코너로 · 탈출에서 가속';
}
function raceFeedback(text,detail='',kind='clean',duration=1.1){
  feedback={text,detail,kind,until:race.time+duration};
}
const petById=id=>pets.find(p=>p.id===id)||pets[0];
function saveSettings(){storage.set('settings-sydney-v4',settings);}
function toast(text,duration=1600){$('toast').textContent=text;$('toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('toast').classList.remove('show'),duration);}
function keyboardLabels(){
  document.querySelectorAll('[data-boost-key]').forEach(el=>{el.textContent=appleKeyboard?'Space':'Ctrl';el.setAttribute('aria-label',appleKeyboard?'스페이스바':'Control');el.title=appleKeyboard?'Space':'Ctrl 또는 Space';});
  document.querySelectorAll('[data-boost-alternative]').forEach(el=>el.hidden=appleKeyboard);
}
function touchLabels(){
  document.body.classList.toggle('auto-drive',autoAccelerate());
  $('touch-mode-guide').textContent='자동 가속 · 왼손 부스터·드리프트 / 오른손 조향';
  $('touch-help').textContent='가로 모드 · 전체화면을 권장해요. 오른쪽 위 전체화면 버튼을 눌러 화면을 넓히세요. 오른손으로 ◀ ▶, 왼손으로 DRIFT와 N₂O를 사용해요.';
  if(touchDevice){
    $('help-steer-copy').textContent='자동으로 앞으로 달려요. 오른쪽 ◀ ▶ 패드로 조향하고, 손가락을 떼지 않고 반대 패드로 밀면 바로 역조향해요.';
    $('help-drift-copy').textContent='방향 + DRIFT를 짧게 눌러 각을 잡고, 길게 끌어 풀 드리프트를 해요. 반대 방향으로 자세를 회수하면 커팅. 부스터 중 DRIFT를 유지한 채 얕은 각을 정확히 회수하면 고속 커팅으로 감속을 줄여요.';
    $('help-boost-copy').textContent='왼쪽 N₂O로 모아 둔 부스터를 사용해요. 드리프트로 충전해 최대 2개까지 보관하고, 소닉은 부스터를 쓰면 스핀대시로 변해요. 슬롯이 비었을 때 깨끗한 커팅 뒤 NOW가 뜨면 N₂O를 다시 눌러 짧게 재가속해요.';
    const label=$('auto-control-note');if(label)label.textContent='모바일은 자동 가속 · 두 엄지로 조작';
  }
}
function soundLabel(){const on=audio.context?.state==='running'&&!settings.muted;$('sound').innerHTML=`${on?'♫':'♪'}<span>${on?'소리 끄기':'소리 켜기'}</span>`;$('sound').setAttribute('aria-label',on?'소리 끄기':'소리 켜기');$('sound').title=on?'소리 끄기':'소리 켜기';}
async function init(){
  try{
    const response=await fetch('assets/pets/manifest.json');if(!response.ok)throw new Error('펫 정보를 불러오지 못했어요.');pets=await response.json();
    $('load-message').textContent='레이서와 시드니의 바다를 준비하는 중';
    await Promise.all(pets.map(p=>p.portrait).map(src=>new Promise((resolve,reject)=>{const i=new Image();i.onload=resolve;i.onerror=()=>reject(new Error('펫 이미지 로딩 실패'));i.src=src;})));
    const characterTextures=await loadCharacterTextures(pets);
    world=new CityWorld($('world'),settings.high?'high':'low',characterTextures);
    selected=petById(storage.get('pet','sonic'));
    hall=createHallOfFame({list:$('hall-list'),pets,counts:$('run-counts')});hall.load();
    $('track-length').textContent=(world.length/1000).toFixed(3);
    $('track-distance-mobile').textContent=`${(world.length/1000).toFixed(3)} km · 1랩`;
    $('roster-count').textContent=String(pets.length);
    $('roster').replaceChildren(...pets.map(p=>{const btn=document.createElement('button');btn.className='pet-card';btn.dataset.pet=p.id;btn.setAttribute('aria-label',p.name+' 선택');btn.title=p.name;btn.setAttribute('aria-pressed',String(p.id===selected.id));const img=document.createElement('img');img.src=p.portrait;img.alt='';const label=document.createElement('span');label.textContent=p.name;btn.append(img,label);btn.addEventListener('click',()=>selectPet(p));return btn;}));
    bindControls();resetRace();selectPet(selected,false);drawMap($('track-preview'),false);
    show('loading',false);show('garage');$('start').focus({preventScroll:true});syncOrientation();last=performance.now();requestAnimationFrame(frame);
    // 검증 시 실제 게임 상태와 렌더링 통계를 읽을 수 있는 읽기 전용 관찰 인터페이스.
    window.petRacing={get state(){return{state:race.state,menu,mobile:{enabled:touchDevice,portrait:portrait(),auto: autoAccelerate(),controls:{...touch}},keyboard:{boostKey:appleKeyboard?'Space':'Control',held:[...keys]},course:world.courseId||'sydney-harbour-v15',courseFormat:world.courseFormat||'circuit',totalLaps:1,pet:selected.id,time:race.time,position:race.position,lap:race.lap,speed:race.player.speed,boost:race.player.boost,boostTime:race.player.boostTime,distance:race.player.distance,lateral:race.player.lateral,screen:{runner:world.screenPosition(race.player.distance,race.player.lateral,race.player),center:world.screenPosition(race.player.distance,0,race.player)},routeId:race.player.routeId,routeProgress:race.player.routeProgress,falling:race.player.falling,elevation:world.heightAt(race.player.distance,race.player),grade:world.gradeAt?.(race.player.distance,race.player)||0,surface:world.surfaceAt(race.player.distance),cameraFov:world.camera.fov,models:world.racerMeshes.map(r=>({type:r.model.mode,vehicle:r.model.usesVehicle,animation:r.model.group.userData.animation,facing:r.model.group.userData.facing})),contacts:race.player.contactCount,lastContact:{time:race.player.lastContactTime,impact:race.player.lastContactImpact},heading:race.player.heading,velocityHeading:race.player.velocityHeading,slipAngle:race.player.slipAngle,airborne:Boolean(race.player.airborne),jumpHeight:race.player.jumpHeight||0,jumpVelocity:race.player.jumpVelocity||0,landingImpact:race.player.landingImpact||0,trackFeatures:courseFeatures().map(f=>({...f})),nextFeature:featureAhead(race.player.distance),driftQuality:race.player.driftQuality||0,driftCombo:race.player.driftCombo||0,drift:race.player.drift,driftPhase:race.player.driftPhase,boostGauge:race.player.boostGauge,boostItems:race.player.boostItems,turnRate:world.turnRateAt(race.player.distance,race.player),turnAhead:world.turnRateAt(race.player.distance+race.player.speed*.24,race.player),curvature:world.curvatureAt(race.player.distance,race.player),driftCharge:race.player.driftCharge,draftCharge:race.player.draftCharge||0,draftTime:race.player.draftTime||0,lapTimes:[...race.lapTimes],length:world.length,renderer:{calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles},racers:race.racers.map(r=>({id:r.id,pet:r.petId,position:r.position,distance:r.distance,lateral:r.lateral,speed:r.speed,airborne:Boolean(r.airborne),jumpHeight:r.jumpHeight||0,routeId:r.routeId,falling:r.falling,finished:r.finished}))};}};
  }catch(error){console.error(error);$('load-message').textContent=error.message;$('loading').querySelector('b').textContent='게임을 시작하지 못했어요';const b=document.createElement('button');b.className='primary';b.textContent='다시 불러오기';b.onclick=()=>location.reload();$('loading').append(b);if(/WebGL/i.test(error.message))$('load-message').textContent='브라우저의 하드웨어 가속을 켜고 다시 실행해 주세요.';}
}
function resetRace(){
  race=new Race({length:world.length,laps:1,loop:world.isClosed!==false,petId:selected.id,roster:pets,difficulty:'adaptive',roadHalfWidth:world.roadHalfWidth??11.5,roadHalfWidthAt:(d,r)=>world.roadHalfWidthAt(d,r),heightAt:(d,r)=>world.heightAt(d,r),routes:world.routes,apexGates:world.apexGates,trackFeatures:courseFeatures(),turnRateAt:(d,r)=>world.turnRateAt(d,r),gradeAt:(d,r)=>world.gradeAt(d,r),curvatureAt:(d,r)=>world.curvatureAt(d,r)});
  runStats=new RunStats(world.length,recorded.adaptive?.splits||[]);
  feedback={text:'',detail:'',kind:'',until:0};leaderboardRows=[];
  $('leaderboard').replaceChildren();
  for(const r of race.racers){
    const row=document.createElement('li');if(r.id==='player')row.className='me';
    const rank=document.createElement('b'),image=document.createElement('img'),name=document.createElement('span'),gap=document.createElement('small');
    image.src=petById(r.petId).portrait;image.alt='';name.textContent=r.id==='player'?'나 · '+r.name:r.name;
    row.append(rank,image,name,gap);$('leaderboard').append(row);leaderboardRows.push({r,row,rank,gap});
  }
  world.setRacers(race.racers.map(r=>petById(r.petId)));world.cameraReady=false;wasState='';wasBoosting=false;clearInput();
}
function selectPet(p,rebuild=true){selected=p;storage.set('pet',p.id);$('selected-name').textContent=p.name;$('selected-power').textContent=p.sonic?'부스터 특수 동작 · 스핀대시':'부스터 특수 동작 · 초고속 질주';document.querySelectorAll('.pet-card').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pet===p.id)));if(rebuild)resetRace();updateRecord();}
function updateRecord(){
  const best=recorded.adaptive?.time;
  $('record-label').textContent=best?'개인 최고 기록 '+formatTime(best):'첫 기록에 도전해 보세요';
  $('race-format-note').textContent='네 주행 페이스에 맞춰 함께 경쟁';
}
async function startRace(){
  if(startingRace)return;
  startingRace=true;
  try{
    // 시작 버튼의 터치에서 소리를 허용하고, 음성 허용 대기가 출발을 막지 않게 한다.
    void audio.unlock().then(soundLabel);
    if(!menu)recording?.stop('새 레이스를 시작해 녹화를 마쳤어요.');
    if(touchDevice){pendingPortraitStart=menu&&portrait();await enterLandscape();if(portrait())return;}
    pendingPortraitStart=false;
    document.querySelectorAll('dialog[open]').forEach(d=>d.close());resetRace();hall?.start();menu=false;document.body.classList.add('racing');clearTimeout(countTimer);clearTimeout(toastTimer);show('countdown',false);$('toast').classList.remove('show');show('garage',false);show('hud');show('pause-button');show('touch-controls');$('start').blur();soundLabel();race.start();handleEvents();
  }finally{startingRace=false;}
}
function backToGarage(){pendingPortraitStart=false;recording?.stop('레이서 선택으로 돌아와 녹화를 마쳤어요.');document.querySelectorAll('dialog[open]').forEach(d=>d.close());menu=true;document.body.classList.remove('racing');clearTimeout(countTimer);clearTimeout(toastTimer);resetRace();show('garage');show('hud',false);show('pause-button',false);show('touch-controls',false);show('countdown',false);document.body.classList.remove('boosting');$('toast').classList.remove('show');$('garage').scrollTop=0;$('start').focus({preventScroll:true});updateRecord();syncOrientation();}
function pause(){if(race?.pause()){clearInput();$('pause-dialog').showModal();$('resume').focus();}}
function resume(){if(portrait()){syncOrientation();return;}if(race.resume())$('pause-dialog').close();clearInput();last=performance.now();}
function openSettings(){if(!menu&&race.state!=='paused')pause();$('settings-dialog').showModal();}
function bindControls(){
  const exampleVideo=$('example-video');
  $('example-open').onclick=()=>{
    $('example-dialog').showModal();
    // 플레이 영상을 요청할 때만 내려받아 첫 게임 로딩을 가볍게 유지한다.
    if(!exampleVideo.getAttribute('src'))exampleVideo.src=exampleVideo.dataset.src;
    exampleVideo.play().catch(()=>{}); // 자동 재생 제한 시 기본 재생 버튼을 사용한다.
  };
  $('example-dialog').addEventListener('close',()=>exampleVideo.pause());
  document.addEventListener('visibilitychange',()=>{if(document.hidden)exampleVideo.pause();});
  exampleVideo.addEventListener('error',()=>{$('example-error').hidden=false;});
  exampleVideo.addEventListener('loadeddata',()=>{$('example-error').hidden=true;});
  recording=bindRecording({audio,toast,audioReady:soundLabel,beforeOpen:()=>{recordingPausedRace=!menu&&['racing','countdown'].includes(race?.state);if(recordingPausedRace)pause();clearInput();},afterClose:()=>{if(recordingPausedRace){recordingPausedRace=false;resume();}}});
  $('start').onclick=startRace;$('race-again').onclick=startRace;$('restart').onclick=startRace;$('resume').onclick=resume;$('pause-button').onclick=pause;$('garage-back').onclick=backToGarage;$('result-garage').onclick=backToGarage;
  updateRecord();
  $('settings-open').onclick=openSettings;$('help-open').onclick=()=>$('help-dialog').showModal();
  document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
  $('pause-dialog').addEventListener('cancel',e=>{e.preventDefault();resume();});$('results-dialog').addEventListener('cancel',e=>e.preventDefault());
  $('sound').onclick=async()=>{if(!audio.context){settings.muted=false;await audio.unlock();}else settings.muted=!settings.muted;if(!settings.muted)await audio.unlock();audio.setMuted(settings.muted);saveSettings();soundLabel();};
  $('fullscreen').onclick=async()=>{try{if(fullscreenElement()){const exit=document.exitFullscreen||document.webkitExitFullscreen;await exit?.call(document);fullscreenLabel();}else if(touchDevice)await enterLandscape({notifyUnavailable:true});else await requestFullscreen(true);}catch{toast('브라우저 전체화면 기능을 이용해 주세요.');}};
  document.addEventListener('fullscreenchange',fullscreenLabel);document.addEventListener('webkitfullscreenchange',fullscreenLabel);fullscreenLabel();
  $('auto-accelerate').checked=autoAccelerate();$('auto-accelerate').disabled=touchDevice;$('high-quality').checked=settings.high;$('reduce-motion').checked=settings.reduced;document.body.classList.toggle('reduced',settings.reduced);
  $('auto-accelerate').onchange=e=>{settings.auto=e.target.checked;touchLabels();saveSettings();};$('high-quality').onchange=e=>{settings.high=e.target.checked;world.quality(settings.high);saveSettings();};$('reduce-motion').onchange=e=>{settings.reduced=e.target.checked;document.body.classList.toggle('reduced',settings.reduced);saveSettings();};
  const gameKeys=['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','KeyW','KeyA','KeyS','KeyD','ShiftLeft','ShiftRight',...boostKeys];
  window.addEventListener('keydown',e=>{
    // 포커스 전환 등으로 modifier의 keyup이 빠져도 다음 입력에서 남은 상태를 정리한다.
    if(!e.shiftKey){keys.delete('ShiftLeft');keys.delete('ShiftRight');}
    if(!e.ctrlKey){keys.delete('ControlLeft');keys.delete('ControlRight');}
    const dialogOpen=document.querySelector('dialog[open]');if(e.code==='Escape'){if(dialogOpen)return;e.preventDefault();if(!menu)pause();return;}
    if(e.code==='KeyM'&&!e.repeat&&!e.metaKey&&!e.ctrlKey&&!e.altKey){$('sound').click();return;}if(menu||dialogOpen)return;
    if(gameKeys.includes(e.code)){e.preventDefault();keys.add(e.code);}
  });window.addEventListener('keyup',e=>{
    keys.delete(e.code);
    if(!menu&&!document.querySelector('dialog[open]')&&gameKeys.includes(e.code))e.preventDefault();
  });
  const clear=clearInput;
  window.addEventListener('blur',()=>{clear();if(!menu)pause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clear();if(!menu)pause();}});
  if(touchDevice)document.body.classList.add('touch');keyboardLabels();touchLabels();$('touch-controls').addEventListener('contextmenu',e=>e.preventDefault());
  touchInput=bindTouchInput($('touch-controls'),touch,()=>!menu&&!portrait()&&!document.querySelector('dialog[open]'));
  $('landscape-dialog').addEventListener('cancel',event=>{event.preventDefault();if(menu)backToGarage();});
  $('landscape-enter').onclick=()=>menu?startRace():enterLandscape({notifyUnavailable:true});
  $('landscape-back').onclick=backToGarage;
  window.addEventListener('resize',syncOrientation);
  screen.orientation?.addEventListener('change',syncOrientation);
  soundLabel();
}
function readInput(){
  let steer=Number(Boolean(keys.has('ArrowRight')||keys.has('KeyD')||touch.right))-Number(Boolean(keys.has('ArrowLeft')||keys.has('KeyA')||touch.left));
  let throttle=autoAccelerate()||keys.has('KeyW')||keys.has('ArrowUp')||touch.throttle;let brake=keys.has('KeyS')||keys.has('ArrowDown')||touch.brake;
  let drift=keys.has('ShiftLeft')||keys.has('ShiftRight')||touch.drift,boost=boostKeys.some(key=>keys.has(key))||touch.boost;
  const gp=navigator.getGamepads?.()?.[0];if(gp){const axis=gp.axes[0]||0;gamepadSteer=Math.abs(axis)>.14?axis:0;steer=gamepadSteer||steer;throttle=throttle||gp.buttons[7]?.value>.1; brake=brake||gp.buttons[6]?.value>.1;drift=drift||gp.buttons[0]?.pressed;boost=boost||gp.buttons[1]?.pressed;}
  return{steer,throttle:throttle?1:0,brake:brake?1:0,drift,boost};
}
function handleEvents(){
  for(const event of race.drainEvents()){
    if(event.racerId!=='player')continue;
    runStats.event(event);
    if(event.type!=='drift-release'||!event.crashed)audio.event(event.type==='apex'?'drift-charge':event.type==='mini-boost'?'boost':event.type==='countdown'?'count':event.type==='draft'?'boost':event.type==='boost-ready'?'drift-charge':event.type,event);
    if(event.type==='apex')raceFeedback(`APEX ×${event.combo}`,`안쪽 라인 성공 · N₂O +${event.reward}%`,'clean',1.3);
    if(event.type==='countdown'||event.type==='go'){
      const el=$('countdown');el.textContent=event.type==='go'?'출발!':event.value;show('countdown');el.classList.remove('pulse');void el.offsetWidth;el.classList.add('pulse');clearTimeout(countTimer);if(event.type==='go')countTimer=setTimeout(()=>show('countdown',false),900);
    }
    if(event.type==='boost'&&event.source!=='dash')raceFeedback(selected.sonic?'스핀대시':'부스터',`${Math.round((event.duration||3)*10)/10}초 · 탈출 가속`,'boost',.9);
    if(event.type==='mini-ready'&&race.player.boostItems===0)raceFeedback('지금 N₂O','커팅 탈출 · 타이밍 가속','charge',.25);
    if(event.type==='mini-boost')raceFeedback('타이밍 가속','정확한 커팅 탈출','boost',.65);
    if(event.type==='draft')raceFeedback('슬립스트림','앞선 주자의 바람을 타!','draft',1.1);
    if(event.type==='boost-ready')raceFeedback('N₂O 충전',`${event.items} / 2 · ${touchDevice?'왼쪽 N₂O':appleKeyboard?'Space':'Ctrl / Space'} 사용`,'charge',1.15);
    if(event.type==='drift-link')raceFeedback('드리프트 연결','슬립 연결 · 속도 유지','clean',.65);
    if(event.type==='drift-release'&&!event.crashed){
      const quality=Number(event.quality??race.player.driftQuality)||0;
      const chain=event.chain||race.player.driftCombo||0;
      const technique={short:'숏 드리프트',full:'풀 드리프트',cut:'커팅', 'speed-cut':'고속 커팅'}[event.technique];
      if(technique&&event.clean!==false)raceFeedback(technique,event.technique==='speed-cut'?'역조향 정렬 · 감속 최소화':chain>1?`${chain}회 연결 · N₂O 충전`:'슬립각으로 게이지 충전','clean',.95);
      if(!technique&&event.clean!==false&&quality>=.55)raceFeedback(quality>=.8?'퍼펙트 드리프트':'클린 드리프트',chain>1?`${chain}회 연속 성공`:'그립 회복 · 다음 코너로','clean',.85);
    }
    if(event.type==='warp-enter')raceFeedback('WARP','터널 초고속 흡입','boost',1.1);
    if(event.type==='dash')raceFeedback('MACH','푸른 화살표 · 최고 출력','boost',1.1);
    if(event.type==='route-enter'){
      const route=world.routes.find(r=>r.id===race.player.routeId);
      if(route?.kind==='bridge-mach'){raceFeedback('ARCH MACH','철골 진공관 · 아치 위로 가속','boost',1.2);audio.event('boost');}
      else raceFeedback('SKY CUT','상층 지름길 · 착지선을 맞춰','jump',1.2);
    }
    if(event.type==='gap-clear')raceFeedback('GAP CLEAR','부스터 점프 성공','clean',1.1);
    if(event.type==='fall')raceFeedback('경로 복귀','N₂O를 켜고 점프해','land',2.5);
    if(event.type==='respawn')raceFeedback('다시 도전','부스터 1개 확보 · 점프 전 사용','charge',2);
    if(event.type==='jump')raceFeedback('공중 도약','방향을 맞추고 착지 준비','jump',.7);
    if(event.type==='land')raceFeedback('착지',event.clean?'자세 안정 · 바로 가속':'그립 회복','land',.6);
    if(event.type==='wall'){$('flash').classList.add('hit');setTimeout(()=>$('flash').classList.remove('hit'),180);}
    if(event.type==='contact'){$('flash').classList.add('hit');setTimeout(()=>$('flash').classList.remove('hit'),100);}
    if(event.type==='finish')finishRace();
  }
}
function finishRace(){
  queueMicrotask(()=>recording?.stop('완주해 녹화를 마쳤어요.'));
  show('countdown',false);show('touch-controls',false);show('pause-button',false);document.body.classList.remove('boosting');
  const total=race.player.finishTime;const key='adaptive';const isNew=!recorded[key]||total<recorded[key].time;
  hall?.finish(total,selected.id);
  if(isNew){recorded[key]={time:total,pet:selected.id,date:new Date().toISOString(),splits:runStats.splits.map(({distance,time})=>({distance,time})),highlights:runStats.summary()};storage.set(recordKey,recorded);}
  $('result-pet').src=selected.portrait;$('result-position').textContent=race.position;$('result-subtitle').textContent=isNew?'새로운 개인 최고 기록':'레이스 완료';$('result-message').textContent=race.position===1?'하버런의 주인공은 너야.':race.position<=3?'포디움에 올랐어!':'다음 코너에서 뒤집어 보자.';
  $('result-time').textContent=formatTime(total);$('result-best').textContent=formatTime(recorded[key].time);
  $('result-laps').innerHTML=`<span>완주 거리<b>${(world.length/1000).toFixed(3)} km</b></span><span>레이스 형식<b>순환 코스 · 1랩</b></span>`;
  const highlights=runStats.summary();
  recorded.apexBest=Math.max(recorded.apexBest||0,race.player.apexBest);storage.set(recordKey,recorded);
  $('result-highlights').innerHTML=[['클린 드리프트',highlights.cleanDrifts+'회'],['부스터',highlights.boosts+'회'],['추월',highlights.overtakes+'회'],['최고 속도',highlights.topSpeed+' km/h'],['APEX 공략',`${race.player.apexHits} / ${world.apexGates.length}`],['최대 연속 APEX',`${race.player.apexBest}회 · 최고 ${recorded.apexBest}`]].map(([label,value])=>`<div><span>${label}</span><b>${value}</b></div>`).join('');
  $('result-split-rows').innerHTML=runStats.splits.map(split=>`<div><span>${split.progress===1?'결승':`${Math.round(split.progress*100)}%`} · ${(split.distance/1000).toFixed(2)} km</span><b>${formatTime(split.time)}</b><small class="${split.delta!==null&&split.delta<0?'ahead':''}">${split.delta===null?'첫 기록':`${split.delta>0?'+':''}${split.delta.toFixed(2)}초`}</small></div>`).join('');
  $('result-splits').open=false;
  $('result-standing').replaceChildren(...[...race.racers].sort((a,b)=>a.position-b.position).map(r=>{const row=document.createElement('div');row.className='standing-row'+(r.id==='player'?' me':'');const pos=document.createElement('b');pos.textContent=r.position+'위';const name=document.createElement('span');name.textContent=r.name+(r.id==='player'?' · 나':'');const time=document.createElement('small');time.textContent=r.finished?formatTime(r.finishTime):'주행 중 · '+Math.min(99,Math.floor(r.distance/world.length*100))+'%';row.append(pos,name,time);return row;}));
  $('results-dialog').showModal();$('race-again').focus({preventScroll:true});$('results-dialog').scrollTop=0;
}
function drawMap(canvas,live){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const pts=world.mapPoints;
  const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);const s=Math.min((w-42)/(maxX-minX),(h-24)/(maxZ-minZ));
  const xy=p=>[w/2+(p.x-(minX+maxX)/2)*s,h/2+(p.z-(minZ+maxZ)/2)*s];
  function path(){ctx.beginPath();pts.forEach((p,i)=>{const[x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});if(world.isClosed!==false)ctx.closePath();}
  path();ctx.lineWidth=live?9:11;ctx.strokeStyle='#0c283bbb';ctx.stroke();path();ctx.lineWidth=live?4:5;ctx.strokeStyle='#d4f5f0';ctx.stroke();
  if(live){const completed=Math.max(1,Math.ceil(Math.min(1,race.player.distance/world.length)*(pts.length-1)));ctx.beginPath();pts.slice(0,completed+1).forEach((p,i)=>{const[x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.lineWidth=4;ctx.strokeStyle='#67dbbf';ctx.stroke();}
  // 분기선도 지도에 표시해 본선과 지름길 중 어느 쪽으로 달리는지 읽게 한다.
  for(const route of world.routes||[]){
    ctx.beginPath();for(let i=0;i<=48;i++){const [x,y]=xy(route.frameAt(route.start+route.span*i/48).p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);}
    ctx.lineWidth=live?1.7:2;ctx.strokeStyle=route.kind==='bridge-mach'?'#41e7ff':'#ffe29a';ctx.setLineDash([3,2]);ctx.stroke();ctx.setLineDash([]);
  }
  for(const feature of courseFeatures()){
    if(!['jump','gap','shortcut','dash','tunnel','hairpin','precision'].includes(feature.type))continue;
    const point=world.frameAt(feature.start).p,[x,y]=xy(point);
    ctx.beginPath();ctx.arc(x,y,live?2.4:3.5,0,Math.PI*2);ctx.fillStyle=feature.type==='jump'?'#ffe29a':feature.type==='tunnel'?'#c6a0ff':feature.type==='precision'?'#72ddc7':'#ffad8d';ctx.fill();
  }
  ctx.save();ctx.shadowColor='#ffda85';ctx.shadowBlur=7;ctx.beginPath();pts.slice(0,9).forEach((p,i)=>{const[x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#ffdc86';ctx.lineWidth=5;ctx.stroke();ctx.restore();
  const [finishX,finishY]=xy(world.isClosed!==false?pts[0]:pts[pts.length-1]);ctx.fillStyle='#fff';ctx.fillRect(finishX-4,finishY-4,8,8);ctx.fillStyle='#163c4a';ctx.fillRect(finishX-4,finishY-4,4,4);ctx.fillRect(finishX,finishY,4,4);
  if(live){[...race.racers].reverse().forEach(r=>{const f=world.frameAtRacer(r);const[x,y]=xy({x:f.p.x,z:f.p.z});ctx.beginPath();ctx.arc(x,y,r.id==='player'?5:3,0,Math.PI*2);ctx.fillStyle=r.id==='player'?'#ffe293':petById(r.petId).color;ctx.fill();if(r.id==='player'){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}});}
}
function updateRaceContext(p){
  const feature=featureAhead(p.distance),callout=$('course-callout');
  const visible=race.state==='racing'&&feature&&(feature.active||feature.distance<Math.max(105,p.speed*2.15));
  callout.classList.toggle('hidden',!visible);
  if(visible){
    const type=feature.type,turn=world.turnRateAt(feature.start+Math.max(1,(feature.end-feature.start)*.45));
    callout.dataset.type=type;
    $('course-icon').textContent=feature.kind==='bridge-mach'?'◉':type==='gap'?'↗':type==='shortcut'?'⇧':type==='dash'?'≫':type==='jump'?'↗':type==='hairpin'?(turn<0?'↶':'↷'):type==='tunnel'?'◈':type==='finish'?'⚑':type==='speed'?'≫':type==='braking'?'!':'⌁';
    $('course-name').textContent=feature.hudLabel||feature.label||({jump:'하버 스카이 점프',hairpin:'180° 헤어핀',tunnel:'라이트 터널',chicane:'연속 S 코너'}[type]||'테크니컬 구간');
    $('course-distance').textContent=p.airborne?'공중':feature.active?(type==='finish'?`${Math.round(feature.remaining/5)*5} m`:type==='tunnel'?(feature.remaining<120?`${Math.round(feature.remaining/5)*5} m`:'질주'):'진입'):`${Math.max(5,Math.round(feature.distance/5)*5)} m`;
    $('course-advice').textContent=courseAdvice(feature,p);
  }
  const opponent=race.racers.filter(r=>r.id!=='player'&&!r.finished).sort((a,b)=>Math.abs(a.distance-p.distance)-Math.abs(b.distance-p.distance))[0];
  $('rival-card').classList.toggle('hidden',!opponent||race.state!=='racing');
  if(opponent){
    const delta=opponent.distance-p.distance,gap=Math.abs(delta),side=opponent.lateral-p.lateral;
    $('rival-card').classList.toggle('close',gap<18);
    $('rival-name').textContent=opponent.name;
    $('rival-status').textContent=gap<5?'사이드 바이 사이드':gap<25?'추월권 안에 있어':delta>0?'앞 주자와의 거리':'뒤에서 추격 중';
    $('rival-gap').textContent=gap<5?(Math.abs(side)<1.3?'접전':side<0?'왼쪽':'오른쪽'):`${delta>0?'앞':'뒤'} ${Math.round(gap)} m`;
  }
  const nearby=race.racers.filter(r=>r.id!=='player'&&!r.finished&&Math.abs(r.distance-p.distance)<7&&r.routeId===p.routeId&&Math.abs((r.jumpHeight||0)-(p.jumpHeight||0))<2);
  $('proximity-left').classList.toggle('visible',race.state==='racing'&&p.speed>18&&nearby.some(r=>r.lateral<p.lateral-.6&&r.lateral>p.lateral-5));
  $('proximity-right').classList.toggle('visible',race.state==='racing'&&p.speed>18&&nearby.some(r=>r.lateral>p.lateral+.6&&r.lateral<p.lateral+5));
  const chip=$('race-feedback'),active=feedback.until>race.time&&race.state==='racing';
  chip.classList.toggle('visible',active);chip.dataset.kind=feedback.kind;
  $('feedback-title').textContent=feedback.text;$('feedback-detail').textContent=feedback.detail;
}
function updateHud(){
  const p=race.player;$('position').textContent=p.position;$('lap').textContent=Math.min(100,Math.max(0,Math.floor(p.distance/world.length*100)));$('distance-left').textContent=(Math.max(0,world.length-p.distance)/1000).toFixed(1)+' km 남음';$('race-time').textContent=formatTime(race.time);$('best-lap').textContent=formatTime(recorded.adaptive?.time);$('speed').textContent=String(Math.round(p.speed*3.6)).padStart(3,'0');$('speed-fill').style.width=Math.min(100,p.speed/(p.speed>145?300:106)*100)+'%';
  $('boost-fill').style.width=p.boostGauge+'%';$('boost-title').textContent=p.speed>145?'MACH · 초고속 가속':p.boostTime>0?(selected.sonic?'스핀대시':'부스터 가속'):p.boostItems>0?'부스터 '+p.boostItems+'개':'부스터를 모아라';$('boost-title').style.color=p.boostItems>0?'#ffdb8a':'#e2f6f7';
  [...$('boost-slots').children].forEach((slot,i)=>{slot.classList.toggle('ready',i<p.boostItems);slot.classList.toggle('active',i===0&&p.boostTime>0);});
  const quality=p.driftQuality||0,timing=(p.miniBoostWindow||0)>0&&p.boostItems===0;
  $('drift-fill').style.width=Math.min(100,Math.abs(p.slipAngle||0)/.65*100)+'%';$('drift-fill').style.background=quality>.7?'#ffdf92':'#8bdafa';$('drift-label').textContent=timing?'지금 N₂O · 타이밍 가속':p.airborne?'공중 도약':p.driftPhase==='recover'?'역조향 · 그립 회복':p.drift?'드리프트 · '+(quality>.7?'좋은 슬립각':'라인을 이어가'):'드리프트로 N₂O 충전';$('drift-value').textContent=p.airborne?`${(p.jumpHeight||0).toFixed(1)} m`:Math.round(p.boostGauge)+'%';
  const nitroButton=document.querySelector('[data-touch=boost]');
  nitroButton.classList.toggle('ready',p.boostItems>0||timing);nitroButton.classList.toggle('timing',timing);nitroButton.classList.toggle('active',p.boostTime>0);
  nitroButton.classList.toggle('empty',p.boostItems===0&&!timing);
  const count=$('touch-boost-count');if(count)count.textContent=timing?'NOW':String(p.boostItems);
  nitroButton.setAttribute('aria-label',timing?'지금 누르면 타이밍 가속':'부스터 '+p.boostItems+'개');
  $('drive-state').textContent=p.falling?'경로 복귀 중':p.speed>145?'MACH · 초고속 질주':p.routeId?(world.routes.find(r=>r.id===p.routeId)?.kind==='bridge-mach'?'철골 진공관':'상층 지름길'):p.airborne?'공중 도약 · '+(p.jumpHeight||0).toFixed(1)+' m':p.draftTime>0?'슬립스트림 · 가속':p.boostTime>0?'최대 출력 · 부스터':p.drift?'드리프트':p.speed<2?'가속 대기':autoAccelerate()?'자동 달리기':'수동 달리기';
  $('draft-indicator').classList.toggle('hidden',!(p.draftCharge>8||p.draftTime>0));$('draft-fill').style.width=(p.draftTime>0?100:p.draftCharge||0)+'%';
  $('sector').textContent=world.sectorAt(p.distance,p);const ahead=world.curvatureAt(p.distance+35,p),grade=world.gradeAt?.(p.distance,p)||0,surface=world.surfaceAt(p.distance+35);$('corner-hint').textContent=world.routes.find(r=>r.id===p.routeId)?.kind==='bridge-mach'?'진공관 자동 가속 · 출구에서 본선 합류':surface.rough>.15?'노면 요철 · 속도에 주의':surface.rolling>.15?'연속 높낮이 · 코너 대비':Math.abs(ahead)>.25?(ahead>0?'우회전 코너 ↱':'↰ 좌회전 코너'):grade>.025?'오르막 · 부스터로 가속':grade<-.025?'내리막 · 다음 코너 대비':'직선 구간 · 부스터 타이밍';
  [...$('lap-dots').children].forEach((e,i)=>e.classList.toggle('done',p.distance>=runStats.markers[i]));
  for(const {r,row,rank,gap} of leaderboardRows){
    rank.textContent=r.position;row.style.order=r.position;
    row.classList.toggle('nearby',r.id!=='player'&&Math.abs(r.distance-p.distance)<20);
    row.classList.toggle('mobile-visible',r.id==='player'||Math.abs(r.position-p.position)<=1||r.position===1);
    const distance=Math.round(r.distance-p.distance);
    gap.textContent=r.id==='player'?'':r.finished?'완주':`${distance>0?'+':''}${distance} m`;
  }
  updateRaceContext(p);drawMap($('minimap'),true);
}
function frame(now){
  const dt=Math.max(0,Math.min((now-last)/1000,.05));last=now;
  if(!menu){
    race.update(dt,readInput(),world.curvatureAt(race.player.distance,race.player));
    const checkpoints=['racing','finished'].includes(race.state)?runStats.sample(race.player.finished?race.player.finishTime:race.time,race.player):[];
    handleEvents();
    if(race.state==='racing')for(const split of checkpoints){
      const delta=split.delta;
      raceFeedback(`${Math.round(split.progress*100)}% · ${split.sector}구간 통과`,delta===null?formatTime(split.time):`개인 최고 대비 ${delta>0?'+':''}${delta.toFixed(2)}초`,'checkpoint',2.4);
      audio.event('checkpoint');
    }
  }
  const p=race.player,boosting=!menu&&race.state==='racing'&&(p.boostTime>0||p.speed>145);
  if(boosting!==wasBoosting){document.body.classList.toggle('boosting',boosting);wasBoosting=boosting;}
  const activeFeature=courseFeatures().filter(f=>p.distance>=f.start&&p.distance<=f.end&&(f.type!=='shortcut'||f.id===p.routeId)).sort((a,b)=>Number(b.type==='dash')-Number(a.type==='dash'))[0],region=(world.curve.courseZones||world.curve.marathonZones)?.find(z=>p.distance>=z.start&&p.distance<=z.end);
  const inArchTube=world.routes.some(r=>r.id===p.routeId&&r.kind==='bridge-mach');
  const inTunnel=inArchTube||courseFeatures().some(f=>f.type==='tunnel'&&wrapDistance(p.distance)>=f.start&&wrapDistance(p.distance)<=f.end);
  audio.update({speed:p.speed*3.6,boost:boosting,drifting:p.drift,driftQuality:p.driftQuality||0,slipAngle:p.slipAngle||0,airborne:Boolean(p.airborne),tunnel:inTunnel,progress:Math.max(0,Math.min(1,p.distance/world.length)),featureKind:p.dashTime>0||inArchTube?'dash':activeFeature?.type||'',regionKind:activeFeature?.theme||region?.type||region?.id||world.sectorAt(p.distance,p),rivalGap:Math.min(...race.racers.slice(1).filter(r=>!r.finished).map(r=>Math.abs(r.distance-p.distance))),racing:!menu&&race.state==='racing',hovering:selected.locomotion==='cloud'},dt);
  world.update(dt,race,{menu,reducedMotion:settings.reduced});hudClock+=dt;if(!menu&&hudClock>.075){updateHud();hudClock=0;}
  // WebGL 렌더링 직후 같은 프레임에서 복사해 검은 영상이 생기지 않게 한다.
  recording?.draw($('world'),{name:selected.name,menu,position:p.position,progress:Math.min(100,Math.max(0,Math.floor(p.distance/world.length*100))),time:formatTime(race.time),speed:p.speed,boost:boosting,banner:race.state==='paused'?'일시정지':race.state==='finished'?'FINISH':race.state==='countdown'?$('countdown').textContent:''},now);
  wasState=race.state;requestAnimationFrame(frame);
}
init();
