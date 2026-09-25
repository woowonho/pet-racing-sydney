const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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
    this._master = master;

    this._musicBus = context.createGain();
    this._musicBus.gain.value = 0;
    this._musicBus.connect(master);
    this._effectsBus = context.createGain();
    this._effectsBus.gain.value = 0.68;
    this._effectsBus.connect(master);

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
    this._timer = globalThis.setInterval(() => this._scheduleMusic(), 70);
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

  update({ speed = 0, boost = false, drifting = false, racing = false, hovering = false } = {}, dt = 0) {
    this._state = { speed, boost, drifting, racing, hovering };
    if (!this.context || this._disposed) return;
    if (Boolean(racing) !== this._racing) {
      this._racing = Boolean(racing);
      if (this._racing) {
        this._musicStep = 0;
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
    const { speed, boost, drifting, racing } = this._state;
    const normalizedSpeed = clamp(Math.abs(Number(speed) || 0) / 430, 0, 1.15);
    const active = Boolean(racing) && !this._hidden;
    this._racing = Boolean(racing);
    // 평상시에는 발구름이 들리고 속도가 붙을수록 넓고 부드러운 바람이 차오른다.
    this._target(this._wind.gain.gain, active ? normalizedSpeed ** 1.5 * 0.064 + (boost ? 0.062 : 0) : 0, 0.14);
    this._target(this._wind.filter.frequency, 550 + normalizedSpeed * 1550 + (boost ? 1000 : 0), 0.1);
    this._target(this._slide.gain.gain, active && drifting ? normalizedSpeed * 0.068 : 0, 0.065);
    this._target(this._slide.filter.frequency, 1000 + normalizedSpeed * 1200, 0.1);
    this._target(this._energy.frequency, 175 + normalizedSpeed * 75, 0.16);
    this._target(this._energyGain.gain, active && boost ? 0.045 : 0, 0.08);
    this._target(this._musicBus.gain, active && !this.muted ? 0.6 : 0, 0.15);
  }

  _scheduleStride() {
    if (!this.context || this.context.state !== 'running') return;
    const { speed, boost, drifting, racing } = this._state;
    const now = this.context.currentTime;
    if (!racing || this.muted || this._hidden || this._state.hovering || boost || drifting || Math.abs(speed) < 22) {
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

  _tone(frequency, when, duration, amplitude, type = 'sine', kind = 'effect', endFrequency = frequency, pan = 0) {
    if (this._disposed || !this.context) return;
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
    if (this._disposed || !this.context) return;
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

  event(name) {
    if (!this.context || this.context.state !== 'running' || this.muted || this._disposed || this._hidden) return;
    const now = this.context.currentTime;
    const minimumGap = name === 'wall' || name === 'contact' ? 0.32 : name === 'boost' ? 0.18 : 0.06;
    if (now - (this._lastEvents.get(name) ?? -Infinity) < minimumGap) return;
    this._lastEvents.set(name, now);
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
      case 'drift-release':
        this._tone(440, at, 0.16, 0.075, 'triangle', 'effect', 880);
        this._tone(880, at + 0.055, 0.25, 0.065, 'sine', 'effect', 1320);
        this._noise(at, 0.18, 0.06, 3200, 'effect', 1000);
        break;
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
      case 'finish':
        this._silenceMusic();
        [523.25, 659.25, 783.99, 1046.5, 987.77, 1046.5].forEach((frequency, index) => this._tone(frequency, at + index * 0.13, index === 5 ? 1.3 : 0.42, 0.115, 'triangle'));
        [261.63, 329.63, 392].forEach(frequency => this._tone(frequency, at + 0.65, 1.45, 0.06, 'sine'));
        break;
      case 'select':
        this._tone(740, at, 0.075, 0.06, 'sine', 'effect', 980);
        break;
      default:
        break;
    }
  }

  _scheduleMusic() {
    if (!this.context || this.context.state !== 'running' || !this._racing || this.muted || this._hidden || this._disposed) return;
    const now = this.context.currentTime;
    if (this._nextMusicTime < now - 0.1) this._nextMusicTime = now + 0.04;
    // 146 BPM의 저음 리듬과 빠른 퍼커션 위에 해안 질주의 멜로디를 얹는다.
    const eighth = 60 / 146 / 2;
    while (this._nextMusicTime < now + 0.17) {
      const step = this._musicStep % 64;
      const bar = Math.floor(step / 16);
      const inBar = step % 16;
      const time = this._nextMusicTime;
      const bassRoots = [36, 31, 33, 29];
      const chords = [[60, 64, 67, 71], [59, 62, 67, 69], [60, 64, 69, 71], [57, 60, 64, 67]];
      const motif = [12, null, 7, 4, null, 7, 11, null, 7, null, 4, 2, null, 4, 7, null];
      const midi = note => 440 * Math.pow(2, (note - 69) / 12);
      if (inBar % 4 === 0 || inBar === 7 || inBar === 14) {
        this._tone(midi(bassRoots[bar]), time, 0.27, 0.105, 'triangle', 'music');
      }
      if (inBar === 0 || inBar === 8) {
        chords[bar].forEach((note, index) => {
          this._tone(midi(note), time + index * 0.012, 1.35, 0.017, 'sine', 'music', midi(note), (index - 1.5) * 0.3);
        });
      }
      if (motif[inBar] !== null) {
        const note = chords[bar][0] + motif[inBar];
        this._tone(midi(note), time, 0.25, inBar % 4 === 0 ? 0.05 : 0.035, 'sine', 'music', midi(note), inBar % 2 ? -0.32 : 0.32);
        // 조용한 지연 음으로 넓은 야외 공간감을 만든다.
        this._tone(midi(note), time + eighth * 1.5, 0.25, 0.01, 'sine', 'music', midi(note), inBar % 2 ? 0.38 : -0.38);
      }
      if (inBar % 2 === 0) this._tone(125, time, 0.16, inBar % 4 === 0 ? 0.16 : 0.105, 'sine', 'music', 43);
      if (inBar % 8 === 4) {
        this._noise(time, 0.12, 0.055, 2000, 'music');
        this._tone(175, time, 0.065, 0.035, 'triangle', 'music', 115);
      }
      this._noise(time, inBar === 15 ? 0.10 : 0.035, inBar % 2 ? 0.032 : 0.014, 7600, 'music');
      this._musicStep += 1;
      this._nextMusicTime += eighth;
    }
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
