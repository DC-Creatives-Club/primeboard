import test from 'node:test';
import assert from 'node:assert/strict';
import { Instrument, fitKeyWeights } from '../web/instrument.js';

test('holds advance at fixed real-time steps, ignore repeat events, and cap at 32', () => {
  const instrument = new Instrument();
  instrument.press(0, 'KeyQ', 0); assert.equal(instrument.exponents[0], 1);
  assert.equal(instrument.press(0, 'KeyQ', 100), false);
  instrument.tick(499); assert.equal(instrument.exponents[0], 1);
  instrument.tick(500); assert.equal(instrument.exponents[0], 2);
  instrument.tick(1550); assert.equal(instrument.exponents[0], 4);
  instrument.tick(999999); assert.equal(instrument.exponents[0], 32);
  instrument.release('KeyQ'); assert.equal(instrument.exponents[0], 0);
});
test('different input sources on the same key cannot release one another', () => {
  const instrument = new Instrument();
  instrument.press(1, 'KeyW', 0); instrument.press(1, 'pointer-1', 0);
  assert.equal(instrument.exponents[1], 1);
  instrument.release('pointer-1'); assert.equal(instrument.exponents[1], 1);
  instrument.release('KeyW'); assert.equal(instrument.exponents[1], 0);
});
test('sustain retains power and repeated presses add one; toggling off keeps only held notes', () => {
  const instrument = new Instrument(); instrument.setSustain(true);
  instrument.press(0, 'a', 0); instrument.tick(600); instrument.release('a');
  assert.equal(instrument.exponents[0], 2);
  instrument.tick(1500); assert.equal(instrument.exponents[0], 2);
  instrument.press(0, 'a', 1500); assert.equal(instrument.exponents[0], 3);
  instrument.press(1, 'b', 1500); instrument.release('b');
  instrument.setSustain(false);
  assert.equal(instrument.exponents[0], 3); assert.equal(instrument.exponents[1], 0);
  instrument.release('a'); assert.equal(instrument.exponents[0], 0);
});
test('clear and loading a number discard all prior input ownership', () => {
  const instrument = new Instrument(); instrument.press(3, 'q', 0);
  instrument.clear(); instrument.tick(10000);
  assert.equal(instrument.sources.size, 0); assert.equal(instrument.held.size, 0);
  assert.ok(instrument.exponents.every(e => e === 0));
  const state = Array(26).fill(0); state[7] = 5;
  instrument.load(state); instrument.release('q'); instrument.tick(100000);
  assert.equal(instrument.exponents[7], 5); assert.equal(instrument.sustain, true);
  state[7] = 1; assert.equal(instrument.exponents[7], 5);
});
test('changing hold speed restarts the interval without a jump in intensity', () => {
  const instrument = new Instrument(); instrument.press(0, 'q', 0);
  instrument.setHoldMs(100, 400); instrument.tick(499);
  assert.equal(instrument.exponents[0], 1);
  instrument.tick(500); assert.equal(instrument.exponents[0], 2);
});

test('modal holds keep a steady driver independently of Number exponent growth', () => {
  const instrument = new Instrument();
  instrument.press(0, 'q', 0);
  instrument.tick(100000);
  assert.equal(instrument.exponents[0], 32);
  assert.equal(instrument.levels[0], 1);
  instrument.setSustain(true); instrument.release('q');
  assert.equal(instrument.levels[0], 1);
  instrument.press(0, 'q', 100001); instrument.release('q');
  assert.equal(instrument.levels[0], 2, 'Replaying a sustained key explicitly increases its driver strength.');
  instrument.setSustain(false);
  assert.equal(instrument.levels[0], 0);
});

test('view adaptation preserves shared letters and pads or omits Cantor punctuation', () => {
  const legacy = Array.from({ length: 26 }, (_, i) => i);
  const extended = fitKeyWeights(legacy, 32);
  assert.deepEqual(extended.slice(26), Array(6).fill(0));
  extended[31] = 1;
  assert.deepEqual(fitKeyWeights(extended), legacy);
  const instrument = new Instrument(32);
  instrument.load(extended); extended[31] = 2;
  assert.equal(instrument.exponents[31], 1);
  assert.equal(instrument.levels.length, 32);
  assert.equal(instrument.press(32, 'out-of-range', 0), false);
  assert.equal(new Instrument().press(26, 'BracketLeft', 0), false);
});
