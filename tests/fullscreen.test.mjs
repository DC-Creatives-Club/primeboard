import test from 'node:test';
import assert from 'node:assert/strict';
import { bindVisualizationFullscreen } from '../web/fullscreen.js';

function rig(mode = 'native') {
  const doc = new EventTarget();
  doc.defaultView = new EventTarget();
  let focused = true;
  doc.hasFocus = () => focused;
  function element(parent = null) {
    const el = new EventTarget(), classes = new Set(), attributes = new Map();
    Object.assign(el, { ownerDocument: doc, parentElement: parent, children: [], inert: false, isConnected: true,
      classList: {
        contains: name => classes.has(name),
        toggle(name, force = !classes.has(name)) { if (force) classes.add(name); else classes.delete(name); return force; },
      },
      setAttribute: (name, value) => attributes.set(name, value),
      getAttribute: name => attributes.get(name),
      focus() { doc.activeElement = el; },
    });
    parent?.children.push(el);
    return el;
  }
  doc.body = element();
  const main = element(doc.body), footer = element(doc.body);
  const settings = element(main), alreadyInert = element(main), frame = element(main);
  alreadyInert.inert = true;
  const button = element(frame), keys = element(frame);
  button.focus();
  let requests = 0, exits = 0, finishRequest;
  function nativeEnter() { doc.fullscreenElement = frame; doc.dispatchEvent(new Event('fullscreenchange')); }
  function nativeExit() { doc.fullscreenElement = null; doc.dispatchEvent(new Event('fullscreenchange')); }
  doc.fullscreenEnabled = mode !== 'disabled';
  if (mode !== 'unsupported') frame.requestFullscreen = () => {
    requests++;
    if (mode === 'rejected') return Promise.reject(new Error('Not allowed'));
    if (mode === 'pending') return new Promise(resolve => { finishRequest = () => { nativeEnter(); resolve(); }; });
    nativeEnter(); return Promise.resolve();
  };
  doc.exitFullscreen = async () => { exits++; nativeExit(); };
  const binding = bindVisualizationFullscreen(frame, button, keys);
  const escape = () => {
    const event = new Event('keydown', { cancelable: true });
    event.code = 'Escape';
    const handled = binding.handleEscape(event);
    return { handled, prevented: event.defaultPrevented };
  };
  return { doc, frame, button, keys, settings, footer, alreadyInert, binding, nativeExit, escape,
    focus(value) { focused = value; if (value) doc.defaultView.dispatchEvent(new Event('focus')); },
    get requests() { return requests; }, get exits() { return exits; }, finishRequest: () => finishRequest(),
  };
}

test('native fullscreen requests synchronously, restores focus, and preserves preexisting inert state', async () => {
  const r = rig();
  const entering = r.binding.toggle();
  assert.equal(r.requests, 1, 'request stays inside the activation gesture');
  await entering;
  assert.equal(r.doc.fullscreenElement, r.frame);
  assert.equal(r.doc.activeElement, r.frame);
  assert.equal(r.settings.inert, true); assert.equal(r.footer.inert, true);
  assert.equal(r.button.getAttribute('aria-label'), 'Exit fullscreen');
  await r.binding.toggle();
  assert.equal(r.exits, 1); assert.equal(r.binding.active, false);
  assert.equal(r.doc.activeElement, r.button);
  assert.equal(r.settings.inert, false); assert.equal(r.footer.inert, false);
  assert.equal(r.alreadyInert.inert, true);
  assert.equal(r.doc.body.classList.contains('visualization-fullscreen'), false);
});

test('unsupported, disabled, and denied fullscreen all offer an escapable viewport fallback', async () => {
  for (const mode of ['unsupported', 'disabled', 'rejected']) {
    const r = rig(mode);
    await r.binding.toggle();
    assert.equal(r.binding.active, true);
    assert.equal(r.frame.classList.contains('is-fullscreen'), true);
    assert.deepEqual(r.escape(), { handled: true, prevented: true });
    assert.equal(r.binding.active, false);
    assert.equal(r.settings.inert, false);
    assert.deepEqual(r.escape(), { handled: false, prevented: false }, 'normal Escape can clear again');
  }
});

test('browser-initiated exit restores the page and consumes a late Escape instead of clearing notes', async t => {
  t.mock.timers.enable({ apis: ['Date'], now: 1000 });
  const r = rig();
  await r.binding.toggle();
  r.nativeExit();
  assert.equal(r.binding.active, false);
  assert.equal(r.settings.inert, false);
  assert.equal(r.button.getAttribute('aria-pressed'), 'false');
  assert.equal(r.escape().handled, true);
  t.mock.timers.tick(501);
  assert.equal(r.escape().handled, false);
});

test('exiting during a pending native request does not leave an invisible fullscreen session', async () => {
  const r = rig('pending');
  const entering = r.binding.toggle();
  r.escape();
  assert.equal(r.binding.active, false);
  r.finishRequest(); await entering;
  assert.equal(r.doc.fullscreenElement, null);
  assert.equal(r.binding.active, false);
  assert.equal(r.exits, 1);
});

test('a failed browser exit keeps the exit control usable for another attempt', async () => {
  const r = rig(); await r.binding.toggle();
  const exit = r.doc.exitFullscreen;
  r.doc.exitFullscreen = async () => { throw new Error('Busy'); };
  await r.binding.exit();
  assert.equal(r.binding.active, true);
  assert.equal(r.button.getAttribute('aria-label'), 'Exit fullscreen');
  r.doc.exitFullscreen = exit;
  await r.binding.exit();
  assert.equal(r.binding.active, false);
});

test('the touch keyboard can be shown and hidden without replacing it or leaving fullscreen', async () => {
  const r = rig('unsupported'); await r.binding.toggle();
  r.keys.dispatchEvent(new Event('click'));
  assert.equal(r.frame.classList.contains('show-fullscreen-keys'), true);
  assert.equal(r.keys.getAttribute('aria-pressed'), 'true');
  assert.equal(r.keys.textContent, 'Hide keyboard');
  r.keys.dispatchEvent(new Event('click'));
  assert.equal(r.frame.classList.contains('show-fullscreen-keys'), false);
  assert.equal(r.keys.getAttribute('aria-pressed'), 'false');
  assert.equal(r.binding.active, true);
});

test('Safari fullscreen focus transitions preserve a performance, but real departures still clear', async t => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 1000 });
  const r = rig();
  let clears = 0;
  const stop = () => clears++;
  await r.binding.toggle();
  r.focus(false); r.binding.handleBlur(stop);
  r.nativeExit();
  t.mock.timers.tick(75); r.focus(true);
  t.mock.timers.tick(500);
  assert.equal(clears, 0, 'a transient native-window blur must not end a recording or clear keys');
  r.focus(false); r.binding.handleBlur(stop);
  assert.equal(clears, 1, 'outside fullscreen, a real blur still clears immediately');
  r.focus(true); await r.binding.toggle();
  r.focus(false); r.binding.handleBlur(stop);
  t.mock.timers.tick(251);
  assert.equal(clears, 2, 'leaving fullscreen for another app must not leave stuck keys');
});
