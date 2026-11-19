// Keep release handling outside the keyboard: native touch gestures or lost
// pointer capture can send the end of a press somewhere other than its start.
export function bindPointerKeyboard(keyboard, { onPress, onRelease }) {
  const document = keyboard.ownerDocument, window = document.defaultView;
  const pointers = new Map();
  const source = id => `pointer-${id}`;
  const keyAt = target => {
    const key = target?.closest?.('.key');
    return key && keyboard.contains(key) && !key.disabled && !key.hidden ? key : null;
  };
  function finish(id, force = false) {
    if (!pointers.has(id)) return;
    pointers.delete(id);
    onRelease(source(id), { force });
    // Delete ownership first: releasing capture can itself emit another event.
    try { if (keyboard.hasPointerCapture(id)) keyboard.releasePointerCapture(id); }
    catch { /* The browser may already have discarded the pointer. */ }
  }
  keyboard.addEventListener('pointerdown', event => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const key = keyAt(event.target);
    if (!key) return;
    event.preventDefault();
    keyboard.focus({ preventScroll: true });
    finish(event.pointerId, true);
    const index = Number(key.dataset.index);
    if (!onPress(index, source(event.pointerId))) return;
    pointers.set(event.pointerId, { index, type: event.pointerType });
    try { keyboard.setPointerCapture(event.pointerId); }
    catch { /* Window listeners still handle movement and release. */ }
  });
  window.addEventListener('pointermove', event => {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    // Recover if a mouse/pen release occurred outside the browser window.
    if (pointer.type !== 'touch' && event.buttons === 0) { finish(event.pointerId); return; }
    const key = keyAt(document.elementFromPoint(event.clientX, event.clientY));
    const next = key ? Number(key.dataset.index) : null;
    if (pointer.index === next) return;
    onRelease(source(event.pointerId));
    pointer.index = next;
    if (next !== null) onPress(next, source(event.pointerId));
  }, { capture: true });
  window.addEventListener('pointerup', event => finish(event.pointerId), { capture: true });
  window.addEventListener('pointercancel', event => finish(event.pointerId, true), { capture: true });
  window.addEventListener('lostpointercapture', event => {
    // Ignore a child's implicit capture being transferred to the keyboard.
    if (!keyboard.hasPointerCapture(event.pointerId)) finish(event.pointerId, true);
  }, { capture: true });
  for (const type of ['touchend', 'touchcancel']) {
    window.addEventListener(type, event => {
      // Safari can interrupt the pointer stream during a native gesture. Touch
      // IDs and pointer IDs are unrelated, so reconcile only once all fingers
      // have lifted; ordinary pointerup releases each finger independently.
      if (event.touches.length) return;
      for (const [id, pointer] of pointers) {
        if (pointer.type === 'touch') finish(id, type === 'touchcancel');
      }
    }, { capture: true, passive: true });
  }
  for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
    keyboard.addEventListener(type, event => event.preventDefault());
  }
  return { reset() { for (const id of pointers.keys()) finish(id, true); } };
}
