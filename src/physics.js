import {apexCrossing} from './apex-gates.js';

export const TRACK_LENGTH = 3000;
export const LAPS = 3;

const ROAD_HALF_WIDTH = 9;
const MAX_STEP = 1 / 120;
const BOOST_DURATION = 3.0;
const MAX_BOOST_ITEMS = 2;
const NORMAL_SPEED = 72;
const BOOST_SPEED = 106;
const DRAFT_DURATION = 1.2;
const RUN_STEER_ANGLE = 0.25;
const RUN_HEADING_RESPONSE = 34;
const RUN_GRIP = 42;
const DRIFT_TURN_POWER = 4.6;
const DRIFT_GRIP = 5.4;
const DRIFT_ALIGNMENT = 10;
const JUMP_GRAVITY = 20;
// 원본 주자 그림의 몸통 폭에 맞춘 두 선수의 합산 접촉 반경(가로/진행 방향).
const CONTACT_WIDTH = 2.6;
const CONTACT_LENGTH = 3.0;
const CONTACT_COOLDOWN = 0.42;
const AI_LEVELS = {
  // 실제 화면은 이 단일 모드를 쓴다. 아래 네 값은 옛 리플레이·개발 검증용으로만 남긴다.
  adaptive: {pace:1, speed:72, variation:0.15, acceleration:24, corner:2.24, drift:0.85, boostCurve:0.012, boostDelay:3.0, line:2.0},
  easy: {pace:0.3, speed:61, variation:1.3, acceleration:21.5, corner:1.78, drift:1.0, boostCurve:0.0075, boostDelay:5, line:1},
  normal: {pace:0.65, speed:69.5, variation:0.65, acceleration:23, corner:1.9, drift:0.92, boostCurve:0.009, boostDelay:3.5, line:1.4},
  hard: {pace:0.9, speed:72, variation:0.35, acceleration:24, corner:2.02, drift:0.85, boostCurve:0.011, boostDelay:3.05, line:2.0},
  // 상위 난이도는 강한 코너 공략과 완만한 페이스 조정으로 가까이서 경쟁한다.
  expert: {pace:1, speed:84, variation:0.2, acceleration:27, corner:2.65, drift:0.55, boostCurve:0.024, boostDelay:3.0, line:2.8},
};
// 플레이어는 6번 그리드에서 출발해 앞선 선수들을 추월한다.
const START_GRID = [
  [-18, -2.2], [0, -2.2], [-6, 2.2], [-6, -2.2],
  [-12, -2.2], [-12, 2.2], [-18, 2.2], [-24, -2.2],
];
const DEFAULT_PETS = [
  { id: 'sonic', name: 'SONIC' },
  { id: 'supersonicgold', name: 'SUPERSONICGOLD' },
  { id: 'hypersonic', name: 'HYPERSONIC' },
  { id: 'granzort', name: 'GRANZORT' },
  { id: 'super-granzort', name: 'SUPERGRANZORT' },
  { id: 'or', name: 'אור' },
  { id: 'on', name: '온' },
  { id: 'silversonic', name: 'SILVERSONIC' },
];

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const number = (value, fallback = 0) => Number.isFinite(value) ? value : fallback;
const modulo = (value, divisor) => ((value % divisor) + divisor) % divisor;

export function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return '--:--.---';
  const milliseconds = Math.floor((seconds + Number.EPSILON) * 1000);
  const minutes = Math.floor(milliseconds / 60000);
  const remainder = milliseconds % 60000;
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(remainder / 1000)).padStart(2, '0')}.${String(remainder % 1000).padStart(3, '0')}`;
}

/** 렌더링이나 브라우저 시간에 의존하지 않는 속도전 시뮬레이션. */
export class Race {
  constructor({ length = TRACK_LENGTH, laps = LAPS, loop = true, difficulty = 'adaptive', petId = 'sonic', roster = [], dashZones = [], curvatureAt = null, turnRateAt = null, gradeAt = null, roadHalfWidth = ROAD_HALF_WIDTH, roadHalfWidthAt = null, heightAt = null, routes = [], trackFeatures = [], apexGates = [] } = {}) {
    this.length = Math.max(20, number(length, TRACK_LENGTH));
    this.loop = Boolean(loop);
    this.laps = this.loop ? clamp(Math.floor(number(laps, LAPS)), 1, 10) : 1;
    this.difficulty = AI_LEVELS[difficulty] ? difficulty : 'adaptive';
    this.petId = petId;
    this.roster = Array.isArray(roster) && roster.length ? roster : DEFAULT_PETS;
    this.dashZones = Array.isArray(dashZones) ? dashZones : [];
    this.curvatureAt = typeof curvatureAt === 'function' ? curvatureAt : null;
    // rad/m 단위의 실제 도로 곡률. 기존 정규화 곡률 입력도 사용할 수 있다.
    this.turnRateAt = typeof turnRateAt === 'function' ? turnRateAt : null;
    this.gradeAt = typeof gradeAt === 'function' ? gradeAt : null;
    this.roadHalfWidth = Math.max(3, number(roadHalfWidth, ROAD_HALF_WIDTH));
    this.roadHalfWidthAt = typeof roadHalfWidthAt === 'function' ? roadHalfWidthAt : null;
    this.trackFeatures = Array.isArray(trackFeatures) ? trackFeatures.filter(feature => feature && typeof feature === 'object') : [];
    this.apexGates = (Array.isArray(apexGates)?apexGates:[]).filter(g=>g&&Number.isFinite(g.distance)&&Number.isFinite(g.lateral)&&g.halfWidth>0).map(g=>({...g,reward:clamp(number(g.reward,12),0,18)})).sort((a,b)=>a.distance-b.distance);
    this.jumpFeatures = this.trackFeatures.filter(feature => feature.type === 'jump');
    this.heightAt = typeof heightAt === 'function' ? heightAt : null;
    this.routes = Array.isArray(routes) ? routes.filter(route => route && route.end > route.start && route.routeLength > 0) : [];
    this.gapFeatures = this.trackFeatures.filter(feature => feature.type === 'gap');
    this.dashZones = [...this.dashZones, ...this.trackFeatures.filter(feature => feature.type === 'dash' && !this.dashZones.includes(feature))];
    this.warpFeatures = this.trackFeatures.filter(feature => feature.mechanic === 'warp');
    this.reset();
  }

  get player() { return this.racers[0]; }
  get position() { return this.player.position; }
  get lap() { return this.player.lap; }
  get totalDistance() { return this.length * this.laps; }

  reset() {
    this.state = 'ready';
    this.time = 0;
    this.countdown = 3;
    this.lapTimes = [];
    this.bestLap = null;
    this.events = [];
    this._boostHeld = false;
    this._pausedState = null;
    this._lastCountdown = 3;
    this._finishCounter = 0;
    this._contactTimes = new Map();
    this._playerPace = NORMAL_SPEED;
    this._playerPaceSamples = 0;
    this._playerCutCount = 0;
    this._playerRecoveryUntil = 0;
    this._adaptiveFinal = false;
    const selected = this.roster.find(pet => (pet.petId ?? pet.id) === this.petId)
      ?? { id: this.petId, name: this.petId === 'sonic' ? 'SONIC' : this.petId };
    const opponents = this.roster.filter(pet => (pet.petId ?? pet.id) !== this.petId);
    const available = opponents.length ? opponents : DEFAULT_PETS.filter(pet => pet.id !== this.petId);
    this.racers = Array.from({ length: 8 }, (_, index) => {
      const pet = index === 0 ? selected : available[(index - 1) % available.length];
      const racer = {
        id: index === 0 ? 'player' : `ai-${index}`,
        petId: pet.petId ?? pet.id,
        name: pet.name ?? pet.label ?? pet.petId ?? pet.id,
        distance: START_GRID[index][0],
        lateral: START_GRID[index][1],
        speed: 0,
        boostGauge: 0,
        boostItems: 0,
        boostSource: null,
        boostTime: 0,
        drafting: false,
        draftCharge: 0,
        draftTime: 0,
        drift: false,
        driftDirection: 0,
        driftPhase: 'grip',
        driftQuality: 0,
        driftExitTime: 0,
        driftCombo: 0,
        driftTechnique: null,
        apexCombo: 0,
        apexBest: 0,
        apexHits: 0,
        _apexNext: 0,
        miniBoostWindow: 0,
        miniBoostTime: 0,
        _driftPeakSlip: 0,
        _driftBoosted: false,
        _driftHeldCounter: false,
        _lastCleanDriftTime: -10,
        airborne: false,
        falling: false,
        fallTime: 0,
        routeId: null,
        routeApproach: null,
        _routeEntryCancelled: null,
        routeProgress: 0,
        routeRail: false,
        jumpWorldY: null,
        warp: false,
        dashTime: 0,
        dashSpeed: 0,
        _warpFeature: null,
        _activeGap: null,
        _gapPasses: [],
        _routePasses: [],
        jumpHeight: 0,
        jumpVelocity: 0,
        landingImpact: 0,
        heading: 0,
        velocityHeading: 0,
        slipAngle: 0,
        yawRate: 0,
        forwardSpeed: 0,
        finished: false,
        finishTime: null,
        finishOrder: null,
        lap: 1,
        position: index + 1,
        lapTimes: [],
        lastLapTime: null,
        lateralVelocity: 0,
        contactCount: 0,
        lastContactTime: -1,
        lastContactImpact: 0,
        steer: 0,
        _index: index,
        _lastLapAt: 0,
        _driftAge: 0,
        _driftEarned: 0,
        _driftCountered: false,
        _driftRecoveryAge: 0,
        _jumpPasses: [],
        _aiPace: 0,
        _aiCutPhase: null,
        _aiCutAge: 0,
        _aiCutDirection: 1,
        _aiNextCut: 4 + index * 0.3,
        _driftHeld: false,
        _wallCooldown: 0,
        _wallContact: 0,
        _contactLateralSpeed: 0,
        _aiPassId: null,
        _aiPassSide: 0,
        _dashPasses: [],
        _draftCooldown: 0,
        _aiNextBoost: 3 + index * 0.35,
      };
      // 예전 HUD의 읽기 경로도 실제 게이지와 같은 값을 보도록 유지한다.
      for (const key of ['boost', 'driftCharge']) Object.defineProperty(racer, key, {
        enumerable: true,
        get() { return this.boostGauge; },
        set(value) { this.boostGauge = clamp(number(value), 0, 100); },
      });
      return racer;
    });
    this._rank();
    return this;
  }

  start() {
    if (this.state !== 'ready') return false;
    this.state = 'countdown';
    this._emit('countdown', this.player, { value: 3 });
    return true;
  }

  pause() {
    if (this.state !== 'racing' && this.state !== 'countdown') return false;
    this._pausedState = this.state;
    this.state = 'paused';
    return true;
  }

  resume() {
    if (this.state !== 'paused') return false;
    this.state = this._pausedState ?? 'racing';
    this._pausedState = null;
    return true;
  }

  drainEvents() {
    const events = this.events;
    this.events = [];
    return events;
  }

  update(dt, input = {}, curvature = 0) {
    if (!Number.isFinite(dt) || dt <= 0 || !['countdown', 'racing'].includes(this.state)) return;
    let remaining = Math.min(dt, 0.1);
    const controls = {
      throttle: input.throttle === true ? 1 : clamp(number(input.throttle), 0, 1),
      brake: input.brake === true ? 1 : clamp(number(input.brake), 0, 1),
      steer: clamp(number(input.steer), -1, 1),
      drift: Boolean(input.drift),
      boost: Boolean(input.boost),
    };
    const curve = clamp(number(curvature), -1, 1);

    if (this.state === 'countdown') {
      const elapsed = Math.min(remaining, this.countdown);
      this.countdown = Math.max(0, this.countdown - elapsed);
      remaining -= elapsed;
      const display = Math.ceil(this.countdown - 1e-8);
      if (display > 0 && display < this._lastCountdown) {
        this._lastCountdown = display;
        this._emit('countdown', this.player, { value: display });
      }
      if (this.countdown > 1e-8) return;
      this.countdown = 0;
      this.state = 'racing';
      this._emit('go', this.player);
    }

    const boostPressed = controls.boost && !this._boostHeld;
    this._boostHeld = controls.boost;
    if (boostPressed && !this._activateBoost(this.player, 'manual')) this._activateMiniBoost(this.player);
    while (remaining > 1e-9 && this.state === 'racing') {
      const step = Math.min(remaining, MAX_STEP);
      this._step(step, controls, curve);
      remaining -= step;
    }
  }

  _emit(type, racer, detail = {}) {
    // 벽이나 선수 충돌 직후의 급감속을 평소 실력으로 오인하지 않는다.
    if(type==='wall'||type==='fall'){racer.miniBoostWindow=0;racer.miniBoostTime=0;racer.apexCombo=0;}
    if (racer === this.player && (type === 'wall' || type === 'contact' || type === 'fall')) this._playerRecoveryUntil = this.time + 2;
    this.events.push({ type, racerId: racer.id, petId: racer.petId, time: this.time, ...detail });
    if (this.events.length > 256) this.events.shift();
  }

  _activateBoost(racer, source) {
    if(this.routes.some(route=>route.id===racer.routeId&&route.kind==='bridge-mach'))return false;
    if (racer.finished || racer.falling || racer.boostTime > 0 || racer.boostItems < 1) return false;
    racer.boostItems--;
    racer.boostTime = BOOST_DURATION;
    racer.boostSource = source;
    this._emit('boost', racer, { source, duration: BOOST_DURATION });
    // 슬롯이 가득 차서 보관한 완충 게이지는 빈 슬롯이 생기는 순간 아이템으로 바뀐다.
    this._storeGauge(racer);
    return true;
  }

  _activateMiniBoost(racer) {
    if(this.routes.some(route=>route.id===racer.routeId&&route.kind==='bridge-mach'))return false;
    if (racer.finished || racer.falling || racer.airborne || racer.boostItems > 0 || racer.miniBoostWindow <= 0 || racer.miniBoostTime > 0) return false;
    racer.miniBoostWindow = 0;racer.miniBoostTime = .28;
    this._emit('mini-boost',racer,{duration:.28,technique:racer.driftTechnique});
    return true;
  }

  _storeGauge(racer) {
    if (racer.boostGauge < 100 - 1e-8 || racer.boostItems >= MAX_BOOST_ITEMS) return;
    racer.boostGauge = Math.max(0, racer.boostGauge - 100);
    racer.boostItems++;
    this._emit('boost-ready', racer, { items: racer.boostItems });
  }

  _endDrift(racer, crashed = false) {
    if (!racer.drift) return;
    const clean = !crashed && !racer.airborne && racer._wallContact === 0
      && racer._driftAge >= 0.25 && racer._driftEarned >= 9 && racer.speed > 25;
    const quality = clean ? clamp((racer._driftEarned / 42) * (racer._driftCountered ? 1 : 0.7), 0, 1) : 0;
    const speedCut = clean && racer._driftBoosted && racer._driftHeldCounter && racer._driftPeakSlip < .52 && quality > .45;
    const technique = speedCut ? 'speed-cut' : racer._driftCountered ? 'cut' : racer._driftAge >= .8 && racer._driftEarned >= 28 ? 'full' : 'short';
    const chained = clean && this.time-racer._lastCleanDriftTime < 2.4;
    const baseReward = technique === 'speed-cut' ? 15 : technique === 'cut' ? 10 : technique === 'full' ? 12 : 6;
    const reward = clean ? baseReward + quality*(technique==='full'?14:10) + (chained?Math.min(8,racer.driftCombo*2):0) : 0;
    if (clean) {
      racer.boostGauge = Math.min(racer.boostItems < MAX_BOOST_ITEMS ? 200 : 100, racer.boostGauge + reward);
      this._storeGauge(racer);
      racer.driftExitTime = speedCut ? .85 : .65;
      racer.driftCombo = chained ? racer.driftCombo+1 : 1;
      racer._lastCleanDriftTime = this.time;
      racer.driftTechnique = technique;
      // 이미 정렬된 짧은 회수만 타이밍 창을 만든다. 누르고 있기/실패 회수로는 얻지 못한다.
      if (racer._driftCountered && Math.abs(racer.velocityHeading)<.2 && Math.abs(racer.slipAngle)<.065 && quality>.4) {
        racer.miniBoostWindow = .25;
        this._emit('mini-ready',racer,{window:.25,technique});
      }
      if (racer === this.player && Math.abs(number(this.turnRateAt?.(this._trackDistance(racer.distance),racer)))<.003) this._playerCutCount++;
    } else {racer.driftCombo=0;racer.miniBoostWindow=0;}
    racer.driftQuality = quality;
    this._emit('drift-release',racer,{charge:racer.boostGauge,reward,clean,quality,crashed,technique:clean?technique:null,combo:racer.driftCombo,duration:racer._driftAge,peakSlip:racer._driftPeakSlip});
    racer.drift = false;
    racer.driftPhase = 'grip';
    racer.driftDirection = 0;
  }

  _step(dt, controls, curvature) {
    const stepStart = this.time;
    this.time += dt;
    this._updateDraft(dt);
    // 활성 주행만 천천히 학습한다. 정지·충돌 복구와 마지막 승부 구간에서는 난이도를 바꾸지 않는다.
    this._adaptiveFinal ||= this.player.distance > this.totalDistance - Math.min(1800, this.length * 0.16);
    if (controls.throttle > 0 && this.player.speed > 30 && this.player._wallContact === 0
      && !this.player.warp && this.player.dashTime <= 0 && !this.player.falling && this.time >= this._playerRecoveryUntil && !this._adaptiveFinal) {
      const sample = clamp(this.player.forwardSpeed, 35, BOOST_SPEED);
      this._playerPace += (sample - this._playerPace) * (1 - Math.exp(-dt / 8));
      this._playerPaceSamples += dt;
    }
    const finishes = [];
    const previous = this.racers.map(racer => ({distance:racer.distance, lateral:racer.lateral, routeId:racer.routeId, routeProgress:racer.routeProgress}));
    for (const [racerIndex,racer] of this.racers.entries()) {
      if (racer.finished) continue;
      const trackDistance = this._trackDistance(racer.distance);
      const racerCurve = clamp(number(this.curvatureAt?.(trackDistance, racer) ?? curvature, curvature), -1, 1);
      const input = racer._index === 0 ? controls : this._aiControls(racer, dt, racerCurve);
      racer._wallCooldown = Math.max(0, racer._wallCooldown - dt);
      racer.driftExitTime = Math.max(0, racer.driftExitTime - dt);
      racer.miniBoostWindow = Math.max(0,racer.miniBoostWindow-dt);
      racer.miniBoostTime = Math.max(0,racer.miniBoostTime-dt);
      if (racer.falling) {
        this._updateFall(racer, dt);
        previous[racerIndex] = {distance:racer.distance,lateral:racer.lateral,routeId:racer.routeId,routeProgress:racer.routeProgress};
        continue;
      }
      const warp = !racer.routeId && this.warpFeatures.find(feature => this._insideFeature(racer.distance, feature));
      if (racer._warpFeature && !warp) {
        // 흡입관 출구의 감속 장치가 다음 급코너 앞에서 안전한 속도로 돌려놓는다.
        racer.speed = Math.min(racer.speed, number(racer._warpFeature.exitSpeed, BOOST_SPEED));
        racer.dashTime = 0;
        this._emit('warp-exit', racer, {featureId:racer._warpFeature.id});
      }
      if (warp && !racer._warpFeature) {this._endDrift(racer);this._emit('warp-enter',racer,{featureId:warp.id});}
      racer._warpFeature = warp ?? null;
      racer.warp = Boolean(warp);
      const roadTurn = clamp(number(this.turnRateAt?.(trackDistance, racer), racerCurve / 112), -0.15, 0.15);
      const grade = clamp(number(this.gradeAt?.(trackDistance, racer)), -0.3, 0.3);
      this._drive(racer, input, racerCurve, dt, roadTurn, grade);
      // 평행 차선의 길이 차이까지 고려해 코너 안쪽과 바깥쪽 진행 거리를 계산한다.
      this._advance(racer, racer.forwardSpeed * dt / clamp(1 - roadTurn * racer.lateral, 0.65, 1.35));
      this._updateJump(racer, dt);
      racer.boostTime = Math.max(0, racer.boostTime - dt);
      racer.draftTime = Math.max(0, racer.draftTime - dt);
      racer.dashTime = Math.max(0, racer.dashTime - dt);
    }
    // 진행 방향의 접촉도 먼저 해결한 뒤 실제 통과한 거리로 랩/결승을 판정한다.
    this._collisions(dt, previous);
    // 셋 이상이 동시에 닿으면 뒤 쌍의 분리가 앞 쌍을 다시 누를 수 있어 위치만 재검사한다.
    this._separateCrowd();
    this.racers.forEach((racer,index) => {
      if (racer.finished || racer.falling) return;
      this._checkRoutes(racer, previous[index].distance);
      this._checkGaps(racer, previous[index].distance);
      if (racer.falling) return;
      this._checkJump(racer, previous[index].distance);
      this._checkDash(racer, previous[index].distance);
      this._checkApex(racer,previous[index]);
      this._crossLaps(racer, previous[index].distance, stepStart, dt, finishes);
    });
    // 같은 프레임에 들어온 선수도 결승선을 통과한 실제 시각대로 정렬한다.
    finishes.sort((a, b) => a.finishTime - b.finishTime || a._index - b._index);
    for (const racer of finishes) {
      racer.finishOrder = ++this._finishCounter;
      this._emit('finish', racer, { finishTime: racer.finishTime, position: racer.finishOrder });
    }
    this._rank();
    if (this.player.finished) {
      this.time = this.player.finishTime;
      this.state = 'finished';
    }
  }

  _updateDraft(dt) {
    const player = this.player;
    player._draftCooldown = Math.max(0, player._draftCooldown - dt);
    const canCharge = !player.finished && player.speed > 28 && player.boostTime <= 0
      && player.draftTime <= 0 && player._draftCooldown <= 0;
    player.drafting = canCharge && this.racers.some(other => {
      const gap = other.distance - player.distance;
      return other !== player && !other.finished && !other.falling && other.routeId === player.routeId && gap >= 4 && gap <= 20
        && Math.abs(other.lateral - player.lateral) < 1.7;
    });
    player.draftCharge = clamp(player.draftCharge + (player.drafting ? 50 : -65) * dt, 0, 100);
    if (player.draftCharge < 100 - 1e-8) return;
    player.draftCharge = 0;
    player.drafting = false;
    player.draftTime = DRAFT_DURATION;
    player._draftCooldown = 8;
    this._emit('draft', player, { duration: DRAFT_DURATION });
  }

  _checkApex(racer,previous){
    while(racer._apexNext<this.apexGates.length&&this.apexGates[racer._apexNext].distance<=racer.distance){
      const gate=this.apexGates[racer._apexNext++];
      const hit=apexCrossing(gate,previous,racer,this.time);
      if(hit===null)continue;
      if(!hit){racer.apexCombo=0;continue;}
      racer.apexHits++;racer.apexCombo++;racer.apexBest=Math.max(racer.apexBest,racer.apexCombo);
      const reward=gate.reward+Math.min(6,(racer.apexCombo-1)*2);
      racer.boostGauge=Math.min(racer.boostItems<MAX_BOOST_ITEMS?200:100,racer.boostGauge+reward);
      this._storeGauge(racer);
      this._emit('apex',racer,{gateId:gate.id,combo:racer.apexCombo,reward,hits:racer.apexHits});
    }
  }

  _drive(racer, input, curvature, dt, roadTurn, grade = 0) {
    const isPlayer = racer._index === 0;
    const activeRoute=this.routes.find(route=>route.id===racer.routeId);
    const vacuum=activeRoute?.kind==='bridge-mach';
    // 본선과 겹치는 유도선 안으로 직접 들어온 뒤에만 입구 정렬을 돕는다.
    // 반대 방향키는 즉시 해제하며, 좌표나 속도를 강제로 입구에 맞추지 않는다.
    const entryRoute=!activeRoute&&!racer.airborne&&!racer.falling&&this.routes.find(route=>
      number(route.entryApproach)>0&&racer.distance>=route.start-route.entryApproach&&racer.distance<route.start
      &&Math.abs(racer.lateral-number(route.entryLateral))<=number(route.entryWidth,5)/2
      &&Math.abs(racer.lateral)>1.8
      &&(!route.requiresBoost||racer.boostTime>0));
    const cancellingEntry=entryRoute&&input.steer*Math.sign(number(entryRoute.entryLateral))<-.12;
    const approachRoute=cancellingEntry?null:entryRoute;
    racer._routeEntryCancelled=cancellingEntry?entryRoute.id:null;
    racer.routeApproach=approachRoute?.id??null;
    racer.steer += (input.steer - racer.steer) * (1 - Math.exp(-(Math.abs(input.steer) < 0.01 ? 100 : 48) * dt));
    const driftPressed = input.drift && !racer._driftHeld;
    racer._driftHeld = Boolean(input.drift);
    if (driftPressed && !racer.drift && racer.speed > 24 && !racer.airborne && !racer.warp && !vacuum && Math.abs(input.steer) > 0.12) {
      racer.drift = true;
      racer.driftPhase = 'entry';
      racer.driftQuality = 0;
      racer.driftDirection = Math.sign(input.steer);
      racer._driftAge = 0;
      racer._driftPeakSlip = 0;
      racer._driftBoosted = racer.boostTime > 0;
      racer._driftHeldCounter = false;
      racer.miniBoostWindow = 0;
      racer._driftEarned = 0;
      racer._driftCountered = false;
      racer._driftRecoveryAge = 0;
      racer.heading += racer.driftDirection * 0.14;
      racer.yawRate += racer.driftDirection * 0.35;
      this._emit('drift-start', racer, { direction: racer.driftDirection });
    }
    // 회복 중 같은 방향으로 다시 끊어 누르면 각도를 이어가는 더블 드리프트가 된다.
    if (driftPressed && racer.drift && racer.driftPhase === 'recover'
      && input.steer * racer.driftDirection > 0.12 && !racer.airborne) {
      racer._driftAge = Math.max(0.14, racer._driftAge);
      racer._driftRecoveryAge = 0;
      racer.heading += racer.driftDirection * 0.055;
      this._emit('drift-link', racer, { direction: racer.driftDirection });
    }
    const boosted = racer.boostTime > 0;
    const draftBoost = isPlayer && racer.draftTime > 0;
    const level = AI_LEVELS[this.difficulty] || AI_LEVELS.adaptive;
    const rawMaxSpeed = level.speed + (racer._index % 4) * level.variation + racer._aiPace;
    const maxSpeed = isPlayer ? NORMAL_SPEED : this.difficulty === 'adaptive' ? clamp(rawMaxSpeed, 42, 160) : rawMaxSpeed;
    const slopeSpeed = clamp(-grade * 36, -6, 6);
    // 발동한 부스터는 가속키를 놓아도 자체 추진한다. 브레이크가 추진보다 우선한다.
    const effectiveThrottle = boosted || racer.miniBoostTime>0 ? 1 : input.throttle;
    const targetSlopeSpeed = boosted ? Math.max(0, slopeSpeed) : slopeSpeed;
    const normalTarget = boosted ? (isPlayer ? BOOST_SPEED : this.difficulty === 'adaptive' ? Math.max(BOOST_SPEED,maxSpeed) : Math.min(BOOST_SPEED,maxSpeed+34)) : racer.miniBoostTime>0 ? Math.max(82,maxSpeed) : draftBoost ? 80 : maxSpeed;
    // 상층 착지 뒤 파란 레일은 완만한 구간에서만 추진한다. 공백과 급커브는 직접 공략한다.
    racer.routeRail = Boolean(activeRoute && !racer.airborne && racer.routeProgress >= number(activeRoute.entryGap,45)
      && (vacuum || racer.distance < activeRoute.end-12 && Math.abs(roadTurn)<.008));
    // 남은 실제 관 길이로 감속 거리를 계산하므로 합류 때 속도가 순간적으로 꺾이지 않는다.
    const vacuumTarget=vacuum?Math.min(number(activeRoute.targetSpeed,300),Math.sqrt(number(activeRoute.exitSpeed,76)**2+2*number(activeRoute.deceleration,250)*Math.max(0,activeRoute.routeLength-racer.routeProgress-24))):0;
    const specialTarget = Math.max(vacuumTarget, racer.routeRail && !vacuum ? 126 : 0, racer.warp ? number(racer._warpFeature.targetSpeed,260) : 0, racer.dashTime > 0 ? racer.dashSpeed : 0);
    const targetSpeed = vacuum ? vacuumTarget : Math.max(specialTarget, isPlayer && boosted ? BOOST_SPEED : normalTarget + targetSlopeSpeed);
    if ((effectiveThrottle > 0 || specialTarget > 0) && input.brake < 0.7) {
      const acceleration = specialTarget > 0 ? vacuum ? number(activeRoute.acceleration,240) : racer.warp ? number(racer._warpFeature.acceleration,180) : racer.dashTime>0 ? racer._dashAcceleration || 160 : 65
        : racer.miniBoostTime>0 ? 85 : boosted ? 65 : draftBoost ? 30 : isPlayer ? 23 : level.acceleration + (this.difficulty === 'adaptive' ? Math.max(0,racer._aiPace)*.45 : 0);
      racer.speed = Math.min(Math.max(racer.speed, targetSpeed), racer.speed + Math.max(8, acceleration - grade * 28) * Math.max(effectiveThrottle,specialTarget > 0 ? 1 : 0) * dt);
    } else racer.speed = Math.max(0, racer.speed - (10 + grade * 28) * dt);
    racer.speed = Math.max(0, racer.speed - input.brake * 49 * dt);
    if (racer.speed > targetSpeed) racer.speed = Math.max(targetSpeed, racer.speed - (vacuum ? number(activeRoute.deceleration,250) : racer.driftExitTime > 0 ? 12 : 29) * dt);
    racer.speed = Math.min(320, racer.speed);

    // 일반 조향도 짧은 관성을 남긴다. 드리프트는 진입·끌기·역조향을 따로 계산한다.
    const speedFactor = clamp(racer.speed / 42, 0, 1);
    // 고속 부스터에서는 같은 키가 지나치게 큰 횡이동을 만들지 않게 조향폭만 줄인다.
    const runAngle = RUN_STEER_ANGLE * Math.min(1, NORMAL_SPEED / Math.max(1, racer.speed));
    const counter = racer.drift && input.steer * racer.driftDirection < -0.12;
    const recovering = racer.drift && (!input.drift || counter);
    if (racer.drift) {
      racer.driftPhase = recovering ? 'recover' : racer._driftAge < 0.16 ? 'entry' : 'slide';
      racer._driftCountered ||= counter;
      racer._driftBoosted ||= boosted;
      racer._driftHeldCounter ||= counter && input.drift && boosted;
      racer._driftRecoveryAge = recovering ? racer._driftRecoveryAge + dt : 0;
    }
    const frameTurn = (racer.warp || vacuum ? 0 : roadTurn) * Math.max(0, racer.speed * Math.cos(racer.velocityHeading)) * dt
      / clamp(1 - roadTurn * racer.lateral, 0.65, 1.35);
    if (!racer.drift) {
      const previous = racer.heading;
      const manualAngle=racer.steer*runAngle*speedFactor*(racer.airborne ? .32 : 1);
      const entryAngle=approachRoute?clamp((number(approachRoute.entryLateral)-racer.lateral)*.035,-.16,.16)
        +roadTurn*racer.speed*(1/RUN_HEADING_RESPONSE+1/RUN_GRIP):manualAngle;
      const desired=approachRoute?manualAngle*.25+entryAngle*.75:manualAngle;
      racer.heading += (desired - racer.heading) * (1 - Math.exp(-(Math.abs(input.steer) < 0.01 && Math.abs(roadTurn) < 0.006 ? 52 : RUN_HEADING_RESPONSE) * dt));
      racer.heading -= frameTurn;
      racer.yawRate = (racer.heading - previous + frameTurn) / dt;
    } else {
      const wantedYaw = recovering
        ? ((counter ? 0 : racer.steer * runAngle * speedFactor) - racer.heading) * (counter ? 24 : 9)
        // 각도가 커질수록 회전력을 줄여 오래 눌러도 옆을 향해 계속 감기지 않는다.
        : racer.steer * DRIFT_TURN_POWER * speedFactor * (racer._driftAge < 0.16 ? 1.12 : 1) - racer.slipAngle * 0.3 - racer.heading ** 3 * DRIFT_ALIGNMENT;
      racer.yawRate += (wantedYaw - racer.yawRate) * (1 - Math.exp(-(recovering ? counter ? 32 : 22 : 14) * dt));
      racer.heading += racer.yawRate * dt - frameTurn;
    }
    racer.heading = clamp(racer.heading, -0.84, 0.84);
    racer.velocityHeading -= frameTurn;
    const grip = racer.airborne ? 2.4 : racer.drift ? recovering ? counter ? 30 : 9 : racer._driftAge < 0.16 ? 3.7 : DRIFT_GRIP : Math.abs(input.steer) < 0.01 && Math.abs(roadTurn) < 0.006 ? 58 : RUN_GRIP;
    racer.velocityHeading += (racer.heading - racer.velocityHeading) * (1 - Math.exp(-grip * dt));
    racer.velocityHeading = clamp(racer.velocityHeading, -1.2, 1.2);
    if (racer.warp || vacuum) {
      const guided = vacuum ? clamp(racer.steer*.026-racer.lateral*.016,-.055,.055) : clamp(racer.steer * .042 - racer.lateral * .009, -.07, .07);
      racer.velocityHeading += (guided-racer.velocityHeading)*(1-Math.exp(-18*dt));
      racer.heading += (guided-racer.heading)*(1-Math.exp(-22*dt));
    }
    racer.slipAngle = racer.heading - racer.velocityHeading;
    if (racer.speed < 1) {
      racer.heading *= Math.exp(-5 * dt);
      racer.velocityHeading *= Math.exp(-8 * dt);
      racer.yawRate *= Math.exp(-8 * dt);
      racer.slipAngle = racer.heading - racer.velocityHeading;
    }
    if (racer.drift) {
      racer._driftAge += dt;
      const slip = Math.abs(Math.sin(racer.slipAngle));
      racer._driftPeakSlip = Math.max(racer._driftPeakSlip,slip);
      const slidingSpeed = racer.speed * slip;
      // HUD·마찰음은 직전 탈출 점수가 아니라 지금 실제로 만들고 있는 슬립을 보여 준다.
      const liveQuality = !racer.airborne && racer._wallContact === 0
        ? clamp((racer.speed - 24) / 42, 0, 1) * clamp((slip - 0.045) / 0.25, 0, 1) * clamp((0.72 - slip) / 0.2, 0, 1)
        : 0;
      racer.driftQuality += (liveQuality - racer.driftQuality) * (1 - Math.exp(-12 * dt));
      // 실제 슬립각과 주행 속도가 커야 충전된다. 정지/벽 비비기/Shift 단독으로 얻을 수 없다.
      const gained = !racer.airborne && racer.speed > 24 && racer._wallContact === 0 ? Math.max(0, slidingSpeed - 2.5) * 3.15 * (racer._driftAge>.55&&liveQuality>.4?1.12:1) * dt : 0;
      racer._driftEarned += gained;
      racer.boostGauge = Math.min(racer.boostItems < MAX_BOOST_ITEMS ? 200 : 100, racer.boostGauge + gained);
      this._storeGauge(racer);
      const preciseCut=counter&&input.drift&&boosted&&racer._driftPeakSlip<.52&&Math.abs(racer.heading)<.4;
      racer.speed = Math.max(0,racer.speed-(slip*(counter?5:11)+Math.abs(racer.yawRate)*.8)*(preciseCut?.55:1)*dt);
      if ((recovering && Math.abs(racer.slipAngle) < 0.065 && racer._driftRecoveryAge > 0.065 && racer._driftAge > 0.12) || racer.speed < 15) this._endDrift(racer);
    }
    racer.forwardSpeed = Math.max(0, racer.speed * Math.cos(racer.velocityHeading));
    racer._contactLateralSpeed *= Math.exp(-6 * dt);
    racer.lateralVelocity = racer.speed * Math.sin(racer.velocityHeading) + racer._contactLateralSpeed;
    racer.lateral += racer.lateralVelocity * dt;
    const boundary = this._roadWidth(racer.distance, racer) - 0.65;
    if (Math.abs(racer.lateral) > boundary) {
      racer.lateral = clamp(racer.lateral, -boundary, boundary);
      const side = Math.sign(racer.lateral);
      const impact = Math.abs(racer.lateralVelocity);
      if (racer._wallContact !== side && racer._wallCooldown <= 0 && racer.speed > 15) {
        racer.speed *= clamp(0.91 - impact / 180, 0.58, 0.9);
        racer.boostGauge *= 0.6;
        racer._wallCooldown = 0.35;
        this._endDrift(racer, true);
        this._emit('wall', racer, { side, impact });
      }
      // 벽면 접선으로 밀려나게 해서 계속 붙어 있을 때 충격을 중복 적용하지 않는다.
      racer.heading = Math.min(0.07, Math.abs(racer.heading)) * side;
      racer.velocityHeading = -side * 0.018;
      racer._contactLateralSpeed = 0;
      racer.slipAngle = racer.heading - racer.velocityHeading;
      racer.yawRate *= 0.2;
      racer.lateralVelocity = racer.speed * Math.sin(racer.velocityHeading);
      racer.forwardSpeed = racer.speed * Math.cos(racer.velocityHeading);
      racer._wallContact = side;
    } else if (Math.abs(racer.lateral) < boundary - 0.3) racer._wallContact = 0;
    // 벽을 관통한 한 프레임뿐 아니라 접촉대를 따라 비비는 동안 계속 마찰을 받는다.
    // 안쪽 조향으로 빠져나올 최소 추진은 남기고 브레이크로는 완전히 멈출 수 있다.
    if(racer._wallContact!==0) {
      const escapeSpeed=effectiveThrottle>0&&input.brake<.1 ? Math.min(racer.speed,12) : 0;
      racer.speed=Math.max(escapeSpeed,racer.speed-42*dt);
      racer.forwardSpeed=racer.speed*Math.cos(racer.velocityHeading);
      racer.lateralVelocity=racer.speed*Math.sin(racer.velocityHeading)+racer._contactLateralSpeed;
    }
  }

  _aiControls(racer, dt, curvature) {
    const index = racer._index;
    const vacuum=this.routes.some(route=>route.id===racer.routeId&&route.kind==='bridge-mach');
    const level = AI_LEVELS[this.difficulty] || AI_LEVELS.adaptive;
    const adaptive = this.difficulty === 'adaptive' || !AI_LEVELS[this.difficulty];
    const independentFinish = adaptive && this._adaptiveFinal;
    const roadTurn = number(this.turnRateAt?.(this._trackDistance(racer.distance), racer), curvature / 112);
    const previewTurn = number(this.turnRateAt?.(this._ahead(racer,racer.speed*0.24), racer), roadTurn);
    const gapToPlayer = this.player.distance - racer.distance;
    // 선두 세 명은 가까운 경쟁 상대, 뒤쪽 선수들은 서로 다른 간격을 목표로 한다.
    // 거리 자체를 고치지 않고 제한된 추진력만 조절해 멀어진 선수도 실제로 따라잡는다.
    const desiredGap = adaptive ? [-12,24,65,115,175,245,320][Math.max(0,index-1)%7] + Math.sin(this.time*.085+index*1.7)*10 : (index-4)*9;
    const engaged = this.time > 5 && this.player.speed > 25 && this.player.distance > 35;
    const error = gapToPlayer - desiredGap;
    const catchup = clamp((error-95)/550,0,1);
    const ceiling = adaptive ? 44 + catchup*44 : 19;
    const feedback = adaptive ? error * (index<=3 ? .27 : .19) : error*.11;
    let paceGoal = engaged ? clamp((this._playerPace-level.speed)*(adaptive?1:0.9)+feedback,adaptive?-30:-18,ceiling)*level.pace : 0;
    // 결승 승부는 동결된 주행 수준과 자기 라인으로만 결정한다. 앞서면 기다리고
    // 따라붙으면 다시 가속하던 거리 피드백은 부스터·커팅까지 모두 끊는다.
    if (independentFinish) paceGoal = clamp(this._playerPace-level.speed,-30,0)*level.pace;
    racer._aiPace += (paceGoal-racer._aiPace)*(1-Math.exp(-dt/(adaptive?1.6:3.5)));
    const physicalGap = other => other.routeId === racer.routeId ? this._racerGap(racer,other) : Infinity;
    const edge = Math.min(Math.abs(previewTurn)>0.01?3.4:5.6,this._roadWidth(racer.distance, racer)-2.1,this._roadWidth(racer.distance+racer.speed*.55,racer)-2.1);
    const laneLow=-edge, laneHigh=edge;
    // 진입은 바깥, 정점은 안쪽을 노리되 옆 선수와 좁은 길의 여유를 우선한다.
    let lane = Math.abs(previewTurn) > 0.006 ? Math.sign(previewTurn)*level.line : (index%2?-0.9:0.9);
    if (Math.abs(previewTurn) > 0.01 && Math.abs(roadTurn) < Math.abs(previewTurn) * 0.55) lane = -Math.sign(previewTurn) * 1.5;
    lane += ((index%3)-1)*0.7;
    let passing = this.racers.find(other => other.id === racer._aiPassId);
    if (passing && (passing.finished || physicalGap(passing)<-6 || physicalGap(passing)>45)) passing=null;
    if (!passing) {
      racer._aiPassId=null;
      let nearest=Infinity;
      for (const other of this.racers) {
        if (other===racer || other.finished) continue;
        const gap=physicalGap(other);
        const look=clamp(14+Math.max(0,racer.speed-other.speed)*0.6,18,38);
        if (gap>0 && gap<look && gap<nearest && (Math.abs(other.lateral-racer.lateral)<3.4 || Math.abs(other.lateral-lane)<2.9)) {passing=other;nearest=gap;}
      }
      if (passing) {
        const sides=[-1,1].map(side => {
          const candidate=clamp(passing.lateral+side*3.6,laneLow,laneHigh);
          let cost=Math.abs(candidate-racer.lateral)*0.55+Math.abs(candidate-lane)*0.2;
          if (Math.abs(candidate-passing.lateral)<3.2) cost+=20;
          for (const other of this.racers) if (other!==racer && other!==passing && !other.finished) {
            const gap=physicalGap(other);
            if (gap>-7 && gap<28) cost+=Math.max(0,3.3-Math.abs(other.lateral-candidate))*5;
          }
          return {side,cost:cost+(side===(index%2?1:-1)?0:0.03)};
        });
        sides.sort((a,b)=>a.cost-b.cost);
        racer._aiPassId=passing.id;racer._aiPassSide=sides[0].side;
      }
    }
    if (passing) lane=clamp(passing.lateral+racer._aiPassSide*3.6,laneLow,laneHigh);
    if(racer.routeId&&!passing)lane=0;
    const angularSpeed = (roadTurn * 0.5 + previewTurn * 0.5) * racer.speed / clamp(1 - roadTurn * racer.lateral, 0.65, 1.35);
    const wantDrift = !racer.warp && !vacuum && Math.abs(previewTurn * racer.speed) > level.drift && racer.speed > 28;
    const desiredVelocity = clamp((lane - racer.lateral) * 0.03-racer._contactLateralSpeed/Math.max(20,racer.speed)*0.7, -0.16, 0.16);
    const desiredHeading = desiredVelocity + angularSpeed / DRIFT_GRIP;
    const runAngle = RUN_STEER_ANGLE * Math.min(1, NORMAL_SPEED / Math.max(1, racer.speed));
    const steer = racer.warp || vacuum ? clamp((lane-racer.lateral)*.22,-1,1) : wantDrift || racer.drift
      ? clamp((angularSpeed + (desiredHeading - racer.heading) * 4.1 + (desiredVelocity - racer.velocityHeading) * 1.5 + racer.heading ** 3 * DRIFT_ALIGNMENT + racer.slipAngle * 0.3) / DRIFT_TURN_POWER, -1, 1)
      : clamp((desiredVelocity + angularSpeed * (1 / RUN_HEADING_RESPONSE + 1 / RUN_GRIP)) / runAngle, -1, 1);
    const fartherTurn = number(this.turnRateAt?.(this._ahead(racer,racer.speed*0.62), racer), previewTurn);
    const cornerSpeed = racer.warp || vacuum ? 320 : clamp((racer.routeId?1.4:level.corner) / Math.max(0.001, Math.abs(previewTurn), Math.abs(fartherTurn) * 0.83), 33, racer.dashTime > 0 ? 320 : adaptive ? 170 : BOOST_SPEED);
    const battleLead = desiredGap - gapToPlayer;
    // 숙련 주자를 뒤쫓을 때는 긴 직선에서도 실제 숏 드리프트로 부스터를 번다.
    // 추격 추진과 별개로 점프에 필요한 아이템은 실제 슬립·역조향으로 번다.
    const longTurn = number(this.turnRateAt?.(this._ahead(racer,racer.speed*1.7), racer), fartherTurn);
    const cuttingRoom = !this.racers.some(other => other !== racer && !other.finished
      && Math.abs(physicalGap(other)) < 6 && Math.abs(other.lateral-racer.lateral) < 2.8);
    if (adaptive && !racer._aiCutPhase && this.time >= racer._aiNextCut && (this._playerPace > 75 || !independentFinish && this._playerCutCount > 0 || racer._aiNeedsBoost)
      && (independentFinish || battleLead < 0 || racer._aiNeedsBoost) && !racer.warp && !vacuum && racer.speed > 52 && !racer.drift && !racer.airborne
      && racer.boostTime <= 0 && racer.boostItems < 1 && Math.abs(racer.lateral)<3 && cuttingRoom
      && Math.max(Math.abs(roadTurn),Math.abs(previewTurn),Math.abs(fartherTurn),Math.abs(longTurn))<.003) {
      racer._aiCutPhase = 'entry';
      racer._aiCutAge = 0;
      racer._aiCutDirection = Math.abs(racer.lateral)>.6 ? -Math.sign(racer.lateral) : (index%2 ? -1 : 1);
    }
    if (racer._aiCutPhase) {
      racer._aiCutAge += dt;
      if (racer._aiCutAge >= .28 || Math.abs(racer.lateral)>this._roadWidth(racer.distance, racer)-4) racer._aiCutPhase = 'recover';
      if (racer._aiCutAge >= .52) {racer._aiCutPhase=null;racer._aiNextCut=this.time+1+index*.035;}
    }
    const speedSection = this.trackFeatures.some(feature => feature.speedSection && this._insideFeature(racer.distance, feature));
    const obstacle = !racer.routeId && this.gapFeatures.find(feature => feature.start > racer.distance && feature.start-racer.distance < 900);
    // 가까운 세 라이벌은 본선 경쟁을 유지한다. 뒤쪽 선수들은 진공관을
    // 선택하고, 플레이어가 먼저 진입했으면 가까운 라이벌도 같은 분기를 탄다.
    const routeChoice = !racer.routeId && this.routes.find(route => route.start > racer.distance && route.start-racer.distance < 900
      && (route.kind==='bridge-mach' ? this.player.routeId===route.id || index>=4&&index%3!==0 : index%3!==0&&(index!==2||this.player.routeId===route.id)));
    const nextLaunch = Math.min(obstacle?.launchStart ?? Infinity,routeChoice?.requiresBoost?routeChoice.start:Infinity);
    racer._aiNeedsBoost = Number.isFinite(nextLaunch) && racer.boostItems < 1;
    const savingBoost = nextLaunch-racer.distance < 900 && nextLaunch-racer.distance > racer.speed*1.2 && racer.boostItems < 2;
    const launchNow = nextLaunch-racer.distance <= Math.max(50,racer.speed*.8) && nextLaunch>racer.distance;
    const canAttack = launchNow || !savingBoost && (independentFinish || !engaged || battleLead < (speedSection ? 22 : 9 + (index % 3) * 4));
    if (canAttack && !racer.warp && !vacuum && !racer._aiCutPhase && this.time >= racer._aiNextBoost && (launchNow || Math.max(Math.abs(previewTurn), Math.abs(fartherTurn)) < (speedSection ? Math.max(level.boostCurve, 0.017) : level.boostCurve)) && Math.abs(racer.lateral) < this._roadWidth(racer.distance, racer)-2 && !racer.airborne) {
      if (this._activateBoost(racer, 'ai')) racer._aiNextBoost = this.time + level.boostDelay + index * 0.045;
    }
    let routeSteer = null;
    if (routeChoice && routeChoice.start-racer.distance < Math.max(100,racer.speed*1.6) && (!routeChoice.requiresBoost || racer.boostItems+racer.boostTime > 0)) {
      const routeVelocity = clamp((number(routeChoice.entryLateral)-racer.lateral)*.035,-.16,.16);
      routeSteer = clamp((routeVelocity+angularSpeed*(1/RUN_HEADING_RESPONSE+1/RUN_GRIP))/runAngle,-1,1);
    }
    const aligningEntry=routeChoice&&routeChoice.start-racer.distance<=number(routeChoice.entryApproach)
      &&Math.abs(racer.lateral-number(routeChoice.entryLateral))<=number(routeChoice.entryWidth,5)/2
      &&(!routeChoice.requiresBoost||racer.boostTime>0);
    // 선택 차선에 들어온 AI도 키를 놓아 같은 유도 물리를 쓴다. 입구를
    // 향한 미세 역조향을 '본선으로 돌아가기'로 오해하지 않게 한다.
    if(aligningEntry){routeSteer=0;racer._aiCutPhase=null;}
    const projected=racer.lateral+racer.lateralVelocity*.26;
    const avoidWall=!racer.warp&&Math.abs(projected)>this._roadWidth(racer.distance,racer)-1.5&&racer.lateral*racer.lateralVelocity>0;
    if(avoidWall){racer._aiCutPhase=null;return {throttle:1,brake:racer.airborne?0:.7,steer:-Math.sign(racer.lateral),drift:false,boost:false};}
    return { throttle: 1, brake: !launchNow && racer.speed > cornerSpeed + 3 ? 0.7 : 0,
      steer:routeSteer ?? (racer._aiCutPhase ? racer._aiCutDirection*(racer._aiCutPhase==='entry'?1:-1) : steer),
      drift:aligningEntry?false:racer._aiCutPhase ? racer._aiCutPhase==='entry' : wantDrift && (Math.abs(steer) > 0.12 || racer.drift), boost: false };
  }

  _roadWidth(distance, racer) {
    const route = this.routes.find(route => route.id === racer?.routeId);
    return Math.max(3, number(this.roadHalfWidthAt?.(this._trackDistance(distance), racer), route?.halfWidth ?? this.roadHalfWidth));
  }

  _trackDistance(distance) {
    return this.loop ? distance : clamp(distance, 0, this.length);
  }

  _physicalGap(from, to) {
    return this.loop ? modulo(to - from + this.length / 2, this.length) - this.length / 2 : to - from;
  }

  _insideFeature(distance, feature) {
    if (!this.loop) return distance >= number(feature.start) && distance <= number(feature.end, feature.start);
    const start = modulo(number(feature.start), this.length);
    const span = modulo(number(feature.end, start) - start, this.length);
    return modulo(distance - start, this.length) <= span;
  }

  _ahead(racer,meters) {
    const route=this.routes.find(route=>route.id===racer.routeId);
    if(route) {
      const remaining=Math.max(0,route.routeLength-racer.routeProgress);
      if(meters>remaining)return this._trackDistance(route.end+meters-remaining);
      return this._trackDistance(racer.distance+meters*(route.end-route.start)/route.routeLength);
    }
    return this._trackDistance(racer.distance+meters);
  }

  _groundHeight(racer, distance = racer.distance) {
    return number(this.heightAt?.(this._trackDistance(distance),racer));
  }

  _advance(racer, distance) {
    const route = this.routes.find(route => route.id === racer.routeId);
    if (!route) {racer.distance += distance;return;}
    racer.routeProgress += distance;
    racer.distance = route.start + racer.routeProgress / route.routeLength * (route.end-route.start);
    if (racer.routeProgress >= route.routeLength) {
      const excess = racer.routeProgress-route.routeLength;
      const exitWorldY = racer.airborne && Number.isFinite(racer.jumpWorldY) ? racer.jumpWorldY : this._groundHeight(racer,route.end);
      racer.distance = route.end+excess;
      racer.lateral += number(route.exitLateral);
      racer.routeId = null;racer.routeProgress = 0;racer.routeRail=false;
      const drop = exitWorldY-this._groundHeight(racer);
      if(drop>.1) {
        this._endDrift(racer);
        racer.airborne=true;racer.jumpWorldY=exitWorldY;racer.jumpHeight=drop;racer.jumpVelocity=0;
        this._emit('jump',racer,{featureId:route.id,velocity:0,height:drop,routeExit:true});
      }
      this._emit('route-exit',racer,{routeId:route.id,drop:Math.max(0,drop)});
    }
  }

  _racerGap(a,b) {
    if (a.routeId !== b.routeId) return Infinity;
    return a.routeId ? b.routeProgress-a.routeProgress : this._physicalGap(a.distance,b.distance);
  }

  _launch(racer, velocity, featureId) {
    this._endDrift(racer);
    racer.airborne = true;racer.jumpHeight = 0;
    racer.jumpWorldY = this._groundHeight(racer);
    racer.jumpVelocity = clamp(number(velocity,16),4,24);
    this._emit('jump',racer,{featureId,velocity:racer.jumpVelocity,height:0});
  }

  _checkRoutes(racer,previous) {
    if (racer.routeId || racer.falling || racer.airborne) return;
    this.routes.forEach((route,index) => {
      if (previous >= route.start || racer.distance < route.start || racer._routePasses[index]) return;
      racer._routePasses[index] = true;
      if (racer._routeEntryCancelled===route.id || Math.abs(racer.lateral-number(route.entryLateral)) > number(route.entryWidth,5)/2
        || racer.speed < number(route.minSpeed,94) || route.requiresBoost && racer.boostTime <= 0) return;
      const worldY = this._groundHeight(racer);
      racer.routeApproach=null;
      racer.routeId = route.id;racer.routeProgress = Math.max(0,racer.distance-route.start);
      racer.lateral -= number(route.entryLateral);
      racer.distance = route.start+racer.routeProgress/route.routeLength*(route.end-route.start);
      if(route.entryMode==='ramp'){
        this._endDrift(racer);racer.airborne=false;racer.jumpHeight=0;racer.jumpVelocity=0;racer.jumpWorldY=null;
        racer._aiCutPhase=null;
      }else{
        this._launch(racer,number(route.launchSpeed,16),route.id);
        racer.jumpWorldY = worldY;
      }
      this._emit('route-enter',racer,{routeId:route.id});
    });
  }

  _checkGaps(racer,previous) {
    if (racer.routeId || racer.falling) return;
    this.gapFeatures.forEach((feature,index) => {
      const launch = number(feature.launchStart,feature.start-12);
      if (previous < launch && racer.distance >= launch && !racer._gapPasses[index]) {
        racer._gapPasses[index] = true;
        if (!racer.airborne && racer.speed >= number(feature.minSpeed,96) && (!feature.requiresBoost || racer.boostTime > 0)) {
          racer._activeGap = feature;
          this._launch(racer,number(feature.launchSpeed,16),feature.id);
        }
      }
      if (racer.distance >= feature.start && previous < feature.end) {
        if (racer._activeGap !== feature || !racer.airborne) this._fall(racer,feature);
        else if (racer.distance >= feature.end) {
          racer._activeGap = null;
          this._emit('gap-clear',racer,{featureId:feature.id});
        }
      }
    });
  }

  _fall(racer,feature) {
    if (racer.falling) return;
    this._endDrift(racer,true);
    racer.falling = true;racer.airborne = true;racer.fallTime = 0;racer.routeRail=false;
    racer._fallFeature = feature;
    racer.jumpWorldY ??= this._groundHeight(racer)+racer.jumpHeight;
    racer.jumpVelocity = Math.min(0,racer.jumpVelocity);
    racer.boostTime = 0;racer.dashTime = 0;racer.warp = false;
    this._emit('fall',racer,{featureId:feature.id});
  }

  _updateFall(racer,dt) {
    racer.fallTime += dt;
    racer.jumpWorldY += racer.jumpVelocity*dt-.5*JUMP_GRAVITY*dt*dt;
    racer.jumpVelocity -= JUMP_GRAVITY*dt;
    racer.speed *= Math.exp(-2.2*dt);
    racer.forwardSpeed = racer.speed;
    this._advance(racer,racer.speed*dt);
    racer.jumpHeight = racer.jumpWorldY-this._groundHeight(racer);
    const feature = racer._fallFeature;
    if (racer.fallTime < number(feature.respawnDelay,1.4)) return;
    racer.distance = Math.max(0,number(feature.resetDistance,feature.start-180));
    racer.routeId = null;racer.routeProgress = 0;racer.routeRail=false;racer.lateral = 0;
    racer.falling = false;racer.airborne = false;racer.jumpHeight = 0;racer.jumpVelocity = 0;racer.jumpWorldY = null;
    racer.heading = 0;racer.velocityHeading = 0;racer.yawRate = 0;racer.slipAngle = 0;
    racer._wallContact = 0;racer._wallCooldown = 0;racer._contactLateralSpeed = 0;
    racer.speed = 38;racer.forwardSpeed = 38;racer.boostItems = Math.max(1,racer.boostItems);
    racer._activeGap = null;racer._warpFeature = null;
    this.gapFeatures.forEach((gap,index) => {if (gap.end > racer.distance) racer._gapPasses[index] = false;});
    this.jumpFeatures.forEach((jump,index) => {if (jump.end > racer.distance) racer._jumpPasses[index] = undefined;});
    this.routes.forEach((route,index) => {if (route.end > racer.distance) racer._routePasses[index] = false;});
    this.dashZones.forEach((zone,index) => {if (number(zone.end,number(zone.start)+12)>racer.distance) racer._dashPasses[index]=undefined;});
    this._emit('respawn',racer,{featureId:feature.id,distance:racer.distance});
  }

  _checkJump(racer, previous) {
    if (racer.routeId || racer.falling) return;
    for (let index = 0; index < this.jumpFeatures.length; index++) {
      const feature = this.jumpFeatures[index];
      const start = this.loop ? modulo(number(feature.start), this.length) : clamp(number(feature.start), 0, this.length);
      const pass = this.loop ? Math.floor((racer.distance - start) / this.length) : 0;
      const absoluteStart = pass * this.length + start;
      if (previous >= absoluteStart || racer.distance < absoluteStart || racer._jumpPasses[index] === pass) continue;
      racer._jumpPasses[index] = pass;
      if (racer.airborne || racer.speed < Math.max(0, number(feature.minSpeed, 42))) continue;
      this._launch(racer,clamp(number(feature.launchSpeed,9)*clamp(racer.speed/78,.78,1.18),4,18),feature.id ?? `jump-${index}`);
    }
  }

  _updateJump(racer, dt) {
    racer.landingImpact *= Math.exp(-8 * dt);
    if (!racer.airborne) return;
    racer.jumpWorldY ??= this._groundHeight(racer)+racer.jumpHeight;
    racer.jumpWorldY += racer.jumpVelocity*dt-.5*JUMP_GRAVITY*dt*dt;
    racer.jumpVelocity -= JUMP_GRAVITY*dt;
    racer.jumpHeight = racer.jumpWorldY-this._groundHeight(racer);
    const gap = racer._activeGap;
    const route = this.routes.find(route => route.id === racer.routeId);
    if (route && racer.routeProgress < number(route.entryGap,45)) {
      if(racer.jumpVelocity<0&&racer.jumpHeight<0)this._fall(racer,{...route,resetDistance:route.start-180,respawnDelay:1.4});
      return;
    }
    if (racer.jumpHeight > 0) return;
    if (gap && racer.distance >= gap.start && racer.distance < gap.end) {this._fall(racer,gap);return;}
    if (route && racer.jumpVelocity > 0) {this._fall(racer,{...route,resetDistance:route.start-180,respawnDelay:1.4});return;}
    const impact = Math.abs(racer.jumpVelocity);
    const clean = Math.abs(racer.velocityHeading) < 0.23 && racer._wallContact === 0;
    racer.jumpHeight = 0;
    racer.jumpWorldY = null;
    racer.jumpVelocity = 0;
    racer.airborne = false;
    racer.landingImpact = impact;
    // 착지 각도가 나쁘면 속도를 잃고, 정면으로 착지하면 진입 속도를 보존한다.
    if (!clean) racer.speed *= clamp(0.96 - Math.abs(racer.velocityHeading) * 0.12, 0.85, 0.97);
    this._emit('land', racer, { impact, clean });
  }

  _checkDash(racer, previous) {
    if (racer.distance < 0 || racer.routeId || racer.airborne) return;
    this.dashZones.forEach((zone, index) => {
      const rawStart = number(zone.start ?? zone.distance);
      const start = this.loop ? modulo(rawStart, this.length) : clamp(rawStart, 0, this.length);
      const rawEnd = number(zone.end, start + number(zone.length, 12));
      const end = this.loop ? modulo(rawEnd, this.length) : clamp(rawEnd, start, this.length);
      const span = this.loop ? modulo(end - start, this.length) : end - start;
      const pass = this.loop ? Math.floor((racer.distance - start) / this.length) : 0;
      const absoluteStart = pass * this.length + start;
      const inside = racer.distance >= absoluteStart && racer.distance <= absoluteStart + span;
      const crossed = previous < absoluteStart && racer.distance >= absoluteStart;
      const lane = number(zone.lateral);
      const width = Math.max(0.5, number(zone.width, this.roadHalfWidth * 2));
      if ((inside || crossed) && Math.abs(racer.lateral - lane) < width / 2) {
        // 옆으로 나갔다 재진입하거나 구간이 겹쳐도 같은 통과에서는 재충전하지 않는다.
        if (racer._dashPasses[index] !== pass) {
          racer._dashPasses[index] = pass;
          const duration = Math.max(0.3, number(zone.duration, 1.25));
          racer.boostTime = Math.max(racer.boostTime, duration);
          racer.boostSource = 'dash';
          if (number(zone.targetSpeed) > BOOST_SPEED) {
            racer.dashTime = Math.max(racer.dashTime,duration);
            racer.dashSpeed = clamp(zone.targetSpeed,BOOST_SPEED,320);
            racer._dashAcceleration = Math.max(1,number(zone.acceleration,160));
            this._emit('dash',racer,{featureId:zone.id,targetSpeed:racer.dashSpeed,duration});
          }
          this._emit('boost', racer, { source: 'dash', duration });
        }
      }
    });
  }

  _crossLaps(racer, previous, stepStart, dt, finishes) {
    const priorLap = Math.max(0, Math.floor(previous / this.length));
    const nextLap = Math.min(this.laps, Math.floor(racer.distance / this.length));
    for (let completed = priorLap + 1; completed <= nextLap; completed++) {
      // 접촉에 밀려 통과한 선 뒤로 돌아가도 같은 랩 기록을 다시 만들지 않는다.
      if (completed <= racer.lapTimes.length) continue;
      const line = completed * this.length;
      const fraction = clamp((line - previous) / Math.max(1e-9, racer.distance - previous), 0, 1);
      const at = stepStart + dt * fraction;
      const lapTime = at - racer._lastLapAt;
      racer._lastLapAt = at;
      racer.lastLapTime = lapTime;
      racer.lapTimes.push(lapTime);
      if (racer._index === 0) {
        this.lapTimes.push(lapTime);
        this.bestLap = this.bestLap === null ? lapTime : Math.min(this.bestLap, lapTime);
      }
      this._emit('lap', racer, { lap: Math.min(this.laps, completed + 1), completed, lapTime });
      if (completed === this.laps) {
        racer.finished = true;
        racer.finishTime = at;
        racer.distance = this.totalDistance;
        racer.drift = false;
        finishes.push(racer);
      }
    }
    racer.lap = racer.finished ? this.laps : clamp(racer.lapTimes.length + 1, 1, this.laps);
  }

  _collisions(dt, previous = this.racers.map(r => ({distance:r.distance, lateral:r.lateral,routeId:r.routeId,routeProgress:r.routeProgress}))) {
    for (let first = 0; first < this.racers.length; first++) {
      for (let second = first + 1; second < this.racers.length; second++) {
        const a = this.racers[first];
        const b = this.racers[second];
        if (a.finished || b.finished || a.falling || b.falling || a.routeId !== b.routeId || Math.abs(a.jumpHeight-b.jumpHeight)>1.8) continue;
        const priorA = previous[first], priorB = previous[second];
        if ((priorA.routeId ?? null)!==a.routeId || (priorB.routeId ?? null)!==b.routeId) continue;
        const priorDistanceA = a.routeId ? priorA.routeProgress : priorA.distance;
        const priorDistanceB = b.routeId ? priorB.routeProgress : priorB.distance;
        const travelA = (a.routeId ? a.routeProgress : a.distance)-priorDistanceA;
        const travelB = (b.routeId ? b.routeProgress : b.distance)-priorDistanceB;
        const gap = a.routeId ? priorDistanceB-priorDistanceA : this._physicalGap(priorDistanceA,priorDistanceB);
        const x = (priorB.lateral - priorA.lateral) / CONTACT_WIDTH, z = gap / CONTACT_LENGTH;
        const dx = ((b.lateral-priorB.lateral)-(a.lateral-priorA.lateral)) / CONTACT_WIDTH;
        const dz = (travelB-travelA)/CONTACT_LENGTH;
        const c = x*x + z*z - 1, aa = dx*dx + dz*dz;
        let at = 0;
        if (c > 0) {
          const bb = 2*(x*dx+z*dz), discriminant = bb*bb-4*aa*c;
          if (aa < 1e-12 || discriminant < 0) continue;
          at = (-bb-Math.sqrt(discriminant))/(2*aa);
          if (at < 0 || at > 1) continue;
        }
        // 타원 표면의 법선으로 양쪽을 밀어, 횡접촉과 뒤에서 박는 상황을 같은 식으로 푼다.
        let nx = (x+dx*at)/CONTACT_WIDTH, nz = (z+dz*at)/CONTACT_LENGTH;
        const magnitude = Math.hypot(nx,nz);
        if (magnitude > 1e-8) {nx/=magnitude;nz/=magnitude;}
        else {nx=first%2?1:-1;nz=0;}
        const closing = -((b.lateralVelocity-a.lateralVelocity)*nx+(b.forwardSpeed-a.forwardSpeed)*nz);
        const pair = `${a.id}:${b.id}`;
        const fresh = this.time >= (this._contactTimes.get(pair) ?? -Infinity);
        if (closing > 0) {
          const impulse = closing*(fresh?1.2:1)/2;
          this._contactImpulse(a,-nx*impulse,-nz*impulse);
          this._contactImpulse(b,nx*impulse,nz*impulse);
          if (fresh && closing > 1.5) {
            this._contactTimes.set(pair,this.time+CONTACT_COOLDOWN);
            for (const racer of [a,b]) {racer.contactCount++;racer.lastContactTime=this.time;racer.lastContactImpact=closing;}
            this._emit('contact',a,{otherId:b.id,impact:closing,side:-Math.sign(nx)});
            this._emit('contact',b,{otherId:a.id,impact:closing,side:Math.sign(nx)});
          }
        }
        const endGap = gap+travelB-travelA;
        const support = Math.hypot(CONTACT_WIDTH*nx,CONTACT_LENGTH*nz);
        const penetration = Math.max(0,support-(b.lateral-a.lateral)*nx-endGap*nz)+0.0001;
        // 몸이 파고든 거리만 절반씩 되돌린다. 순위나 랩 차이를 보정하는 이동은 없다.
        this._separatePair(a,b,nx,nz,penetration);
      }
    }
  }

  _separatePair(a,b,nx,nz,penetration) {
    const edgeA=this._roadWidth(a.distance,a)-0.65,edgeB=this._roadWidth(b.distance,b)-0.65;
    const limitA=Math.abs(nx)<1e-8?Infinity:(nx>0?a.lateral+edgeA:edgeA-a.lateral)/Math.abs(nx);
    const limitB=Math.abs(nx)<1e-8?Infinity:(nx>0?edgeB-b.lateral:b.lateral+edgeB)/Math.abs(nx);
    let moveA=Math.min(penetration/2,Math.max(0,limitA));
    const moveB=Math.min(penetration-moveA,Math.max(0,limitB));
    moveA=Math.min(penetration-moveB,Math.max(0,limitA));
    this._advance(a,-nz*moveA);this._advance(b,nz*moveB);
    a.lateral-=nx*moveA;b.lateral+=nx*moveB;
  }

  _separateCrowd() {
    for(let pass=0;pass<3;pass++)for(let first=0;first<this.racers.length;first++)for(let second=first+1;second<this.racers.length;second++){
      const a=this.racers[first],b=this.racers[second];if(a.finished||b.finished||a.falling||b.falling||a.routeId!==b.routeId||Math.abs(a.jumpHeight-b.jumpHeight)>1.8)continue;
      const gap=this._racerGap(a,b);
      const x=(b.lateral-a.lateral)/CONTACT_WIDTH,z=gap/CONTACT_LENGTH;
      if(x*x+z*z>=1)continue;
      let nx=x/CONTACT_WIDTH,nz=z/CONTACT_LENGTH;const norm=Math.hypot(nx,nz);
      if(norm>1e-8){nx/=norm;nz/=norm;}else{nx=first%2?1:-1;nz=0;}
      const penetration=Math.hypot(CONTACT_WIDTH*nx,CONTACT_LENGTH*nz)-(b.lateral-a.lateral)*nx-gap*nz+0.0001;
      this._separatePair(a,b,nx,nz,penetration);
    }
  }

  _contactImpulse(racer, lateral, forward) {
    racer.speed=clamp(racer.speed+forward/Math.max(0.4,Math.cos(racer.velocityHeading)),0,320);
    racer._contactLateralSpeed=clamp(racer._contactLateralSpeed+lateral,-22,22);
    racer.forwardSpeed=racer.speed*Math.cos(racer.velocityHeading);
    racer.lateralVelocity=racer.speed*Math.sin(racer.velocityHeading)+racer._contactLateralSpeed;
  }

  _rank() {
    const sorted = [...this.racers].sort((a, b) => {
      if (a.finished && b.finished) return a.finishTime - b.finishTime || a._index - b._index;
      if (a.finished) return -1;
      if (b.finished) return 1;
      return b.distance - a.distance || a._index - b._index;
    });
    sorted.forEach((racer, index) => { racer.position = index + 1; });
  }
}
