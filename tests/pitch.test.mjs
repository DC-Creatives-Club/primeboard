import test from 'node:test';
import assert from 'node:assert/strict';
import { loweredPitch, describePitch, matchesScale, SCALES } from '../web/pitch.js';
import { Resonator } from '../web/resonator.js';
import { KEYS } from '../web/color.js';
import { CANTOR_FREQUENCIES } from '../web/cantor.js';

test('octave shift changes audio frequencies without changing physical model or ratios', () => {
  const spec = { fundamentalHz: 5907, ratios: [1, 1.3], strikes: [[1,0],[0,1]], pickup: [1,1] };
  for (const octaves of [2,3]) {
    const shifted = loweredPitch(spec, octaves);
    assert.equal(shifted.fundamentalHz,5907 / 2 ** octaves);
    assert.equal(shifted.ratios,spec.ratios);
    assert.equal(loweredPitch(spec,octaves),shifted);
    const bank = new Resonator(shifted);
    bank.omega.forEach((omega,i)=>assert.ok(Math.abs(omega/(2*Math.PI)-5907*spec.ratios[i]/2**octaves)<1e-9));
  }
  assert.equal(spec.fundamentalHz,5907);
  assert.equal(loweredPitch(spec,0),spec);
  assert.equal(loweredPitch(null,0),null);
  assert.throws(()=>loweredPitch(spec,1),RangeError);
});

test('audible note labels agree with Number pitches, octaves and harmonic tuning offsets', () => {
  for (const key of KEYS) {
    const pitch = describePitch(key.audioHz);
    assert.equal(pitch.note, key.note);
    assert.equal(pitch.label, key.note);
    assert.ok(Math.abs(pitch.cents) < 1e-9);
  }
  assert.equal(describePitch(110).label, 'A2');
  assert.equal(describePitch(220).label, 'A3');
  assert.equal(describePitch(440).label, 'A4');
  const third = describePitch(550);
  assert.equal(third.label, '≈C♯5');
  assert.ok(Math.abs(third.cents + 13.686286) < 1e-6);
  assert.equal(third.detail, '550 Hz · nearest C♯5 · −13.7 cents');
  assert.equal(describePitch(660).label, 'E5');
  assert.match(describePitch(660).detail, /\+2.0 cents/);
  for (const invalid of [null, undefined, 0, -1, NaN, Infinity]) assert.equal(describePitch(invalid), null);
});

test('approximation and scale thresholds include their boundaries without snapping pitches', () => {
  const detuned = cents => describePitch(440 * 2 ** (cents / 1200));
  for (const direction of [-1, 1]) {
    assert.equal(detuned(direction * 5).approximate, false);
    assert.equal(detuned(direction * 5.001).approximate, true);
    assert.equal(matchesScale(detuned(direction * 25), 9, 'major'), true);
    assert.equal(matchesScale(detuned(direction * 25.001), 9, 'major'), false);
  }
  for (const hz of [440, 550, 660]) {
    const pitch = Object.freeze(describePitch(hz));
    assert.equal(matchesScale(pitch, 9, 'major'), true);
    assert.equal(matchesScale(pitch, 9, 'major-pentatonic'), true);
    assert.equal(pitch.frequency, hz);
  }
  // G5 is in C major, but the seventh harmonic lies too far below it.
  assert.equal(describePitch(770).note, 'G5');
  assert.equal(matchesScale(describePitch(770), 0, 'major'), false);
  assert.equal(matchesScale(null, 9, 'major'), false);
  assert.equal(matchesScale(describePitch(440), 9, 'off'), false);
});

test('scale guides transpose across all roots and repeat over octave boundaries', () => {
  for (const [scale, { intervals }] of Object.entries(SCALES)) {
    for (let root = 0; root < 12; root++) for (let midi = 48; midi < 84; midi++) {
      const pitch = describePitch(440 * 2 ** ((midi - 69) / 12));
      assert.equal(matchesScale(pitch, root, scale), intervals.includes((midi - root + 12) % 12));
    }
  }
  assert.equal(matchesScale(describePitch(550), 9, 'minor'), false);
  assert.throws(() => matchesScale(describePitch(440), 12, 'major'), RangeError);
  assert.throws(() => matchesScale(describePitch(440), 9, 'unknown'), RangeError);
});

test('octave controls update audible note octaves while preserving cents and guide membership', () => {
  const spec = Object.freeze({ fundamentalHz: 5907, ratios: Object.freeze([1, 1.3]), strikes: [[1, 0], [0, 1]], pickup: [1, 1] });
  for (const octaves of [0, 2, 3]) {
    const shifted = loweredPitch(spec, octaves), bank = new Resonator(shifted);
    for (let i = 0; i < spec.ratios.length; i++) {
      const frequency = shifted.fundamentalHz * shifted.ratios[i];
      const original = describePitch(spec.fundamentalHz * spec.ratios[i]), audible = describePitch(frequency);
      assert.equal(audible.midi, original.midi - 12 * octaves);
      assert.ok(Math.abs(audible.cents - original.cents) < 1e-9);
      assert.equal(matchesScale(audible, 9, 'major'), matchesScale(original, 9, 'major'));
      assert.ok(Math.abs(bank.omega[i] / (2 * Math.PI) - audible.frequency) < 1e-9);
    }
  }
  const before = [...CANTOR_FREQUENCIES];
  for (const frequency of CANTOR_FREQUENCIES) matchesScale(describePitch(frequency), 9, 'major');
  assert.deepEqual(CANTOR_FREQUENCIES, before);
});
