import {RaceRecording} from './recording.js';

const clock = seconds => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;

export function bindRecording({audio, toast, beforeOpen, afterClose, audioReady = () => {}}) {
  const $ = id => document.getElementById(id);
  const dialog = $('recording-dialog'), video = $('recording-preview');
  let starting = false, previewAfterStop = false, lastSecond = -1, errorMessage = '';
  const recorder = new RaceRecording({
    onChange: refresh,
    onError: message => { starting = false; errorMessage = message; refresh(); toast(message, 4500); },
    onComplete: clip => {
      video.src = clip.url;
      $('recording-download').href = clip.url;
      $('recording-download').download = clip.name;
      refresh(); toast('주행 영상 준비 완료 · 녹화 버튼에서 저장하세요.', 4000);
      if (previewAfterStop && !document.hidden) open();
      previewAfterStop = false;
    },
  });
  function refresh() {
    const active = recorder.active, clip = recorder.clip;
    if (clip && !active && video.src !== clip.url) video.src = clip.url;
    $('recording-toggle').classList.toggle('is-recording', active);
    $('recording-toggle').setAttribute('aria-label', active ? '녹화 종료' : clip ? '녹화 영상 보기' : '주행 녹화');
    $('recording-toggle').disabled = recorder.state === 'stopping' || starting;
    $('recording-label').textContent = active ? '종료 ' + clock((performance.now() - recorder.startedAt) / 1000) : clip ? '영상' : '녹화';
    $('recording-start').disabled = active || starting || !recorder.supported;
    $('recording-start').textContent = starting ? '녹화 준비 중…' : clip ? '새 녹화 시작' : '녹화 시작';
    $('recording-stop').hidden = !active;
    $('recording-stop').disabled = recorder.state === 'stopping';
    $('recording-start').hidden = active;
    $('recording-saved').hidden = !clip || active;
    $('recording-unsupported').hidden = recorder.supported;
    $('recording-status').textContent = errorMessage || (active ? '녹화 중 · 게임으로 돌아가 계속 달려보세요.' : clip ? `${clip.reason} ${clock(clip.duration)} · ${(clip.blob.size / 1024 / 1024).toFixed(1)} MB · ${clip.name.endsWith('.mp4') ? 'MP4' : 'WebM'}` : '게임 화면·주행 정보·게임 소리를 영상으로 저장해요.');
    $('recording-replace').hidden = !clip || active;
    document.querySelectorAll('[data-open-recording]').forEach(button => button.disabled = !clip && !active);
    let share = false;
    try { share = Boolean(clip && navigator.canShare?.({files: [new File([clip.blob], clip.name, {type: clip.blob.type})]})); } catch {}
    $('recording-share').hidden = !share || active;
  }
  function open() {
    if (dialog.open) return;
    beforeOpen(); refresh(); dialog.showModal();
  }
  $('recording-toggle').onclick = () => {
    if (recorder.state === 'recording') { previewAfterStop = true; recorder.stop(); }
    else open();
  };
  $('recording-close').onclick = () => dialog.close();
  dialog.addEventListener('close', () => { video.pause(); afterClose(); });
  $('recording-start').onclick = async () => {
    if (starting || recorder.active) return;
    starting = true; errorMessage = ''; refresh();
    try {
      await audio.unlock();
      audioReady();
      if (document.hidden) return;
      let capture = null;
      try { capture = audio.capture(); } catch { /* 소리 캡처 미지원 환경은 영상만 저장한다. */ }
      if (recorder.start(capture)) {
        video.pause(); video.removeAttribute('src'); video.load();
        dialog.close(); toast(audio.muted ? '녹화 시작 · 현재 게임 소리는 꺼져 있어요.' : capture ? '녹화 시작 · 화면과 게임 소리를 담아요.' : '녹화 시작 · 이 브라우저에서는 영상만 저장해요.', 3000);
      }
    } finally { starting = false; refresh(); }
  };
  $('recording-stop').onclick = () => recorder.stop();
  document.querySelectorAll('[data-open-recording]').forEach(button => button.onclick = open);
  $('recording-share').onclick = async () => {
    const clip = recorder.clip;
    if (!clip) return;
    try { await navigator.share({files: [new File([clip.blob], clip.name, {type: clip.blob.type})], title: '펫 레이싱 주행 영상'}); }
    catch (error) { if (error.name !== 'AbortError') toast('공유를 열지 못했어요. 영상 저장 버튼을 이용해 주세요.', 3500); }
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) recorder.stop('화면을 벗어나 녹화를 마쳤어요.'); });
  window.addEventListener('pagehide', () => recorder.stop());
  refresh();
  return {
    stop: reason => recorder.stop(reason),
    draw(source, info, now) {
      recorder.draw(source, info, now);
      if (recorder.active) {
        const second = Math.floor((now - recorder.startedAt) / 1000);
        if (second !== lastSecond) { lastSecond = second; refresh(); }
      }
    },
  };
}
