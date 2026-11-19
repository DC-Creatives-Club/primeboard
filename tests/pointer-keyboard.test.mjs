import test from 'node:test';
import assert from 'node:assert/strict';
import { bindPointerKeyboard } from '../web/pointer-keyboard.js';
import { Instrument } from '../web/instrument.js';

function rig({ captureFails = false } = {}) {
  const window = new EventTarget(), keyboard = new EventTarget();
  const instrument = new Instrument(32), captured = new Set();
  const keys = Array.from({ length: 32 }, (_, i) => ({ dataset: { index: String(i) }, closest() { return this; } }));
  const outside = { closest: () => null };
  let hit = outside;
  keyboard.ownerDocument = { defaultView: window, elementFromPoint: () => hit };
  keyboard.contains = key => keys.includes(key);
  keyboard.focus = () => {};
  keyboard.setPointerCapture = id => {
    if (captureFails) throw new DOMException('No active pointer', 'NotFoundError');
    captured.add(id);
  };
  keyboard.hasPointerCapture = id => captured.has(id);
  keyboard.releasePointerCapture = id => { captured.delete(id); emit('lostpointercapture', keyboard, { pointerId: id }); };
  const binding = bindPointerKeyboard(keyboard, {
    onPress: (index, source) => instrument.press(index, source, 0),
    onRelease: (source, options) => instrument.release(source, options),
  });
  function emit(type, target = outside, options = {}) {
    const event = new Event(type, { cancelable: true });
    Object.defineProperty(event, 'target', { value: target });
    Object.assign(event, { pointerId: 1, pointerType: 'touch', button: 0, buttons: 1, ...options });
    // Model window capture followed by the keyboard's bubbling listener.
    window.dispatchEvent(event);
    if (target === keyboard || keyboard.contains(target)) keyboard.dispatchEvent(event);
    return event;
  }
  return { instrument, keyboard, keys, captured, outside, binding, emit,
    down: (index, id = 1, options = {}) => emit('pointerdown', keys[index], { pointerId: id, ...options }),
    move: (target, id = 1, options = {}) => { hit = target; return emit('pointermove', target || outside, { pointerId: id, ...options }); },
    up: (id = 1) => emit('pointerup', outside, { pointerId: id }),
  };
}

test('long holds build strength, release outside the keyboard, and can be played again', () => {
  const r = rig();
  assert.equal(r.down(0).defaultPrevented, true);
  r.instrument.tick(2000); assert.equal(r.instrument.exponents[0], 5);
  r.up();
  assert.equal(r.instrument.exponents[0], 0);
  assert.equal(r.instrument.held.size, 0);
  r.down(0); assert.equal(r.instrument.exponents[0], 1);
  r.up(); assert.equal(r.instrument.sources.size, 0);
});

test('multiple fingers and physical/MIDI sources release independently', () => {
  const r = rig();
  r.down(0, 1); r.down(1, 2); r.down(1, 3);
  r.instrument.press(0, 'KeyQ', 0); r.instrument.press(2, 'midi-1', 0);
  r.up(1); r.up(2);
  assert.deepEqual(r.instrument.exponents.slice(0, 3), [1, 1, 1]);
  r.up(3); assert.deepEqual(r.instrument.exponents.slice(0, 3), [1, 0, 1]);
  r.emit('touchend', r.outside, { touches: [] });
  assert.deepEqual(r.instrument.exponents.slice(0, 3), [1, 0, 1]);
});

test('gliding releases previous keys, gaps, and keys outside this keyboard', () => {
  const r = rig(); r.down(0);
  r.move(r.keys[1]); assert.deepEqual(r.instrument.exponents.slice(0, 2), [0, 1]);
  r.move(null); assert.equal(r.instrument.held.size, 0);
  r.move(r.keys[2]); assert.equal(r.instrument.exponents[2], 1);
  const foreignKey = { dataset: { index: '3' }, closest() { return this; } };
  r.move(foreignKey); assert.equal(r.instrument.held.size, 0);
  r.move(r.keys[0]); r.up(); assert.equal(r.instrument.held.size, 0);
});

test('a failed capture still allows window movement and release', () => {
  const r = rig({ captureFails: true });
  r.down(0); r.move(r.keys[1]); assert.equal(r.instrument.exponents[1], 1);
  r.up(); assert.equal(r.instrument.sources.size, 0); assert.equal(r.instrument.held.size, 0);
});

test('cancellation and lost capture release only the interrupted finger, even with sustain', () => {
  for (const type of ['pointercancel', 'lostpointercapture']) {
    const r = rig(); r.instrument.setSustain(true);
    r.down(0, 1); r.move(r.keys[1], 1); r.down(2, 2);
    r.captured.delete(1);
    r.emit(type, r.outside, { pointerId: 1 });
    assert.deepEqual(r.instrument.exponents.slice(0, 3), [0, 0, 1]);
    assert.equal(r.instrument.sources.size, 1);
    r.up(2); assert.equal(r.instrument.held.size, 0);
    assert.equal(r.instrument.exponents[2], 1, 'Ordinary releases still honor Sustain.');
  }
});

test('transferring implicit capture from a child does not end the hold', () => {
  const r = rig(); r.down(0);
  r.emit('lostpointercapture', r.keys[0]);
  r.instrument.tick(1000); assert.equal(r.instrument.exponents[0], 3);
  r.up(); assert.equal(r.instrument.exponents[0], 0);
});

test('the last touch ending recovers missed pointer releases without ending an active chord', () => {
  const r = rig(); r.down(0, 1); r.down(1, 2);
  r.down(2, 3, { pointerType: 'mouse' });
  r.emit('touchend', r.outside, { touches: [{ identifier: 99 }] });
  assert.deepEqual(r.instrument.exponents.slice(0, 3), [1, 1, 1]);
  r.emit('touchend', r.outside, { touches: [] });
  assert.deepEqual(r.instrument.exponents.slice(0, 3), [0, 0, 1]);
  r.up(1); r.up(2); r.up(3); // Late pointer events are harmless.
  assert.equal(r.instrument.sources.size, 0);
});

test('normal touch completion preserves sustain while touch cancellation clears it', () => {
  for (const type of ['touchend', 'touchcancel']) {
    const r = rig(); r.instrument.setSustain(true); r.down(0); r.move(r.keys[1]);
    r.emit(type, r.outside, { touches: [] });
    assert.deepEqual(r.instrument.exponents.slice(0, 2), type === 'touchend' ? [1, 1] : [0, 0]);
    assert.equal(r.instrument.held.size, 0);
  }
});

test('a repeated pointer ID and a mouse returning with no buttons recover stale holds', () => {
  const r = rig(); r.down(0); r.down(1);
  assert.deepEqual(r.instrument.exponents.slice(0, 2), [0, 1]);
  r.up(); r.down(0, 2, { pointerType: 'mouse' });
  r.move(r.keys[1], 2, { buttons: 0 });
  assert.equal(r.instrument.held.size, 0);
});

test('reset ends active pointer gestures so later movement cannot restart notes', () => {
  const r = rig(); r.down(0); r.down(1, 2);
  r.binding.reset(); r.move(r.keys[2]); r.up(2);
  assert.equal(r.instrument.sources.size, 0); assert.equal(r.instrument.held.size, 0);
});

test('long-press menus, selection, and native dragging are suppressed only on the keyboard', () => {
  const r = rig();
  for (const type of ['contextmenu', 'selectstart', 'dragstart']) {
    assert.equal(r.emit(type, r.keys[0]).defaultPrevented, true);
    assert.equal(r.emit(type, r.outside).defaultPrevented, false);
  }
  r.down(0, 1, { pointerType: 'mouse', button: 2 });
  r.keys[1].hidden = true; r.down(1);
  r.keys[2].disabled = true; r.down(2);
  assert.equal(r.instrument.sources.size, 0);
});
