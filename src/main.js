import {CityWorld} from './world.js';
import {Race,formatTime} from './physics.js';
import {loadCharacterTextures} from './characters.js';
import {RaceAudio} from './audio.js';
import {bindTouchInput} from './touch-input.js';

const $=id=>document.getElementById(id);
const show=(id,on=true)=>$(id).classList.toggle('hidden',!on);
const storage={get(key,fallback){try{return JSON.parse(localStorage.getItem('pet-racing-'+key))??fallback;}catch{return fallback;}},set(key,value){try{localStorage.setItem('pet-racing-'+key,JSON.stringify(value));}catch{}}};
const touchDevice=matchMedia('(pointer:coarse)').matches||navigator.maxTouchPoints>0;
const appleKeyboard=/Mac|iPhone|iPad|iPod/i.test(navigator.userAgentData?.platform||navigator.platform||'');
const boostKeys=appleKeyboard?['Space']:['ControlLeft','ControlRight','Space'];
const settings=Object.assign({auto:touchDevice,high:!matchMedia('(pointer:coarse)').matches,reduced:matchMedia('(prefers-reduced-motion: reduce)').matches,muted:false},storage.get('settings-sydney-v4',{}));
const keys=new Set(),touch={};
let touchInput;
const autoAccelerate=()=>touchDevice||settings.auto;
const portrait=()=>touchDevice&&innerHeight>innerWidth;
function clearInput(){keys.clear();touchInput?.clear();Object.keys(touch).forEach(key=>touch[key]=false);}
function syncOrientation(){
  const blocked=portrait(),gate=$('landscape-dialog');
  document.body.classList.toggle('portrait-blocked',blocked);
  if(blocked){clearInput();if(!menu&&race)pause();if(gate&&!gate.open)gate.showModal();}
  else if(gate?.open)gate.close();
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
let pets,world,race,selected,menu=true,toastTimer=0,countTimer=0,hudClock=0,last=0,wasBoosting=false,wasState='',gamepadSteer=0;
const audio=new RaceAudio();audio.setMuted(settings.muted);
const recorded=storage.get('records-sydney-v6',{});
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
    $('help-drift-copy').textContent='오른손 방향키와 왼손 DRIFT를 함께 누르세요. DRIFT를 놓으면 자세를 회복하고, 반대 방향을 눌러 빠르게 탈출해요. 미끄러짐으로 N₂O를 충전해 최대 2개를 보관해요.';
    $('help-boost-copy').textContent='왼쪽 N₂O로 모아 둔 부스터를 사용해요. 드리프트로 충전해 최대 2개까지 보관하고, 소닉은 부스터를 쓰면 스핀대시로 변해요.';
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
    $('track-length').textContent=(world.length/1000).toFixed(1);
    $('roster').replaceChildren(...pets.map(p=>{const btn=document.createElement('button');btn.className='pet-card';btn.dataset.pet=p.id;btn.setAttribute('aria-label',p.name+' 선택');btn.title=p.name;btn.setAttribute('aria-pressed',String(p.id===selected.id));const img=document.createElement('img');img.src=p.portrait;img.alt='';const label=document.createElement('span');label.textContent=p.name;btn.append(img,label);btn.addEventListener('click',()=>selectPet(p));return btn;}));
    bindControls();resetRace();selectPet(selected,false);drawMap($('track-preview'),false);
    show('loading',false);show('garage');$('start').focus({preventScroll:true});syncOrientation();last=performance.now();requestAnimationFrame(frame);
    // 검증 시 실제 게임 상태와 렌더링 통계를 읽을 수 있는 읽기 전용 관찰 인터페이스.
    window.petRacing={get state(){return{state:race.state,menu,mobile:{enabled:touchDevice,portrait:portrait(),auto: autoAccelerate(),controls:{...touch}},keyboard:{boostKey:appleKeyboard?'Space':'Control',held:[...keys]},course:world.courseId||'sydney-harbour-v6',pet:selected.id,time:race.time,position:race.position,lap:race.lap,speed:race.player.speed,boost:race.player.boost,boostTime:race.player.boostTime,distance:race.player.distance,lateral:race.player.lateral,screen:{runner:world.screenPosition(race.player.distance,race.player.lateral),center:world.screenPosition(race.player.distance,0)},elevation:world.frameAt(race.player.distance).p.y,grade:world.gradeAt?.(race.player.distance)||0,surface:world.surfaceAt(race.player.distance),cameraFov:world.camera.fov,models:world.racerMeshes.map(r=>({type:r.model.mode,vehicle:r.model.usesVehicle,animation:r.model.group.userData.animation,facing:r.model.group.userData.facing})),contacts:race.player.contactCount,lastContact:{time:race.player.lastContactTime,impact:race.player.lastContactImpact},heading:race.player.heading,velocityHeading:race.player.velocityHeading,slipAngle:race.player.slipAngle,drift:race.player.drift,driftPhase:race.player.driftPhase,boostGauge:race.player.boostGauge,boostItems:race.player.boostItems,turnRate:world.turnRateAt(race.player.distance),turnAhead:world.turnRateAt(race.player.distance+race.player.speed*.24),curvature:world.curvatureAt(race.player.distance),driftCharge:race.player.driftCharge,draftCharge:race.player.draftCharge||0,draftTime:race.player.draftTime||0,lapTimes:[...race.lapTimes],length:world.length,renderer:{calls:world.renderer.info.render.calls,triangles:world.renderer.info.render.triangles},racers:race.racers.map(r=>({pet:r.petId,position:r.position,distance:r.distance,finished:r.finished}))};}};
  }catch(error){console.error(error);$('load-message').textContent=error.message;$('loading').querySelector('b').textContent='게임을 시작하지 못했어요';const b=document.createElement('button');b.className='primary';b.textContent='다시 불러오기';b.onclick=()=>location.reload();$('loading').append(b);if(/WebGL/i.test(error.message))$('load-message').textContent='브라우저의 하드웨어 가속을 켜고 다시 실행해 주세요.';}
}
function resetRace(){
  race=new Race({length:world.length,petId:selected.id,roster:pets,difficulty:$('difficulty').value,roadHalfWidth:world.roadHalfWidth??11.5,turnRateAt:d=>world.turnRateAt(d),gradeAt:d=>world.gradeAt?.(d)||0});race.curvatureAt=d=>world.curvatureAt(d);
  race.dashZones=[];
  world.setRacers(race.racers.map(r=>petById(r.petId)));world.cameraReady=false;wasState='';wasBoosting=false;clearInput();
}
function selectPet(p,rebuild=true){selected=p;storage.set('pet',p.id);$('selected-name').textContent=p.name;$('selected-power').textContent=p.sonic?'부스터 특수 동작 · 스핀대시':'부스터 특수 동작 · 초고속 질주';document.querySelectorAll('.pet-card').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.pet===p.id)));if(rebuild)resetRace();updateRecord();}
function updateRecord(){const best=recorded[$('difficulty').value]?.time;$('record-label').textContent=best?'개인 최고 기록 '+formatTime(best):'첫 기록에 도전해 보세요';}
async function startRace(){if(touchDevice){await enterLandscape();if(portrait())return;}document.querySelectorAll('dialog[open]').forEach(d=>d.close());resetRace();menu=false;document.body.classList.add('racing');clearTimeout(countTimer);clearTimeout(toastTimer);show('countdown',false);$('toast').classList.remove('show');show('garage',false);show('hud');show('pause-button');show('touch-controls');$('start').blur();await audio.unlock();soundLabel();race.start();handleEvents();}
function backToGarage(){document.querySelectorAll('dialog[open]').forEach(d=>d.close());menu=true;document.body.classList.remove('racing');clearTimeout(countTimer);clearTimeout(toastTimer);resetRace();show('garage');show('hud',false);show('pause-button',false);show('touch-controls',false);show('countdown',false);document.body.classList.remove('boosting');$('toast').classList.remove('show');$('start').focus();updateRecord();}
function pause(){if(race?.pause()){clearInput();$('pause-dialog').showModal();$('resume').focus();}}
function resume(){if(portrait()){syncOrientation();return;}if(race.resume())$('pause-dialog').close();clearInput();last=performance.now();}
function openSettings(){if(!menu&&race.state!=='paused')pause();$('settings-dialog').showModal();}
function bindControls(){
  $('start').onclick=startRace;$('race-again').onclick=startRace;$('restart').onclick=startRace;$('resume').onclick=resume;$('pause-button').onclick=pause;$('garage-back').onclick=backToGarage;$('result-garage').onclick=backToGarage;
  $('difficulty').value=storage.get('difficulty','normal');$('difficulty').onchange=()=>{storage.set('difficulty',$('difficulty').value);updateRecord();resetRace();};updateRecord();
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
  $('landscape-dialog').addEventListener('cancel',event=>event.preventDefault());
  $('landscape-enter').onclick=()=>enterLandscape({notifyUnavailable:true});
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
    if(event.racerId!=='player')continue;audio.event(event.type==='countdown'?'count':event.type==='draft'?'boost':event.type==='boost-ready'?'drift-charge':event.type);
    if(event.type==='countdown'||event.type==='go'){
      const el=$('countdown');el.textContent=event.type==='go'?'출발!':event.value;show('countdown');el.classList.remove('pulse');void el.offsetWidth;el.classList.add('pulse');clearTimeout(countTimer);if(event.type==='go')countTimer=setTimeout(()=>show('countdown',false),900);
    }
    if(event.type==='boost')toast(event.source==='dash'?'대시 패드!':selected.sonic?'스핀대시!':'초고속 질주!',1100);
    if(event.type==='draft')toast('슬립스트림! 앞선 주자의 바람을 타!',1300);
    if(event.type==='boost-ready')toast('부스터 획득!  '+event.items+' / 2',1000);
    if(event.type==='wall'){$('flash').classList.add('hit');setTimeout(()=>$('flash').classList.remove('hit'),180);}
    if(event.type==='contact'){$('flash').classList.add('hit');setTimeout(()=>$('flash').classList.remove('hit'),100);}
    if(event.type==='lap'&&event.completed<3)toast(event.lap===3?'파이널 랩!':'2번째 랩!',2000);
    if(event.type==='finish')finishRace();
  }
}
function finishRace(){
  show('countdown',false);show('touch-controls',false);show('pause-button',false);document.body.classList.remove('boosting');
  const total=race.player.finishTime;const key=$('difficulty').value;const isNew=!recorded[key]||total<recorded[key].time;
  if(isNew){recorded[key]={time:total,pet:selected.id,date:new Date().toISOString()};storage.set('records-sydney-v6',recorded);}
  $('result-pet').src=selected.portrait;$('result-position').textContent=race.position;$('result-subtitle').textContent=isNew?'새로운 개인 최고 기록':'레이스 완료';$('result-message').textContent=race.position===1?'서킷의 주인공은 너야.':race.position<=3?'포디움에 올랐어!':'다음 코너에서 뒤집어 보자.';
  $('result-time').textContent=formatTime(total);$('result-best').textContent=formatTime(race.bestLap);
  $('result-laps').innerHTML=race.lapTimes.map((t,i)=>`<span>${i+1} 랩<b>${formatTime(t)}</b></span>`).join('');
  $('result-standing').replaceChildren(...[...race.racers].sort((a,b)=>a.position-b.position).map(r=>{const row=document.createElement('div');row.className='standing-row'+(r.id==='player'?' me':'');const pos=document.createElement('b');pos.textContent=r.position+'위';const name=document.createElement('span');name.textContent=r.name+(r.id==='player'?' · 나':'');const time=document.createElement('small');time.textContent=r.finished?formatTime(r.finishTime):'주행 중 · '+r.lap+'랩';row.append(pos,name,time);return row;}));
  $('results-dialog').showModal();$('race-again').focus();
}
function drawMap(canvas,live){
  const ctx=canvas.getContext('2d'),w=canvas.width,h=canvas.height;ctx.clearRect(0,0,w,h);const pts=world.mapPoints;
  const xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);const s=Math.min((w-42)/(maxX-minX),(h-24)/(maxZ-minZ));
  const xy=p=>[w/2+(p.x-(minX+maxX)/2)*s,h/2+(p.z-(minZ+maxZ)/2)*s];
  function path(){ctx.beginPath();pts.forEach((p,i)=>{const[x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.closePath();}
  path();ctx.lineWidth=live?9:11;ctx.strokeStyle='#0c283bbb';ctx.stroke();path();ctx.lineWidth=live?4:5;ctx.strokeStyle='#d4f5f0';ctx.stroke();
  ctx.save();ctx.shadowColor='#ffda85';ctx.shadowBlur=7;ctx.beginPath();pts.slice(0,9).forEach((p,i)=>{const[x,y]=xy(p);i?ctx.lineTo(x,y):ctx.moveTo(x,y);});ctx.strokeStyle='#ffdc86';ctx.lineWidth=5;ctx.stroke();ctx.restore();
  if(live){[...race.racers].reverse().forEach(r=>{const f=world.frameAt(r.distance);const[x,y]=xy({x:f.p.x,z:f.p.z});ctx.beginPath();ctx.arc(x,y,r.id==='player'?5:3,0,Math.PI*2);ctx.fillStyle=r.id==='player'?'#ffe293':petById(r.petId).color;ctx.fill();if(r.id==='player'){ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();}});}else{const[x,y]=xy(pts[0]);ctx.fillStyle='#ffe293';ctx.fillRect(x-4,y-3,8,6);}
}
function updateHud(){
  const p=race.player;$('position').textContent=p.position;$('lap').textContent=p.lap;$('race-time').textContent=formatTime(race.time);$('best-lap').textContent=formatTime(race.bestLap);$('speed').textContent=String(Math.round(p.speed*3.6)).padStart(3,'0');$('speed-fill').style.width=Math.min(100,p.speed/106*100)+'%';
  $('boost-fill').style.width=p.boostGauge+'%';$('boost-title').textContent=p.boostTime>0?(selected.sonic?'스핀대시':'부스터 가속'):p.boostItems>0?'부스터 '+p.boostItems+'개':'부스터를 모아라';$('boost-title').style.color=p.boostItems>0?'#ffdb8a':'#e2f6f7';
  [...$('boost-slots').children].forEach((slot,i)=>{slot.classList.toggle('ready',i<p.boostItems);slot.classList.toggle('active',i===0&&p.boostTime>0);});
  $('drift-fill').style.width=Math.min(100,Math.abs(p.slipAngle||0)/.65*100)+'%';$('drift-fill').style.background='#8bdafa';$('drift-label').textContent=p.drift?(touchDevice?'드리프트 버튼 놓아 탈출':'드리프트 · Shift 놓아 탈출'):'드리프트로 부스터 충전';$('drift-value').textContent=Math.round(p.boostGauge)+'%';
  const nitroButton=document.querySelector('[data-touch=boost]');
  nitroButton.classList.toggle('ready',p.boostItems>0);nitroButton.classList.toggle('active',p.boostTime>0);
  nitroButton.classList.toggle('empty',p.boostItems===0);
  const count=$('touch-boost-count');if(count)count.textContent=String(p.boostItems);
  nitroButton.setAttribute('aria-label','부스터 '+p.boostItems+'개');
  $('drive-state').textContent=p.draftTime>0?'슬립스트림 · 가속':p.boostTime>0?'최대 출력 · 부스터':p.drift?'드리프트':p.speed<2?'가속 대기':autoAccelerate()?'자동 달리기':'수동 달리기';
  $('draft-indicator').classList.toggle('hidden',!(p.draftCharge>8||p.draftTime>0));$('draft-fill').style.width=(p.draftTime>0?100:p.draftCharge||0)+'%';
  $('sector').textContent=world.sectorAt(p.distance);const ahead=world.curvatureAt(p.distance+35),grade=world.gradeAt?.(p.distance)||0,surface=world.surfaceAt(p.distance+35);$('corner-hint').textContent=surface.rough>.15?'노면 요철 · 속도에 주의':surface.rolling>.15?'연속 높낮이 · 코너 대비':Math.abs(ahead)>.25?(ahead>0?'우회전 코너 ↱':'↰ 좌회전 코너'):grade>.025?'오르막 · 부스터로 가속':grade<-.025?'내리막 · 다음 코너 대비':'직선 구간 · 부스터 타이밍';
  [...$('lap-dots').children].forEach((e,i)=>e.classList.toggle('done',i<p.lap));
  $('leaderboard').replaceChildren(...[...race.racers].sort((a,b)=>a.position-b.position).map(r=>{const li=document.createElement('li');if(r.id==='player')li.className='me';const b=document.createElement('b');b.textContent=r.position;const img=document.createElement('img');img.src=petById(r.petId).portrait;img.alt='';const span=document.createElement('span');span.textContent=r.id==='player'?'나 · '+r.name:r.name;const small=document.createElement('small');small.textContent=r.id==='player'?'':Math.round((r.distance-p.distance))+'m';li.append(b,img,span,small);return li;}));drawMap($('minimap'),true);
}
function frame(now){
  const dt=Math.max(0,Math.min((now-last)/1000,.05));last=now;
  if(!menu){race.update(dt,readInput(),world.curvatureAt(race.player.distance));handleEvents();}
  const p=race.player,boosting=!menu&&race.state==='racing'&&p.boostTime>0;
  if(boosting!==wasBoosting){document.body.classList.toggle('boosting',boosting);wasBoosting=boosting;}
  audio.update({speed:p.speed*3.6,boost:boosting,drifting:p.drift,racing:!menu&&race.state==='racing',hovering:selected.locomotion==='cloud'},dt);
  world.update(dt,race,{menu,reducedMotion:settings.reduced});hudClock+=dt;if(!menu&&hudClock>.075){updateHud();hudClock=0;}
  wasState=race.state;requestAnimationFrame(frame);
}
init();
