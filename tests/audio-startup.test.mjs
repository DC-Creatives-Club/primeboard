import test from 'node:test';
import assert from 'node:assert/strict';
import { Synth, AUDIO_START_TIMEOUT_MS } from '../web/audio.js';
import { shouldUnlockAudio } from '../web/audio-gesture.js';

function gesture(type, { keyboard = false, control = false, ...options } = {}) {
  return { type, isTrusted: true, pointerType: 'touch', key: 'q',
    target: { closest: selector => selector === '#keyboard' ? keyboard : control }, ...options };
}

test('scrolling on a touchscreen cannot start a pending audio unlock', () => {
  for (const type of ['pointerdown', 'pointermove', 'pointercancel', 'pointerup', 'touchend']) {
    assert.equal(shouldUnlockAudio(gesture(type)), false, type);
  }
  assert.equal(shouldUnlockAudio(gesture('click')), true);
  assert.equal(shouldUnlockAudio(gesture('pointerdown', { pointerType: 'mouse' })), true);
});

test('keyboard gestures can retry on release, while explicit audio controls own their clicks', () => {
  for (const type of ['pointerdown', 'pointerup', 'touchend', 'click', 'keydown']) {
    assert.equal(shouldUnlockAudio(gesture(type, { keyboard: true })), true, type);
    assert.equal(shouldUnlockAudio(gesture(type, { control: true })), false, type);
    assert.equal(shouldUnlockAudio(gesture(type, { isTrusted: false })), false, type);
  }
  assert.equal(shouldUnlockAudio(gesture('keydown', { key: 'Escape' })), false);
  assert.equal(shouldUnlockAudio(gesture('keydown', { metaKey: true })), false);
});

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function startupRig(t) {
  const originalWindow = globalThis.window, originalNode = globalThis.AudioWorkletNode;
  const resumes = [], modules = [], nodes = [];
  const context = {
    state: 'suspended', currentTime: 0,
    resume() { const request = deferred(); resumes.push(request); return request.promise; },
    audioWorklet: { addModule() { const request = deferred(); modules.push(request); return request.promise; } },
  };
  globalThis.window = { AudioContext: class {} };
  globalThis.AudioWorkletNode = class {
    constructor() { this.messages = []; this.port = { postMessage: message => this.messages.push(message) }; nodes.push(this); }
    connect() {}
  };
  t.after(() => { globalThis.window = originalWindow; globalThis.AudioWorkletNode = originalNode; });
  const synth = new Synth(); synth.context = context;
  return { synth, context, resumes, modules, nodes };
}

test('a Play gesture resumes immediately despite an earlier blocked request, loading one worklet', async t => {
  const { synth, context, resumes, modules, nodes } = startupRig(t);
  const earlierTouch = synth.enable(); // Model a resume that Safari leaves pending.
  assert.equal(resumes.length, 1);
  const playTap = synth.enable();
  assert.equal(resumes.length, 2, 'resume is called synchronously again, before awaiting anything');
  assert.equal(modules.length, 1, 'overlapping requests share module loading');
  context.state = 'running'; modules[0].resolve(); resumes[1].resolve();
  await playTap; // Must finish even if the earlier resume promise never settles.
  assert.equal(synth.enabled, true); assert.equal(nodes.length, 1);
  resumes[0].resolve(); await earlierTouch;
  assert.equal(nodes.length, 1);
});

test('an interrupted audio context can resume using its existing sound engine', async t => {
  const { synth, context, resumes, modules, nodes } = startupRig(t);
  const first = synth.enable(); context.state = 'running'; modules[0].resolve(); resumes[0].resolve(); await first;
  context.state = 'interrupted';
  const retry = synth.enable(); assert.equal(resumes.length, 2);
  context.state = 'running'; resumes[1].resolve(); await retry;
  assert.equal(modules.length, 1); assert.equal(nodes.length, 1);
});

test('a stuck resume times out and a new tap can retry', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { synth, context, resumes, modules } = startupRig(t);
  const blocked = synth.enable();
  const rejected = assert.rejects(blocked, /Audio did not start.*retry/);
  modules[0].resolve(); await Promise.resolve();
  t.mock.timers.tick(AUDIO_START_TIMEOUT_MS); await rejected;
  const retry = synth.enable(); context.state = 'running'; resumes[1].resolve(); await retry;
  assert.equal(synth.enabled, true); assert.equal(modules.length, 1);
});

test('failed worklet loads are retryable without duplicating nodes', async t => {
  const { synth, context, resumes, modules, nodes } = startupRig(t);
  const first = synth.enable(), rejected = assert.rejects(first, /network failure/);
  context.state = 'running'; resumes[0].resolve(); modules[0].reject(new Error('network failure')); await rejected;
  const retry = synth.enable(); modules[1].resolve(); resumes[1].resolve(); await retry;
  assert.equal(nodes.length, 1);
});

test('a timed-out module cannot attach a late duplicate sound engine', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { synth, context, resumes, modules, nodes } = startupRig(t);
  const first = synth.enable(), rejected = assert.rejects(first, /sound engine did not load/);
  context.state = 'running'; resumes[0].resolve(); await Promise.resolve();
  t.mock.timers.tick(AUDIO_START_TIMEOUT_MS); await rejected;
  const retry = synth.enable(); modules[1].resolve(); resumes[1].resolve(); await retry;
  modules[0].resolve(); await Promise.resolve();
  assert.equal(nodes.length, 1);
});

test('turning sound off during startup stays muted after the request completes', async t => {
  const { synth, context, resumes, modules } = startupRig(t);
  const pending = synth.enable(); synth.disable();
  context.state = 'running'; resumes[0].resolve(); modules[0].resolve(); await pending;
  assert.equal(synth.enabled, false);
});
