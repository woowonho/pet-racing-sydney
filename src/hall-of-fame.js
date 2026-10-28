import {formatTime} from './physics.js';

export const HALL_COURSE_ID='sydney-harbour-v15';
const ID_KEY='pet-racing-hall-id-v1';

function clientId(storage,randomUUID){
  try{
    const current=storage.getItem(ID_KEY);
    if(/^[a-f0-9-]{36}$/i.test(current||''))return current;
    const created=randomUUID();storage.setItem(ID_KEY,created);return created;
  }catch{return randomUUID();}
}

export function renderHallOfFame(list,scores,pets){
  const byId=new Map(pets.map(pet=>[pet.id,pet]));
  const rows=Array.from({length:3},(_,index)=>{
    const score=scores[index],row=document.createElement('li');row.className=score?'':'empty';
    const rank=document.createElement('b');rank.textContent=String(index+1);
    const image=document.createElement('img');image.alt='';
    const name=document.createElement('small');name.className='hall-name';
    const time=document.createElement('strong');time.className='hall-time';
    if(score){const pet=byId.get(score.petId)||pets[0];image.src=pet?.portrait||'';image.alt=pet?.name?`${pet.name} 캐릭터`:'';time.textContent=formatTime(score.timeMs/1000);}
    else{time.textContent='첫 기록 대기';}
    if(score){name.textContent=score.displayName||'도전자';name.title=score.isAI?'자동 입력 주행 예시 기록':'플레이어 최고기록';}
    row.append(rank,image,name,time);return row;
  });
  list.replaceChildren(...rows);
}

export function renderRunCounts(counts,stats){
  if(!counts)return;
  for(const key of ['finishes']){
    const element=counts.querySelector(`[data-run-count="${key}"]`);
    if(element)element.textContent=Number.isSafeInteger(stats?.[key])&&stats[key]>=0?stats[key].toLocaleString('ko-KR'):'—';
  }
  const note=counts.querySelector('[data-run-count-note]');
  if(note){
    const since=Number(stats?.sinceMs);
    note.textContent=Number.isFinite(since)&&since>0?`${new Intl.DateTimeFormat('ko-KR',{timeZone:'Asia/Seoul',month:'numeric',day:'numeric'}).format(since)}부터 누적 · 재도전 포함`:'집계 연결 대기';
  }
}

export function createHallOfFame({list,pets,counts,fetcher=fetch,storage=localStorage,randomUUID=()=>crypto.randomUUID()}={}){
  const id=clientId(storage,randomUUID);let run=null;
  const render=scores=>renderHallOfFame(list,Array.isArray(scores)?scores:[],pets);
  async function request(path,options={}){
    const response=await fetcher(path,{...options,headers:{'Content-Type':'application/json',...(options.headers||{})}});
    if(!response.ok)throw new Error(`명예의 전당 연결 실패 (${response.status})`);
    return response.json();
  }
  return{
    async load(){try{const data=await request(`/api/hall?course=${encodeURIComponent(HALL_COURSE_ID)}`);render(data.scores);renderRunCounts(counts,data.stats);}catch{render([]);renderRunCounts(counts,null);}},
    start(){run=request('/api/hall/start',{method:'POST',body:JSON.stringify({courseId:HALL_COURSE_ID,clientId:id})}).catch(()=>null);},
    async finish(time,petId){
      try{
        const started=await run;run=null;if(!started?.token)return false;
        const data=await request('/api/hall/finish',{method:'POST',body:JSON.stringify({courseId:HALL_COURSE_ID,clientId:id,token:started.token,petId,timeMs:Math.round(time*1000)})});
        render(data.scores);renderRunCounts(counts,data.stats);return Boolean(data.accepted);
      }catch{run=null;return false;}
    },
  };
}
