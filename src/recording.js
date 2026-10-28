// 게임 화면만 캡처한다. 마이크·카메라·서버 업로드는 사용하지 않는다.
export const RECORDING_LIMIT_SECONDS = 720;
export const RECORDING_LIMIT_BYTES = 240 * 1024 * 1024;
export function recordingFormats(Recorder = globalThis.MediaRecorder) {
  if (!Recorder?.isTypeSupported) return [];
  return ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/webm;codecs=vp8,opus', 'video/mp4', 'video/webm']
    .filter(type => Recorder.isTypeSupported(type));
}

export class RaceRecording {
  constructor({onChange = () => {}, onComplete = () => {}, onError = () => {}} = {}) {
    Object.assign(this, {onChange, onComplete, onError, state: 'idle', clip: null});
  }
  get supported() { return Boolean(globalThis.HTMLCanvasElement?.prototype.captureStream && recordingFormats().length); }
  get active() { return this.state === 'recording' || this.state === 'stopping'; }
  start(audioCapture = null) {
    if (this.active) { audioCapture?.release(); return false; }
    this.audioCapture = audioCapture;
    try {
      if (!this.supported) throw new Error('이 브라우저는 게임 녹화를 지원하지 않아요. 휴대폰의 화면 기록 기능을 이용해 주세요.');
      this.canvas = document.createElement('canvas');
      this.canvas.width = 1280; this.canvas.height = 720;
      this.context = this.canvas.getContext('2d', {alpha: false});
      if (!this.context) throw new Error('영상 화면을 준비하지 못했어요.');
      this.stream = this.canvas.captureStream(30);
      for (const track of audioCapture?.stream.getAudioTracks() || []) this.stream.addTrack(track);
      this.chunks = []; this.bytes = 0; this.reason = ''; this.error = null; this.lastFrame = -Infinity;
      this.startedAt = performance.now();
      for (const mimeType of recordingFormats()) {
        try {
          const recorder = new MediaRecorder(this.stream, {mimeType, videoBitsPerSecond: 2_200_000, audioBitsPerSecond: 128_000});
          recorder.ondataavailable = event => {
            if (event.data?.size) {
              this.chunks.push(event.data); this.bytes += event.data.size;
              if (this.bytes >= RECORDING_LIMIT_BYTES) this.stop('영상 용량 한도에 도달해 녹화를 마쳤어요.');
            }
          };
          recorder.onerror = () => { this.error = '녹화 중 오류가 발생했어요. 저장 가능한 부분을 확인해 주세요.'; this.stop(this.error); };
          recorder.onstop = () => this.finish();
          recorder.start(1000); this.recorder = recorder; break;
        } catch { /* 실제 인코더가 시작하지 못하면 다음 지원 형식으로 재시도한다. */ }
      }
      if (!this.recorder) throw new Error('영상 녹화를 시작하지 못했어요. 다른 브라우저나 기기의 화면 기록을 이용해 주세요.');
      this.state = 'recording';
      this.timer = setTimeout(() => this.stop('12분에 도달해 녹화를 마쳤어요.'), RECORDING_LIMIT_SECONDS * 1000);
      this.onChange(); return true;
    } catch (error) {
      this.cleanup(); this.state = 'idle'; this.onChange(); this.onError(error.message); return false;
    }
  }
  stop(reason = '녹화를 마쳤어요.') {
    if (this.state !== 'recording') return;
    this.reason = reason; this.duration = (performance.now() - this.startedAt) / 1000;
    this.state = 'stopping'; clearTimeout(this.timer); this.onChange();
    // 오류 시에도 브라우저가 마지막 dataavailable 뒤에 stop을 보내므로 그 순서를 보존한다.
    if (this.recorder.state !== 'inactive') { try { this.recorder.stop(); } catch { this.finish(); } }
  }
  finish() {
    if (!this.recorder) return;
    const type = this.recorder.mimeType || this.chunks[0]?.type || 'video/webm';
    const blob = new Blob(this.chunks, {type});
    const reason = this.reason, duration = this.duration || (performance.now() - this.startedAt) / 1000;
    this.cleanup(); this.state = 'idle';
    if (blob.size) {
      if (this.clip) URL.revokeObjectURL(this.clip.url);
      const extension = type.includes('mp4') ? 'mp4' : 'webm';
      const name = `codexpetracing-${new Date().toISOString().replace(/[:.]/g, '-')}.${extension}`;
      this.clip = {blob, url: URL.createObjectURL(blob), name, duration, reason};
      this.onChange(); this.onComplete(this.clip);
    } else { this.onChange(); this.onError('저장할 영상이 없어요. 잠시 주행한 뒤 다시 녹화해 주세요.'); }
  }
  cleanup() {
    clearTimeout(this.timer);
    if (this.recorder) this.recorder.onstop = this.recorder.ondataavailable = this.recorder.onerror = null;
    this.stream?.getTracks().forEach(track => track.stop());
    this.audioCapture?.release();
    this.recorder = this.stream = this.audioCapture = this.canvas = this.context = null;
    this.chunks = [];
  }
  draw(source, info, now) {
    if (this.state !== 'recording' || now - this.lastFrame < 1000 / 30) return;
    this.lastFrame = now;
    try {
      const c = this.context, w = 1280, h = 720;
      c.fillStyle = '#081d29'; c.fillRect(0, 0, w, h);
      const scale = Math.min(w / source.width, h / source.height);
      c.drawImage(source, (w - source.width * scale) / 2, (h - source.height * scale) / 2, source.width * scale, source.height * scale);
      c.fillStyle = '#071d30cf'; c.fillRect(0, 0, w, 66); c.fillRect(0, h - 72, w, 72);
      c.font = 'bold 24px sans-serif'; c.fillStyle = '#a4f9ec'; c.textAlign = 'left';
      c.fillText('CODEX PET RACING', 26, 42);
      c.fillStyle = '#fff'; c.textAlign = 'right'; c.fillText(info.name, w - 26, 42);
      c.textAlign = 'left'; c.fillText(info.menu ? '시드니 하버런' : `${info.position}위 / 8  ·  ${info.progress ?? 0}%  ·  1 LAP`, 26, h - 27);
      c.textAlign = 'center'; c.fillText(info.time, w / 2, h - 27);
      c.textAlign = 'right'; c.fillStyle = info.boost ? '#ffdc8b' : '#fff';
      c.fillText(`${Math.round(info.speed * 3.6)} km/h${info.boost ? '  BOOST' : ''}`, w - 26, h - 27);
      if (info.banner) {
        c.fillStyle = '#071d30bd'; c.fillRect(w / 2 - 200, h / 2 - 42, 400, 84);
        c.textAlign = 'center'; c.font = 'bold 40px sans-serif'; c.fillStyle = '#fff'; c.fillText(info.banner, w / 2, h / 2 + 15);
      }
    } catch { this.stop('화면을 녹화하지 못해 종료했어요. 다른 브라우저에서 다시 시도해 주세요.'); }
  }
}
