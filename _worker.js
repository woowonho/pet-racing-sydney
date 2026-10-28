const COURSE_ID='sydney-harbour-v15';
const PET_IDS=new Set(['sonic','super-sonic','yongyong','saesae','granzort','super-granzort','hyper-granzort','on','or','godsonic','godsonicsuper','hypersonic','silversonic','supersonicgod','supersonicgold','supersonichyper','supersonicsilver','chiikawa','usagi','hachiware','momonga']);
const schemas=new WeakMap();

const json=(data,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
const validId=value=>typeof value==='string'&&/^[a-f0-9-]{36}$/i.test(value);

async function schema(db){
  if(schemas.has(db))return schemas.get(db);
  const ready=db.batch([
    db.prepare('CREATE TABLE IF NOT EXISTS hall_runs (token TEXT PRIMARY KEY, client_id TEXT NOT NULL, course_id TEXT NOT NULL, started_at INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0)'),
    db.prepare('CREATE INDEX IF NOT EXISTS hall_runs_client ON hall_runs(client_id, started_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS hall_scores (course_id TEXT NOT NULL, client_id TEXT NOT NULL, pet_id TEXT NOT NULL, time_ms INTEGER NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(course_id, client_id))'),
    db.prepare('CREATE INDEX IF NOT EXISTS hall_scores_top ON hall_scores(course_id, time_ms, updated_at)'),
    db.prepare('CREATE TABLE IF NOT EXISTS hall_identities (course_id TEXT NOT NULL, client_id TEXT NOT NULL, player_key TEXT NOT NULL, display_name TEXT NOT NULL, PRIMARY KEY(course_id,client_id))'),
    db.prepare('CREATE TABLE IF NOT EXISTS hall_migrations (name TEXT PRIMARY KEY)'),
    // 사용자가 확인한 기존 세 기록만 연결한다. 이후 같은 시간이 나와도 이름을 붙이지 않는다.
    db.prepare(`INSERT OR IGNORE INTO hall_identities(course_id,client_id,player_key,display_name)
      SELECT course_id,client_id,'wonho','元昊' FROM hall_scores
      WHERE course_id=? AND pet_id='supersonichyper' AND time_ms IN (107398,107569)
        AND NOT EXISTS(SELECT 1 FROM hall_migrations WHERE name='v15-confirmed-players')`).bind(COURSE_ID),
    db.prepare(`INSERT OR IGNORE INTO hall_identities(course_id,client_id,player_key,display_name)
      SELECT course_id,client_id,'gwanu','관운장' FROM hall_scores
      WHERE course_id=? AND pet_id='on' AND time_ms=108925
        AND NOT EXISTS(SELECT 1 FROM hall_migrations WHERE name='v15-confirmed-players')`).bind(COURSE_ID),
    db.prepare("INSERT OR IGNORE INTO hall_migrations(name) VALUES('v15-confirmed-players')"),
    // 이미 연결된 브라우저의 이름도 바꾸고, 기록과 순위는 그대로 유지한다.
    db.prepare(`UPDATE hall_identities SET display_name='관운장'
      WHERE course_id=? AND player_key='gwanu'
        AND NOT EXISTS(SELECT 1 FROM hall_migrations WHERE name='v15-gwanu-gwanunjang')`).bind(COURSE_ID),
    db.prepare("INSERT OR IGNORE INTO hall_migrations(name) VALUES('v15-gwanu-gwanunjang')"),

    db.prepare('CREATE TABLE IF NOT EXISTS hall_totals (course_id TEXT PRIMARY KEY, finishes INTEGER NOT NULL DEFAULT 0, since_ms INTEGER NOT NULL)'),
    db.prepare('INSERT OR IGNORE INTO hall_totals(course_id,since_ms) VALUES(?,?)').bind(COURSE_ID,Date.now()),
    // 임시 토큰을 지워도 누적 횟수는 남고, 재전송된 완주는 한 번만 센다.
    db.prepare('CREATE TRIGGER IF NOT EXISTS hall_count_finish AFTER UPDATE OF used ON hall_runs WHEN OLD.used=0 AND NEW.used=1 BEGIN UPDATE hall_totals SET finishes=finishes+1 WHERE course_id=NEW.course_id AND NEW.started_at>=since_ms; END'),
  ]).catch(error=>{schemas.delete(db);throw error;});
  schemas.set(db,ready);
  return ready;
}

async function top(db){
  // 두 브라우저가 같은 사람이라면 가장 빠른 한 기록만 표시한다. AI도 시간순으로 경쟁한다.
  const {results=[]}=await db.prepare(`WITH players AS (
    SELECT s.pet_id AS petId,s.time_ms AS timeMs,COALESCE(i.display_name,'도전자') AS displayName,
      0 AS isAI,s.updated_at AS updatedAt,
      ROW_NUMBER() OVER(PARTITION BY COALESCE('known:'||i.player_key,'browser:'||s.client_id)
        ORDER BY s.time_ms,s.updated_at,s.client_id) AS place
    FROM hall_scores s LEFT JOIN hall_identities i
      ON i.course_id=s.course_id AND i.client_id=s.client_id WHERE s.course_id=?
  ), ranked AS (
    SELECT petId,timeMs,displayName,isAI,updatedAt FROM players WHERE place=1
    UNION ALL SELECT 'sonic',105756,'AI',1,0
  ) SELECT petId,timeMs,displayName,isAI FROM ranked ORDER BY timeMs,updatedAt LIMIT 3`).bind(COURSE_ID).all();
  return results;
}

async function stats(db){
  return db.prepare('SELECT finishes, since_ms AS sinceMs FROM hall_totals WHERE course_id=?').bind(COURSE_ID).first();
}

async function body(request){
  if(!request.headers.get('content-type')?.toLowerCase().startsWith('application/json'))throw new Error('json');
  return request.json();
}

async function api(request,env,url){
  if(!env.HALL_DB)return json({error:'storage-unavailable'},503);
  await schema(env.HALL_DB);
  if(request.method==='GET'&&url.pathname==='/api/hall')return json({scores:await top(env.HALL_DB),stats:await stats(env.HALL_DB)});
  if(request.method==='POST'&&url.pathname==='/api/hall/start'){
    const data=await body(request);if(data.courseId!==COURSE_ID||!validId(data.clientId))return json({error:'invalid-run'},400);
    const now=Date.now(),recent=await env.HALL_DB.prepare('SELECT COUNT(*) AS count FROM hall_runs WHERE client_id=? AND started_at>?').bind(data.clientId,now-600000).first();
    if(Number(recent?.count)>=10)return json({error:'too-many-runs'},429);
    const token=crypto.randomUUID();
    await env.HALL_DB.batch([
      env.HALL_DB.prepare('DELETE FROM hall_runs WHERE started_at<?').bind(now-86400000),
      env.HALL_DB.prepare('INSERT INTO hall_runs(token,client_id,course_id,started_at,used) VALUES(?,?,?,?,0)').bind(token,data.clientId,COURSE_ID,now),
    ]);
    return json({token});
  }
  if(request.method==='POST'&&url.pathname==='/api/hall/finish'){
    const data=await body(request),timeMs=Math.round(Number(data.timeMs));
    if(data.courseId!==COURSE_ID||!validId(data.clientId)||!validId(data.token)||!PET_IDS.has(data.petId)||timeMs<90000||timeMs>600000)return json({error:'invalid-score'},400);
    const run=await env.HALL_DB.prepare('SELECT started_at AS startedAt, used FROM hall_runs WHERE token=? AND client_id=? AND course_id=?').bind(data.token,data.clientId,COURSE_ID).first();
    const elapsed=Date.now()-Number(run?.startedAt||0);
    if(!run||run.used||elapsed<timeMs*.75||elapsed>1800000)return json({error:'unverified-run'},409);
    const consumed=await env.HALL_DB.prepare('UPDATE hall_runs SET used=1 WHERE token=? AND used=0').bind(data.token).run();
    if(Number(consumed?.meta?.changes)!==1)return json({error:'unverified-run'},409);
    await env.HALL_DB.prepare('INSERT INTO hall_scores(course_id,client_id,pet_id,time_ms,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(course_id,client_id) DO UPDATE SET pet_id=excluded.pet_id,time_ms=excluded.time_ms,updated_at=excluded.updated_at WHERE excluded.time_ms<hall_scores.time_ms').bind(COURSE_ID,data.clientId,data.petId,timeMs,Date.now()).run();
    return json({accepted:true,scores:await top(env.HALL_DB),stats:await stats(env.HALL_DB)});
  }
  return json({error:'not-found'},404);
}

export default{
  async fetch(request,env){
    const url=new URL(request.url);
    if(!url.pathname.startsWith('/api/hall'))return env.ASSETS.fetch(request);
    try{return await api(request,env,url);}catch(error){console.error('hall-of-fame',error);return json({error:'temporary-unavailable'},503);}
  },
};
