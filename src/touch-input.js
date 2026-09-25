// 손가락마다 입력을 추적해 동시 조작과 떼지 않는 역조향을 지원한다.
export function bindTouchInput(root, state, enabled) {
  const buttons = [...root.querySelectorAll('[data-touch]')];
  const pointers = new Map();
  const steering = key => key === 'left' || key === 'right';
  function sync() {
    for (const key of Object.keys(state)) state[key] = false;
    for (const pointer of pointers.values()) if (pointer.key) state[pointer.key] = true;
    for (const button of buttons) {
      const pressed = Boolean(state[button.dataset.touch]);
      button.classList.toggle('pressed', pressed);
      button.setAttribute('aria-pressed', String(pressed));
    }
  }
  function targetAt(event, pointer) {
    if (pointer.steering) {
      const left = root.querySelector('[data-touch="left"]').getBoundingClientRect();
      const right = root.querySelector('[data-touch="right"]').getBoundingClientRect();
      // 두 방향 패드 사이의 틈도 연결해 역조향 도중 입력이 끊기지 않는다.
      if (event.clientX < left.left - 24 || event.clientX > right.right + 24 ||
          event.clientY < Math.min(left.top, right.top) - 24 || event.clientY > Math.max(left.bottom, right.bottom) + 24) return null;
      return event.clientX < (left.right + right.left) / 2 ? 'left' : 'right';
    }
    const hit = document.elementFromPoint(event.clientX, event.clientY)?.closest('[data-touch]');
    if (hit && root.contains(hit) && !steering(hit.dataset.touch)) return hit.dataset.touch;
    const original = pointer.button.getBoundingClientRect();
    return event.clientX >= original.left - 20 && event.clientX <= original.right + 20 &&
      event.clientY >= original.top - 20 && event.clientY <= original.bottom + 20 ? pointer.button.dataset.touch : null;
  }
  for (const button of buttons) {
    button.addEventListener('pointerdown', event => {
      if (!enabled() || event.button > 0) return;
      event.preventDefault();
      pointers.set(event.pointerId, {button, key: button.dataset.touch, steering: steering(button.dataset.touch)});
      button.setPointerCapture(event.pointerId);
      sync();
    });
    button.addEventListener('pointermove', event => {
      const pointer = pointers.get(event.pointerId);
      if (!pointer) return;
      event.preventDefault();
      pointer.key = enabled() ? targetAt(event, pointer) : null;
      sync();
    });
    const release = event => { pointers.delete(event.pointerId); sync(); };
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('lostpointercapture', release);
  }
  return {
    clear() {
      const captured = [...pointers];
      pointers.clear(); sync();
      for (const [id, pointer] of captured) if (pointer.button.hasPointerCapture(id)) pointer.button.releasePointerCapture(id);
    },
  };
}
