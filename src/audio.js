const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const MUSIC_BPM = 160;
const SIXTEENTH = 60 / MUSIC_BPM / 4;
const MAX_MUSIC_VOICES = 48;
const MAX_VOICES = 72;
const MUSIC_VOLUME = 1.2;
const midi = note => 440 * 2 ** ((note - 69) / 12);

// 같은 박자 위에서 드럼·베이스·멜로디의 역할을 바꾼다. 원작 음원의 샘플은 쓰지 않는다.
const GROOVES = {
  'harbour-hop': { kicks:[[0,6,10],[0,7,10,15]], snares:[4,12], bass:[0,6,10,14], notes:[1,5,10,14], swing:.13, wave:'triangle', cutoff:1550, register:-12 },
  'desert-trap': { kicks:[[0,6,11],[0,3,10,14]], snares:[8], bass:[0,6,11], notes:[2,7,10,14], swing:.04, wave:'sine', cutoff:2600, register:0, sub:true, rolls:true },
  'factory-breaks': { kicks:[[0,3,6,10],[0,7,8,14]], snares:[4,12], bass:[0,3,6,10,14], notes:[0,3,6,11,14], swing:0, wave:'sawtooth', cutoff:2100, register:-12, breaks:true },
  'ice-breaks': { kicks:[[0,6,10],[0,7,8,14]], snares:[4,12], bass:[0,6,10], notes:[2,6,9,14], swing:0, wave:'triangle', cutoff:3400, register:0, breaks:true, air:true },
  'sky-breaks': { kicks:[[0,6,8,14],[0,3,10,15]], snares:[4,12], bass:[0,6,8,14], notes:[0,3,6,10,14], swing:0, wave:'sawtooth', cutoff:2800, register:0, breaks:true, air:true },
  'reef-flow': { kicks:[[0,6,10],[0,7,8,14]], snares:[4,12], bass:[0,6,10,14], notes:[1,6,10,13], swing:.07, wave:'triangle', cutoff:2400, register:0, air:true },
  'mach-half': { kicks:[[0,6,11],[0,3,10,14]], snares:[8], bass:[0,6,11,14], notes:[3,10,14], swing:0, wave:'sawtooth', cutoff:950, register:-12, sub:true, rolls:true },
};

// 외부 음원 없이 만드는 발구름, 바람, 부스터 효과음과 해안 레이싱 음악.
export class RaceAudio {
  constructor() {
    this.muted = false;
    this.context = null;
    this._disposed = false;
    this._racing = false;
    this._hidden = typeof document !== 'undefined' && document.hidden;
    this._musicStep = 0;
    this._nextMusicTime = 0;
    this._nextStrideTime = 0;
    this._strideStep = 0;
    this._musicSection = 'intro';
    this._musicStyle = null;
    this._styleTransitionBar = -1;
    this._musicIntensity = 0;
    this._musicDuckUntil = 0;
    this._lastEvents = new Map();
    this._voices = new Set();
    this._state = { speed: 0, boost: false, drifting: false, racing: false };
    this._visibilityHandler = () => {
      this._hidden = document.hidden;
      if (!this.context || this._disposed) return;
      if (this._hidden) {
        this._silenceMusic();
        this.context.suspend().catch(() => {});
      } else {
        this._nextMusicTime = this.context.currentTime + 0.08;
        this._nextStrideTime = this.context.currentTime + 0.08;
        this.context.resume().then(() => this._applyState()).catch(() => {});
      }
    };
    if (typeof document !== 'undefined') {
      document.addEventListener('visibilitychange', this._visibilityHandler);
    }
  }

  // 브라우저의 오디오 허용 규칙에 맞춰 클릭/키 입력 처리 안에서 호출한다.
  async unlock() {
    if (this._disposed) return false;
    const AudioContextClass = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AudioContextClass) return false;
    try {
      if (!this.context) this._createGraph(new AudioContextClass());
      if (this.context.state !== 'running') await this.context.resume();
      this._nextMusicTime = Math.max(this._nextMusicTime, this.context.currentTime + 0.04);
      this._applyState();
      return this.context.state === 'running';
    } catch {
      // 오디오를 허용하지 않는 환경에서도 게임 진행은 유지한다.
      return false;
    }
  }

  _createGraph(context) {
    this.context = context;
    const master = context.createGain();
    master.gain.value = this.muted ? 0 : 0.72;
    const limiter = context.createDynamicsCompressor();
    limiter.threshold.value = -13;
    limiter.knee.value = 16;
    limiter.ratio.value = 5;
    limiter.attack.value = 0.005;
    limiter.release.value = 0.19;
    master.connect(limiter).connect(context.destination);
    this._recordOutput = limiter;
    this._master = master;

    this._musicBus = context.createGain();
    this._musicBus.gain.value = 0;
    this._musicTransitionGain=context.createGain();
    this._musicTransitionGain.gain.value=1;
    this._musicBus.connect(this._musicTransitionGain).connect(master);
    // 악기만 짧게 되돌리는 음악 딜레이. 효과음 반사음과 분리해 드리프트 판정을 가리지 않는다.
    if (context.createDelay) {
      this._musicDelay = context.createDelay(0.4);
      this._musicDelay.delayTime.value = SIXTEENTH * 3;
      this._musicEcho = context.createGain();
      this._musicEcho.gain.value = 0.07;
      this._musicTransitionGain.connect(this._musicDelay).connect(this._musicEcho).connect(master);
    }
    this._effectsBus = context.createGain();
    this._effectsBus.gain.value = 0.68;
    this._effectsBus.connect(master);
    // 터널에서만 짧은 반사음을 더해 야외와 실내의 속도감을 구분한다.
    if (context.createDelay) {
      this._tunnelDelay = context.createDelay(0.3);
      this._tunnelDelay.delayTime.value = 0.085;
      this._tunnelEcho = context.createGain();
      this._tunnelEcho.gain.value = 0;
      this._effectsBus.connect(this._tunnelDelay).connect(this._tunnelEcho).connect(master);
    }

    this._noiseBuffer = context.createBuffer(1, context.sampleRate * 2, context.sampleRate);
    const noise = this._noiseBuffer.getChannelData(0);
    let seed = 4817;
    let smoothed = 0;
    for (let index = 0; index < noise.length; index++) {
      seed = (seed * 16807) % 2147483647;
      smoothed = smoothed * 0.12 + ((seed / 2147483647) * 2 - 1) * 0.88;
      noise[index] = smoothed;
    }
    this._wind = this._continuousNoise('bandpass', 850, 0.48);
    this._slide = this._continuousNoise('lowpass', 2000, 0.55);
    this._energyGain = context.createGain();
    this._energyGain.gain.value = 0;
    this._energyGain.connect(this._effectsBus);
    this._energy = this._continuousOscillator('sine', 195, 0.34, this._energyGain);
    if (context.startRendering === undefined) this._timer = globalThis.setInterval(() => this._scheduleMusic(), 70);
  }

  capture() {
    if (this.context?.state !== 'running' || !this.context.createMediaStreamDestination || !this._recordOutput) return null;
    const destination = this.context.createMediaStreamDestination();
    this._recordOutput.connect(destination);
    return {stream: destination.stream, release: () => {
      try { this._recordOutput.disconnect(destination); } catch { /* 이미 해제된 연결 */ }
      destination.stream.getTracks().forEach(track => track.stop());
    }};
  }

  _continuousNoise(type, frequency, resonance) {
    const source = this.context.createBufferSource();
    source.buffer = this._noiseBuffer;
    source.loop = true;
    const filter = this.context.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = resonance;
    const gain = this.context.createGain();
    gain.gain.value = 0;
    source.connect(filter).connect(gain).connect(this._effectsBus);
    source.start();
    return { source, filter, gain };
  }

  _continuousOscillator(type, frequency, gainValue, destination) {
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.value = frequency;
    gain.gain.value = gainValue;
    oscillator.connect(gain).connect(destination);
    oscillator.start();
    return oscillator;
  }

  setMuted(muted) {
    this.muted = Boolean(muted);
    if (!this.context || this._disposed) return;
    this._target(this._master.gain, this.muted ? 0 : 0.72, 0.025);
    if (this.muted) this._silenceMusic();
    else this._nextMusicTime = this.context.currentTime + 0.05;
    this._applyState();
  }

  update({ speed = 0, boost = false, drifting = false, racing = false, hovering = false, airborne = false, tunnel = false, driftQuality = 0, slipAngle = 0,
    progress = 0, featureKind = '', regionKind = '', rivalGap = Infinity, intensity = null } = {}, dt = 0) {
    this._state = { speed, boost, drifting, racing, hovering, airborne, tunnel:tunnel||featureKind==='tunnel', driftQuality, slipAngle,
      progress:clamp(Number(progress)||0,0,1),featureKind,regionKind:String(regionKind||'').toLowerCase(),rivalGap:Number.isFinite(rivalGap)?Math.abs(rivalGap):Infinity,intensity };
    if (!this.context || this._disposed) return;
    if (Boolean(racing) !== this._racing) {
      this._racing = Boolean(racing);
      if (this._racing) {
        this._nextMusicTime = this.context.currentTime + 0.06;
        this._nextStrideTime = this.context.currentTime + 0.06;
        this._strideStep = 0;
      } else {
        this._silenceMusic();
      }
    }
    this._applyState();
    this._scheduleStride();
  }

  _applyState() {
    if (!this.context || this._disposed) return;
    const { speed, boost, drifting, racing, airborne, tunnel, driftQuality, slipAngle } = this._state;
    const normalizedSpeed = clamp(Math.abs(Number(speed) || 0) / 430, 0, 1.15);
    const active = Boolean(racing) && !this._hidden;
    this._racing = Boolean(racing);
    // 평상시에는 발구름이 들리고 속도가 붙을수록 넓고 부드러운 바람이 차오른다.
    this._target(this._wind.gain.gain, active ? normalizedSpeed ** 1.5 * 0.064 + (boost ? 0.062 : 0) + (airborne ? .03 : 0) : 0, 0.14);
    this._target(this._wind.filter.frequency, 550 + normalizedSpeed * 1550 + (boost ? 1000 : 0), 0.1);
    const slip = clamp(Math.abs(slipAngle || 0) / .35, 0, 1);
    this._target(this._slide.gain.gain, active && drifting && !airborne ? normalizedSpeed * (.023 + slip * .065) : 0, 0.035);
    this._target(this._slide.filter.frequency, 760 + normalizedSpeed * 700 + slip * 1100 + (driftQuality || 0) * 350, 0.045);
    if (this._tunnelEcho) this._target(this._tunnelEcho.gain, active && tunnel ? .21 : 0, .16);
    this._target(this._energy.frequency, 175 + normalizedSpeed * 75, 0.16);
    this._target(this._energyGain.gain, active && boost ? 0.045 : 0, 0.08);
    const closeRace = this._state.rivalGap < 35 ? 1-this._state.rivalGap/35 : 0;
    const requestedIntensity = Number.isFinite(this._state.intensity) ? this._state.intensity
      : .38 + normalizedSpeed*.27 + (boost?.16:0) + closeRace*.12 + this._state.progress*.16;
    this._musicIntensity += (clamp(requestedIntensity,0,1)-this._musicIntensity)*.06;
    const duck = this.context.currentTime < this._musicDuckUntil ? .38 : 1;
    this._target(this._musicBus.gain, active && !this.muted ? MUSIC_VOLUME*duck : 0, 0.08);
    if(this._musicEcho)this._target(this._musicEcho.gain,active&&tunnel?.14:.065,.25);
  }

  _scheduleStride() {
    if (!this.context || this.context.state !== 'running') return;
    const { speed, boost, drifting, racing } = this._state;
    const now = this.context.currentTime;
    if (!racing || this.muted || this._hidden || this._state.hovering || this._state.airborne || boost || drifting || Math.abs(speed) < 22) {
      this._nextStrideTime = now + 0.08;
      return;
    }
    const pace = clamp(Math.abs(speed) / 360, 0, 1);
    const interval = 0.35 - pace * 0.19;
    // 프레임이 밀려도 지난 발소리를 몰아서 재생하지 않는다.
    if (this._nextStrideTime < now - 0.025) this._nextStrideTime = now + 0.006;
    if (this._nextStrideTime > now + 0.045) return;
    const when = Math.max(now + 0.003, this._nextStrideTime);
    const side = this._strideStep++ % 2 ? -1 : 1;
    this._tone(115 + side * 8, when, 0.095, 0.029 + pace * 0.017, 'sine', 'stride', 45, side * 0.18);
    this._noise(when + 0.008, 0.075, 0.026 + pace * 0.017, 740 + side * 90, 'stride', 320);
    this._nextStrideTime = when + interval;
  }

  _target(parameter, value, smoothing = 0.04) {
    parameter.setTargetAtTime(value, this.context.currentTime, smoothing);
  }

  _trackVoice(source, nodes, kind) {
    const voice = { source, nodes, kind };
    this._voices.add(voice);
    source.onended = () => {
      this._voices.delete(voice);
      source.disconnect();
      for (const node of nodes) node.disconnect();
    };
  }

  _canPlayVoice(kind) {
    if(this._disposed||!this.context)return false;
    const music=[...this._voices].filter(voice=>voice.kind==='music');
    if(kind==='music')return music.length<MAX_MUSIC_VOICES&&this._voices.size<MAX_VOICES;
    if(this._voices.size<MAX_VOICES)return true;
    const quiet=music[0];
    if(!quiet)return false;
    try{quiet.source.stop(this.context.currentTime+.01);}catch{/* 이미 종료된 음원 */}
    this._voices.delete(quiet);
    return true;
  }

  _tone(frequency, when, duration, amplitude, type = 'sine', kind = 'effect', endFrequency = frequency, pan = 0) {
    if (!this._canPlayVoice(kind)) return;
    const context = this.context;
    const oscillator = context.createOscillator();
    const envelope = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(Math.max(20, frequency), when);
    if (endFrequency !== frequency) {
      oscillator.frequency.exponentialRampToValueAtTime(Math.max(20, endFrequency), when + duration);
    }
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(amplitude, when + Math.min(0.012, duration * 0.1));
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    oscillator.connect(envelope);
    const nodes = [envelope];
    const bus = kind === 'music' ? this._musicBus : this._effectsBus;
    if (context.createStereoPanner && pan !== 0) {
      const panner = context.createStereoPanner();
      panner.pan.value = pan;
      envelope.connect(panner).connect(bus);
      nodes.push(panner);
    } else envelope.connect(bus);
    this._trackVoice(oscillator, nodes, kind);
    oscillator.start(when);
    oscillator.stop(when + duration + 0.02);
  }

  _noise(when, duration, amplitude, frequency, kind = 'effect', endFrequency = frequency) {
    if (!this._canPlayVoice(kind)) return;
    const source = this.context.createBufferSource();
    source.buffer = this._noiseBuffer;
    const filter = this.context.createBiquadFilter();
    filter.type = 'bandpass';
    filter.Q.value = 0.72;
    filter.frequency.setValueAtTime(frequency, when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(30, endFrequency), when + duration);
    const envelope = this.context.createGain();
    envelope.gain.setValueAtTime(0, when);
    envelope.gain.linearRampToValueAtTime(amplitude, when + Math.min(0.012, duration * 0.15));
    envelope.gain.exponentialRampToValueAtTime(0.0001, when + duration);
    source.connect(filter).connect(envelope).connect(kind === 'music' ? this._musicBus : this._effectsBus);
    this._trackVoice(source, [filter, envelope], kind);
    source.start(when, (when * 0.317) % 0.9);
    source.stop(when + duration + 0.02);
  }

  _synth(note, when, duration, amplitude, cutoff = 1800, pan = 0, type = 'sawtooth') {
    if(!this._canPlayVoice('music'))return;
    const context=this.context,source=context.createOscillator(),filter=context.createBiquadFilter(),gain=context.createGain();
    source.type=type;source.frequency.setValueAtTime(midi(note),when);
    filter.type='lowpass';filter.Q.value=.8;
    filter.frequency.setValueAtTime(cutoff,when);
    filter.frequency.exponentialRampToValueAtTime(Math.max(180,cutoff*.24),when+duration);
    gain.gain.setValueAtTime(0,when);gain.gain.linearRampToValueAtTime(amplitude,when+.007);
    gain.gain.exponentialRampToValueAtTime(.0001,when+duration);
    source.connect(filter).connect(gain);
    const nodes=[filter,gain];
    if(context.createStereoPanner&&pan){const panner=context.createStereoPanner();panner.pan.value=pan;gain.connect(panner).connect(this._musicBus);nodes.push(panner);}
    else gain.connect(this._musicBus);
    this._trackVoice(source,nodes,'music');source.start(when);source.stop(when+duration+.02);
  }

  beginRace() {
    this._musicStep=0;this._musicSection='intro';this._musicIntensity=0;this._strideStep=0;
    this._arrangement=null;this._musicStyle=null;this._styleTransitionBar=-1;this._machTransition=false;
    if(this._musicTransitionGain){this._musicTransitionGain.gain.cancelScheduledValues?.(this.context.currentTime);this._musicTransitionGain.gain.setValueAtTime(1,this.context.currentTime);}
    if(this.context){this._silenceMusic();this._nextMusicTime=this.context.currentTime+.12;}
  }

  event(name, detail = {}) {
    if(name==='go')this.beginRace();
    if (!this.context || this.context.state !== 'running' || this.muted || this._disposed || this._hidden) return;
    const now = this.context.currentTime;
    const minimumGap = name === 'wall' || name === 'contact' ? 0.32 : name === 'boost' ? 0.18 : 0.06;
    if (now - (this._lastEvents.get(name) ?? -Infinity) < minimumGap) return;
    this._lastEvents.set(name, now);
    if(['boost','wall','contact','checkpoint','finish'].includes(name)) {
      this._musicDuckUntil=now+(name==='finish'?2:.38);
      this._target(this._musicBus.gain,this._racing?MUSIC_VOLUME*.38:0,.015);
    }
    const at = now + 0.005;
    switch (name) {
      case 'count':
        this._tone(660, at, 0.14, 0.16, 'sine');
        this._tone(1320, at, 0.08, 0.034, 'sine');
        break;
      case 'go':
        [659.25, 830.61, 987.77].forEach((frequency, index) => this._tone(frequency, at + index * 0.065, 0.4, 0.115, 'triangle'));
        this._noise(at, 0.26, 0.1, 1700, 'effect', 5200);
        break;
      case 'boost':
        this._tone(110, at, 0.4, 0.11, 'triangle', 'effect', 560);
        this._tone(220, at + 0.025, 0.36, 0.04, 'sine', 'effect', 1100);
        this._noise(at, 0.54, 0.2, 700, 'effect', 4200);
        break;
      case 'drift-start':
        this._noise(at, .075, .055, 1700, 'effect', 2800);
        break;
      case 'drift-link':
        this._noise(at, .12, .07, 2600, 'effect', 1000);
        this._tone(660, at, .11, .035, 'sine', 'effect', 830);
        break;
      case 'drift-charge':
        [880, 1174.66, 1567.98].forEach((frequency,index)=>this._tone(frequency,at+index*.045,.2,.065,'sine'));
        break;
      case 'drift-release':
        this._noise(at, .14, .04, 2700, 'effect', 800);
        if ((detail.quality || 0) > .55) {
          this._tone(660, at, .13, .045, 'sine', 'effect', 990);
          this._tone(990, at + .045, .18, .035, 'sine', 'effect', 1320);
        }
        break;
      case 'jump':
        this._noise(at, .32, .11, 600, 'effect', 3000);
        this._tone(175, at, .21, .055, 'sine', 'effect', 420);
        break;
      case 'land': {
        const power = clamp((Number(detail.impact) || 8) / 15, .35, 1);
        this._tone(100, at, .19, .14 * power, 'sine', 'effect', 35);
        this._noise(at, .19, .14 * power, 800, 'effect', 170);
        break;
      }
      case 'wall':
        this._noise(at, 0.16, 0.18, 450, 'effect', 140);
        this._tone(100, at, 0.19, 0.14, 'triangle', 'effect', 30);
        break;
      case 'contact':
        this._noise(at, 0.095, 0.14, 680, 'effect', 230);
        this._tone(155, at, 0.12, 0.115, 'triangle', 'effect', 65);
        break;
      case 'lap':
        [523.25, 659.25, 783.99, 1046.5].forEach((frequency, index) => this._tone(frequency, at + index * 0.07, 0.32, 0.095, 'sine'));
        break;
      case 'checkpoint':
        [73,80,85].forEach((note,index)=>this._tone(midi(note),at+index*SIXTEENTH,.23,.082,'triangle'));
        this._noise(at,.1,.04,6400,'effect',2800);
        break;
      case 'finish':
        this._silenceMusic();
        [73,76,80,85,83,85].forEach((note,index)=>this._tone(midi(note),at+index*SIXTEENTH*2,index===5?1.3:.35,.095,'triangle'));
        [49,56,61,68].forEach((note,index)=>this._tone(midi(note),at+SIXTEENTH*8,1.6,.04,'sine','effect',midi(note),(index-1.5)*.3));
        break;
      case 'select':
        this._tone(740, at, 0.075, 0.06, 'sine', 'effect', 980);
        break;
      default:
        break;
    }
  }

  _selectArrangement(step) {
    const bar=Math.floor(step/16),phrase=bar%64;
    const finale=this._state.progress>=.8;
    const section=finale?'climax':this._state.tunnel?'tunnel':bar<8?'intro':phrase>=24&&phrase<32?'build':phrase>=32&&phrase<48?'drop':phrase>=48&&phrase<56?'bridge':'drive';
    const region=this._state.regionKind||'';
    const style=this._state.featureKind==='dash'?'mach-half':/factory|red-cliff/.test(region)?'factory-breaks'
      :/ice|snow/.test(region)?'ice-breaks':/desert|sand/.test(region)?'desert-trap'
      :/sky|space/.test(region)?'sky-breaks':/reef|aqua/.test(region)?'reef-flow':'harbour-hop';
    return {bar,phrase,section,style,full:!['intro','bridge','build'].includes(section),intensity:this._musicIntensity};
  }

  _scheduleMusic() {
    if (!this.context || this.context.state !== 'running' || !this._racing || this.muted || this._hidden || this._disposed) return;
    const now=this.context.currentTime;
    if(this._nextMusicTime<now-.1)this._nextMusicTime=now+.04;
    // 160 BPM은 끝까지 고정한다. 속도·순위는 편곡에만 반영해 주행 중 박자가 흔들리지 않는다.
    let scheduled=0;
    while(this._nextMusicTime<now+.17&&scheduled++<4) {
      this._musicTick(this._musicStep,this._nextMusicTime);
      this._musicStep++;
      this._nextMusicTime+=SIXTEENTH;
    }
  }

  _musicTick(step,time) {
    const beat=step%16;
    if(beat===0||!this._arrangement) {
      const next=this._selectArrangement(step);
      if(this._musicStyle!==next.style) {
        this._styleTransitionBar=next.bar;
        this._machTransition=this._musicStyle!==null&&(next.style==='mach-half'||this._musicStyle==='mach-half');
        if(this._machTransition&&this._musicTransitionGain){
          // 앞 마디의 패드·808 잔향도 함께 내려 실제로 쉼이 들리게 한다.
          const gain=this._musicTransitionGain.gain;
          gain.setValueAtTime(.08,time);gain.setValueAtTime(.08,time+SIXTEENTH*3);
          gain.linearRampToValueAtTime(1,time+SIXTEENTH*4);
        }
        this._musicStyle=next.style;
      }
      this._arrangement=next;
    }
    const {bar,phrase,section,style,full,intensity}=this._arrangement;
    this._musicSection=section;
    const groove=GROOVES[style],transition=this._styleTransitionBar===bar;
    const harmony=Math.floor(bar/2)%8,variation=Math.floor(bar/8)%4;
    const roots=[37,33,40,35,37,44,33,35];
    const chords=[[61,64,68,71],[57,61,64,68],[64,68,71,75],[59,63,66,73],[61,64,68,75],[56,61,64,68],[57,61,64,71],[59,63,66,73]];
    const chord=chords[harmony],root=roots[harmony];
    const intro=section==='intro',bridge=section==='bridge',build=section==='build';
    const drop=section==='drop'||section==='tunnel'||section==='climax'||style==='mach-half';
    const energy=(drop?1:full?.86:build?.7:.52)*(.82+intensity*.18);
    // 마하 진입·탈출에서는 한 박만 비워 공기 소리를 드러내고 다음 박의 킥으로 다시 붙인다.
    // 지역 전환은 마디 경계에서만 일어나 프레임 속도나 경계 흔들림으로 박자가 깨지지 않는다.
    if(transition&&this._machTransition&&beat<4) {
      if(beat===0)this._noise(time,.32,.026,style==='mach-half'?3800:1000,'music',style==='mach-half'?650:6200);
      return;
    }
    const hit=time+(beat%2?SIXTEENTH*groove.swing:0);
    const motif=[
      [12,null,7,null,9,7,null,4,7,null,4,null,2,null,4,7],
      [7,null,12,11,null,7,4,null,7,9,null,12,null,11,7,null],
      [4,7,null,12,null,11,7,null,9,null,7,4,null,2,4,null],
      [12,null,11,7,9,null,7,null,4,7,9,null,12,11,7,null],
    ][variation];
    // 두 마디마다 화성을 바꾸고 8마디마다 멜로디를 교대해 긴 마라톤에서도 네 마디를 반복하지 않는다.
    if(beat===0&&(bar%2===0||bridge))chord.forEach((note,index)=>{
      this._tone(midi(note-12),time+index*.012,bridge?1.4:1.65,intro?.018:groove.air?.014:.01,'sine','music',midi(note-12),(index-1.5)*.34);
    });
    const reentry=transition&&this._machTransition&&beat===4;
    if(!intro||bar>=4||style==='mach-half') {
      if((groove.bass.includes(beat)||reentry)&&(!bridge||beat%4===0)&&(!build||beat<12)) {
        const note=root+(beat===14&&bar%2?7:0),duration=groove.sub?.43:groove.breaks?.18:.28;
        this._synth(note,hit,duration,groove.sub?.039*energy:.065*energy,groove.sub?480:drop?880:620,0,'triangle');
        // 808 저음은 킥과 떨어진 엇박에서만 짧게 미끄러져 속도감과 무게를 함께 만든다.
        const end=midi(note),start=groove.sub&&beat!==0?midi(note+(beat===14?7:2)):end;
        this._tone(start,hit,duration,groove.sub?.105*energy:.065*energy,'sine','music',end);
      }
    }
    const melodyActive=bar>=4&&(!build||phrase<30)&&(!bridge||beat%4===0);
    if(melodyActive&&groove.notes.includes(beat)&&(full||beat%2===0||groove.sub)) {
      const note=chord[0]+(motif[beat]??motif[(beat+1)%16]??7)+groove.register;
      this._synth(note,hit,groove.air?.29:.13,.028*energy,groove.cutoff,beat%2?-.27:.27,groove.wave);
      if(section==='climax'&&beat%4===0)this._tone(midi(note+12),time,.23,.009,'sine','music',midi(note+12),-.4);
      if(groove.air&&beat%4===2)this._tone(midi(note+12),hit+SIXTEENTH*3,.24,.009,'sine','music',midi(note+12),-.36);
    }
    if(drop&&groove.breaks&&beat%4===2) {
      const stab=chord[(beat/2+variation)%4]+(section==='climax'?12:0);
      this._synth(stab,time,.1,.021,1800,beat%8<4?-.5:.5,'sawtooth');
    }
    // 항만은 스윙 힙합, 사막은 하프타임 트랩, 공장·설산은 끊어 치는 브레이크비트다.
    const kicks=groove.kicks[bar%2];
    if(reentry||((intro||bridge)&&style!=='mach-half'?beat===0||beat===8:!build&&kicks.includes(beat))) {
      this._tone(groove.sub?132:154,hit,.19,.23*energy,'sine','music',groove.sub?39:43);
      this._noise(hit,.025,.021*energy,4500,'music',900);
    }
    if(groove.snares.includes(beat)) {
      this._noise(hit,.13,.09*energy,2150,'music',3200);
      this._tone(185,hit,.1,.075*energy,'triangle','music',125);
      if(groove.sub)this._noise(hit+.017,.065,.034*energy,3200,'music',1900);
    }
    if(full&&groove.breaks&&[7,11,15].includes(beat)&&bar%2===1)this._noise(hit,.043,.023,2200,'music');
    if(!intro||beat%2===0) {
      const open=drop&&(beat===3||beat===11);
      this._noise(hit,open?.1:.031,(beat%2?.016:.012)*energy,open?6300:7900,'music',open?7800:7900);
      if(groove.rolls&&full&&[7,15].includes(beat))for(const fraction of [1/3,2/3])this._noise(hit+SIXTEENTH*fraction,.018,.009*energy,8400,'music',6800);
    }
    // 빌드는 스네어 간격만 촘촘해진다. 박자와 진행 시간은 그대로다.
    if(build&&(phrase<28?beat%4===0:phrase<30?beat%2===0:true))this._noise(time,.055,.025+(phrase-24)*.004,1400+(phrase-24)*360,'music',5000);
    if((bar%8===7||build)&&beat>=14)this._tone(midi(root+24+(beat-14)*3),time,.09,.032,'triangle','music');
    if(beat===0&&(bar%8===0||transition||section==='tunnel'&&bar%4===0))this._noise(time,.45,.036,6200,'music',2800);
  }

  _silenceMusic() {
    if (!this.context) return;
    this._target(this._musicBus.gain, 0, 0.045);
    for (const voice of this._voices) {
      if (voice.kind !== 'music') continue;
      try { voice.source.stop(this.context.currentTime + 0.07); } catch { /* 이미 종료된 음원은 건너뛴다. */ }
    }
    this._nextMusicTime = this.context.currentTime + 0.08;
  }

  dispose() {
    if (this._disposed) return;
    this._disposed = true;
    globalThis.clearInterval(this._timer);
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', this._visibilityHandler);
    }
    if (!this.context) return;
    for (const voice of this._voices) {
      try { voice.source.stop(); } catch { /* 이미 종료된 음원은 건너뛴다. */ }
    }
    for (const source of [this._energy, this._wind?.source, this._slide?.source]) {
      try { source?.stop(); } catch { /* 중복 종료를 허용한다. */ }
    }
    this.context.close().catch(() => {});
    this._voices.clear();
  }
}
