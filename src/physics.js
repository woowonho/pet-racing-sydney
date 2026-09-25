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
const RUN_HEADING_RESPONSE = 45;
const RUN_GRIP = 55;
const DRIFT_TURN_POWER = 3.2;
const DRIFT_GRIP = 5.8;
const DRIFT_ALIGNMENT = 18;
// 원본 주자 그림의 몸통 폭에 맞춘 두 선수의 합산 접촉 반경(가로/진행 방향).
const CONTACT_WIDTH = 2.6;
const CONTACT_LENGTH = 3.0;
const CONTACT_COOLDOWN = 0.42;
const AI_LEVELS = {
  easy: {speed:61, variation:1.3, acceleration:21.5, corner:1.78, drift:1.0, boostCurve:0.0075, boostDelay:5, line:1},
  normal: {speed:69.5, variation:0.65, acceleration:23, corner:1.9, drift:0.92, boostCurve:0.009, boostDelay:3.5, line:1.4},
  hard: {speed:72, variation:0.35, acceleration:24, corner:2.02, drift:0.85, boostCurve:0.011, boostDelay:3.05, line:2.0},
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
  constructor({ length = TRACK_LENGTH, difficulty = 'normal', petId = 'sonic', roster = [], dashZones = [], curvatureAt = null, turnRateAt = null, gradeAt = null, roadHalfWidth = ROAD_HALF_WIDTH } = {}) {
    this.length = Math.max(20, number(length, TRACK_LENGTH));
    this.difficulty = difficulty;
    this.petId = petId;
    this.roster = Array.isArray(roster) && roster.length ? roster : DEFAULT_PETS;
    this.dashZones = Array.isArray(dashZones) ? dashZones : [];
    this.curvatureAt = typeof curvatureAt === 'function' ? curvatureAt : null;
    // rad/m 단위의 실제 도로 곡률. 기존 정규화 곡률 입력도 사용할 수 있다.
    this.turnRateAt = typeof turnRateAt === 'function' ? turnRateAt : null;
    this.gradeAt = typeof gradeAt === 'function' ? gradeAt : null;
    this.roadHalfWidth = Math.max(3, number(roadHalfWidth, ROAD_HALF_WIDTH));
    this.reset();
  }

  get player() { return this.racers[0]; }
  get position() { return this.player.position; }
  get lap() { return this.player.lap; }
  get totalDistance() { return this.length * LAPS; }

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
    if (boostPressed) this._activateBoost(this.player, 'manual');
    while (remaining > 1e-9 && this.state === 'racing') {
      const step = Math.min(remaining, MAX_STEP);
      this._step(step, controls, curve);
      remaining -= step;
    }
  }

  _emit(type, racer, detail = {}) {
    this.events.push({ type, racerId: racer.id, petId: racer.petId, time: this.time, ...detail });
    if (this.events.length > 256) this.events.shift();
  }

  _activateBoost(racer, source) {
    if (racer.finished || racer.boostTime > 0 || racer.boostItems < 1) return false;
    racer.boostItems--;
    racer.boostTime = BOOST_DURATION;
    racer.boostSource = source;
    this._emit('boost', racer, { source, duration: BOOST_DURATION });
    // 슬롯이 가득 차서 보관한 완충 게이지는 빈 슬롯이 생기는 순간 아이템으로 바뀐다.
    this._storeGauge(racer);
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
    this._emit('drift-release', racer, { charge: racer.boostGauge, reward: 0, crashed });
    racer.drift = false;
    racer.driftPhase = 'grip';
    racer.driftDirection = 0;
  }

  _step(dt, controls, curvature) {
    const stepStart = this.time;
    this.time += dt;
    this._updateDraft(dt);
    const finishes = [];
    const previous = this.racers.map(racer => ({distance:racer.distance, lateral:racer.lateral}));
    for (const racer of this.racers) {
      if (racer.finished) continue;
      const racerCurve = clamp(number(this.curvatureAt?.(racer.distance) ?? curvature, curvature), -1, 1);
      const input = racer._index === 0 ? controls : this._aiControls(racer, dt, racerCurve);
      racer._wallCooldown = Math.max(0, racer._wallCooldown - dt);
      const roadTurn = clamp(number(this.turnRateAt?.(racer.distance), racerCurve / 112), -0.15, 0.15);
      const grade = clamp(number(this.gradeAt?.(racer.distance)), -0.3, 0.3);
      this._drive(racer, input, racerCurve, dt, roadTurn, grade);
      // 평행 차선의 길이 차이까지 고려해 코너 안쪽과 바깥쪽 진행 거리를 계산한다.
      racer.distance += racer.forwardSpeed * dt / clamp(1 - roadTurn * racer.lateral, 0.65, 1.35);
      racer.boostTime = Math.max(0, racer.boostTime - dt);
      racer.draftTime = Math.max(0, racer.draftTime - dt);
    }
    // 진행 방향의 접촉도 먼저 해결한 뒤 실제 통과한 거리로 랩/결승을 판정한다.
    this._collisions(dt, previous);
    // 셋 이상이 동시에 닿으면 뒤 쌍의 분리가 앞 쌍을 다시 누를 수 있어 위치만 재검사한다.
    this._separateCrowd();
    this.racers.forEach((racer,index) => {
      if (racer.finished) return;
      this._checkDash(racer, previous[index].distance);
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
      return other !== player && !other.finished && gap >= 4 && gap <= 20
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

  _drive(racer, input, curvature, dt, roadTurn, grade = 0) {
    const isPlayer = racer._index === 0;
    racer.steer += (input.steer - racer.steer) * (1 - Math.exp(-48 * dt));
    const driftPressed = input.drift && !racer._driftHeld;
    racer._driftHeld = Boolean(input.drift);
    if (driftPressed && !racer.drift && racer.speed > 24 && Math.abs(input.steer) > 0.12) {
      racer.drift = true;
      racer.driftPhase = 'slide';
      racer.driftDirection = Math.sign(input.steer);
      racer._driftAge = 0;
      racer.heading += racer.driftDirection * 0.12;
      racer.yawRate += racer.driftDirection * 0.35;
      this._emit('drift-start', racer, { direction: racer.driftDirection });
    }
    const boosted = racer.boostTime > 0;
    const draftBoost = isPlayer && racer.draftTime > 0;
    const level = AI_LEVELS[this.difficulty] || AI_LEVELS.normal;
    const maxSpeed = isPlayer ? NORMAL_SPEED : level.speed + (racer._index % 4) * level.variation;
    const slopeSpeed = clamp(-grade * 36, -6, 6);
    // 발동한 부스터는 가속키를 놓아도 자체 추진한다. 브레이크가 추진보다 우선한다.
    const effectiveThrottle = boosted ? 1 : input.throttle;
    const targetSlopeSpeed = boosted ? Math.max(0, slopeSpeed) : slopeSpeed;
    const targetSpeed = (boosted ? (isPlayer ? BOOST_SPEED : Math.min(BOOST_SPEED, maxSpeed + 34))
      : draftBoost ? 80 : maxSpeed) + targetSlopeSpeed;
    if (effectiveThrottle > 0 && input.brake < 0.7) {
      const acceleration = boosted ? 65 : draftBoost ? 30 : isPlayer ? 23 : level.acceleration;
      racer.speed = Math.min(Math.max(racer.speed, targetSpeed), racer.speed + Math.max(8, acceleration - grade * 28) * effectiveThrottle * dt);
    } else racer.speed = Math.max(0, racer.speed - (10 + grade * 28) * dt);
    racer.speed = Math.max(0, racer.speed - input.brake * 49 * dt);
    if (racer.speed > targetSpeed) racer.speed = Math.max(targetSpeed, racer.speed - 29 * dt);
    racer.speed = Math.min(122, racer.speed);

    // 일반 달리기는 입력 방향을 바로 따라가고, 손을 떼면 현재 차선에서 앞으로 정렬된다.
    // Shift 드리프트에서만 시선과 실제 이동 방향을 분리해 관성과 역조향을 사용한다.
    const speedFactor = clamp(racer.speed / 42, 0, 1);
    // 고속 부스터에서는 같은 키가 지나치게 큰 횡이동을 만들지 않게 조향폭만 줄인다.
    const runAngle = RUN_STEER_ANGLE * Math.min(1, NORMAL_SPEED / Math.max(1, racer.speed));
    const counter = racer.drift && input.steer * racer.driftDirection < -0.12;
    const recovering = racer.drift && (!input.drift || counter);
    if (racer.drift) racer.driftPhase = recovering ? 'recover' : 'slide';
    const frameTurn = roadTurn * Math.max(0, racer.speed * Math.cos(racer.velocityHeading)) * dt
      / clamp(1 - roadTurn * racer.lateral, 0.65, 1.35);
    if (!racer.drift) {
      const previous = racer.heading;
      const desired = racer.steer * runAngle * speedFactor;
      racer.heading += (desired - racer.heading) * (1 - Math.exp(-RUN_HEADING_RESPONSE * dt));
      racer.heading -= frameTurn;
      racer.yawRate = (racer.heading - previous + frameTurn) / dt;
    } else {
      const wantedYaw = recovering
        ? (racer.steer * runAngle * speedFactor - racer.heading) * (counter ? 20 : 12)
        // 각도가 커질수록 회전력을 줄여 오래 눌러도 옆을 향해 계속 감기지 않는다.
        : racer.steer * DRIFT_TURN_POWER * speedFactor - racer.slipAngle * 0.3 - racer.heading ** 3 * DRIFT_ALIGNMENT;
      racer.yawRate += (wantedYaw - racer.yawRate) * (1 - Math.exp(-(recovering ? 22 : 14) * dt));
      racer.heading += racer.yawRate * dt - frameTurn;
    }
    racer.heading = clamp(racer.heading, -0.78, 0.78);
    racer.velocityHeading -= frameTurn;
    const grip = racer.drift ? recovering ? counter ? 16 : 12 : DRIFT_GRIP : RUN_GRIP;
    racer.velocityHeading += (racer.heading - racer.velocityHeading) * (1 - Math.exp(-grip * dt));
    racer.velocityHeading = clamp(racer.velocityHeading, -1.2, 1.2);
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
      const slidingSpeed = racer.speed * slip;
      // 실제 슬립각과 주행 속도가 커야 충전된다. 정지/벽 비비기/Shift 단독으로 얻을 수 없다.
      const gained = racer.speed > 24 && racer._wallContact === 0 ? Math.max(0, slidingSpeed - 2.5) * 3.15 * dt : 0;
      racer.boostGauge = Math.min(racer.boostItems < MAX_BOOST_ITEMS ? 200 : 100, racer.boostGauge + gained);
      this._storeGauge(racer);
      racer.speed = Math.max(0, racer.speed - (slip * 12 + Math.abs(racer.yawRate) * 1.1) * dt);
      if ((recovering && Math.abs(racer.slipAngle) < 0.065 && racer._driftAge > 0.12) || racer.speed < 15) this._endDrift(racer);
    }
    racer.forwardSpeed = Math.max(0, racer.speed * Math.cos(racer.velocityHeading));
    racer._contactLateralSpeed *= Math.exp(-6 * dt);
    racer.lateralVelocity = racer.speed * Math.sin(racer.velocityHeading) + racer._contactLateralSpeed;
    racer.lateral += racer.lateralVelocity * dt;
    const boundary = this.roadHalfWidth - 0.65;
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
      racer.speed = Math.max(0, racer.speed - 28 * dt);
      racer.forwardSpeed = racer.speed * Math.cos(racer.velocityHeading);
      racer._wallContact = side;
    } else if (Math.abs(racer.lateral) < boundary - 0.3) racer._wallContact = 0;
  }

  _aiControls(racer, dt, curvature) {
    const index = racer._index;
    const level = AI_LEVELS[this.difficulty] || AI_LEVELS.normal;
    const roadTurn = number(this.turnRateAt?.(racer.distance), curvature / 112);
    const previewTurn = number(this.turnRateAt?.(racer.distance + racer.speed * 0.24), roadTurn);
    const physicalGap = other => modulo(other.distance-racer.distance+this.length/2,this.length)-this.length/2;
    const edge = Math.min(Math.abs(previewTurn)>0.01?3.4:5.6,this.roadHalfWidth-2.1);
    const laneLow=-edge, laneHigh=edge;
    // 고정된 난이도별 주행선과 실력만 사용한다. 플레이어와의 순위/거리로 속도를 보정하지 않는다.
    let lane = Math.abs(previewTurn) > 0.006 ? Math.sign(previewTurn)*level.line : (index%2?-0.9:0.9);
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
    const angularSpeed = (roadTurn * 0.5 + previewTurn * 0.5) * racer.speed / clamp(1 - roadTurn * racer.lateral, 0.65, 1.35);
    const wantDrift = Math.abs(previewTurn * racer.speed) > level.drift && racer.speed > 28;
    const desiredVelocity = clamp((lane - racer.lateral) * 0.03-racer._contactLateralSpeed/Math.max(20,racer.speed)*0.7, -0.16, 0.16);
    const desiredHeading = desiredVelocity + angularSpeed / DRIFT_GRIP;
    const runAngle = RUN_STEER_ANGLE * Math.min(1, NORMAL_SPEED / Math.max(1, racer.speed));
    const steer = wantDrift || racer.drift
      ? clamp((angularSpeed + (desiredHeading - racer.heading) * 4.1 + (desiredVelocity - racer.velocityHeading) * 1.5 + racer.heading ** 3 * DRIFT_ALIGNMENT + racer.slipAngle * 0.3) / DRIFT_TURN_POWER, -1, 1)
      : clamp((desiredVelocity + angularSpeed * (1 / RUN_HEADING_RESPONSE + 1 / RUN_GRIP)) / runAngle, -1, 1);
    const cornerSpeed = clamp(level.corner / Math.max(0.001, Math.abs(previewTurn)), 35, 122);
    if (this.time >= racer._aiNextBoost && Math.abs(previewTurn) < level.boostCurve && Math.abs(racer.lateral) < 7.5) {
      if (this._activateBoost(racer, 'ai')) racer._aiNextBoost = this.time + level.boostDelay + index * 0.045;
    }
    return { throttle: 1, brake: racer.speed > cornerSpeed + 3 ? 0.7 : 0, steer, drift: wantDrift && (Math.abs(steer) > 0.12 || racer.drift), boost: false };
  }

  _checkDash(racer, previous) {
    if (racer.distance < 0) return;
    this.dashZones.forEach((zone, index) => {
      const start = modulo(number(zone.start ?? zone.distance), this.length);
      const end = modulo(number(zone.end, start + number(zone.length, 12)), this.length);
      const span = modulo(end - start, this.length);
      const pass = Math.floor((racer.distance - start) / this.length);
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
          this._emit('boost', racer, { source: 'dash', duration });
        }
      }
    });
  }

  _crossLaps(racer, previous, stepStart, dt, finishes) {
    const priorLap = Math.max(0, Math.floor(previous / this.length));
    const nextLap = Math.min(LAPS, Math.floor(racer.distance / this.length));
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
      this._emit('lap', racer, { lap: Math.min(LAPS, completed + 1), completed, lapTime });
      if (completed === LAPS) {
        racer.finished = true;
        racer.finishTime = at;
        racer.distance = this.totalDistance;
        racer.drift = false;
        finishes.push(racer);
      }
    }
    racer.lap = racer.finished ? LAPS : clamp(racer.lapTimes.length + 1, 1, LAPS);
  }

  _collisions(dt, previous = this.racers.map(r => ({distance:r.distance, lateral:r.lateral}))) {
    for (let first = 0; first < this.racers.length; first++) {
      for (let second = first + 1; second < this.racers.length; second++) {
        const a = this.racers[first];
        const b = this.racers[second];
        if (a.finished || b.finished) continue;
        const priorA = previous[first], priorB = previous[second];
        const gap = modulo(priorB.distance - priorA.distance + this.length / 2, this.length) - this.length / 2;
        const x = (priorB.lateral - priorA.lateral) / CONTACT_WIDTH, z = gap / CONTACT_LENGTH;
        const dx = ((b.lateral-priorB.lateral)-(a.lateral-priorA.lateral)) / CONTACT_WIDTH;
        const dz = ((b.distance-priorB.distance)-(a.distance-priorA.distance)) / CONTACT_LENGTH;
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
        const endGap = gap+(b.distance-priorB.distance)-(a.distance-priorA.distance);
        const support = Math.hypot(CONTACT_WIDTH*nx,CONTACT_LENGTH*nz);
        const penetration = Math.max(0,support-(b.lateral-a.lateral)*nx-endGap*nz)+0.0001;
        // 몸이 파고든 거리만 절반씩 되돌린다. 순위나 랩 차이를 보정하는 이동은 없다.
        this._separatePair(a,b,nx,nz,penetration);
      }
    }
  }

  _separatePair(a,b,nx,nz,penetration) {
    const edge=this.roadHalfWidth-0.65;
    const limitA=Math.abs(nx)<1e-8?Infinity:(nx>0?a.lateral+edge:edge-a.lateral)/Math.abs(nx);
    const limitB=Math.abs(nx)<1e-8?Infinity:(nx>0?edge-b.lateral:b.lateral+edge)/Math.abs(nx);
    let moveA=Math.min(penetration/2,Math.max(0,limitA));
    const moveB=Math.min(penetration-moveA,Math.max(0,limitB));
    moveA=Math.min(penetration-moveB,Math.max(0,limitA));
    a.distance-=nz*moveA;b.distance+=nz*moveB;
    a.lateral-=nx*moveA;b.lateral+=nx*moveB;
  }

  _separateCrowd() {
    for(let pass=0;pass<3;pass++)for(let first=0;first<this.racers.length;first++)for(let second=first+1;second<this.racers.length;second++){
      const a=this.racers[first],b=this.racers[second];if(a.finished||b.finished)continue;
      const gap=modulo(b.distance-a.distance+this.length/2,this.length)-this.length/2;
      const x=(b.lateral-a.lateral)/CONTACT_WIDTH,z=gap/CONTACT_LENGTH;
      if(x*x+z*z>=1)continue;
      let nx=x/CONTACT_WIDTH,nz=z/CONTACT_LENGTH;const norm=Math.hypot(nx,nz);
      if(norm>1e-8){nx/=norm;nz/=norm;}else{nx=first%2?1:-1;nz=0;}
      const penetration=Math.hypot(CONTACT_WIDTH*nx,CONTACT_LENGTH*nz)-(b.lateral-a.lateral)*nx-gap*nz+0.0001;
      this._separatePair(a,b,nx,nz,penetration);
    }
  }

  _contactImpulse(racer, lateral, forward) {
    racer.speed=clamp(racer.speed+forward/Math.max(0.4,Math.cos(racer.velocityHeading)),0,122);
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
