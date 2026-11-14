import test from 'node:test';
import assert from 'node:assert/strict';
import { BASE_AMPLITUDE, toneAmplitudes, outputLimit, Synth } from '../web/audio.js';

const state = () => Array(26).fill(0);
test('holding a tone increases power in proportion to its exponent', () => {
  const e = state(); e[0] = 1;
  const unit = toneAmplitudes(e)[0];
  e[0] = 4;
  const held = toneAmplitudes(e)[0];
  assert.equal(unit, BASE_AMPLITUDE);
  assert.equal(held, 2 * unit);
  assert.equal(held ** 2 / unit ** 2, 4);
});
test('adding another tone does not reduce existing oscillator amplitude', () => {
  const e = state(); e[4] = 3;
  const solo = toneAmplitudes(e);
  e[12] = 9;
  const chord = toneAmplitudes(e);
  assert.equal(chord[4], solo[4]);
  assert.equal(chord[12], 3 * BASE_AMPLITUDE);
  assert.equal(chord[0], 0);
});
test('power is additive when encoded spectral weights are added', () => {
  const a = state(), b = state(); a[3] = 2; b[3] = 5;
  const combined = a.map((v, i) => v + b[i]);
  const power = e => toneAmplitudes(e).reduce((sum, v) => sum + v * v / 2, 0);
  assert.ok(Math.abs(power(combined) - power(a) - power(b)) < 1e-12);
});
test('the output limiter leaves quiet signals linear and bounds overloads', () => {
  for (const sample of [-0.8, -0.2, 0, 0.2, 0.8]) assert.equal(outputLimit(sample), sample);
  for (const sample of [-100, -5, -1, 1, 5, 100]) assert.ok(Math.abs(outputLimit(sample)) <= 1);
  assert.ok(outputLimit(0.9) > outputLimit(0.8));
  assert.equal(outputLimit(-0.9), -outputLimit(0.9));
});
test('master volume stays within its documented bounds', () => {
  const synth = new Synth();
  synth.setVolume(10); assert.equal(synth.volume, 0.5);
  synth.setVolume(-1); assert.equal(synth.volume, 0);
  synth.setVolume(NaN); assert.equal(synth.volume, 0);
});
