import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { ChladniSand, sampleGrid } from '../web/chladni-sand.js';
import { MODES, modeShape } from '../web/plate-modes.js';
import { ModeDisplay } from '../web/plate-display.js';
import { parseCMF } from '../web/color.js';

const size = 129;
const fields = [8, 13].map(i => Float32Array.from({ length: size * size }, (_, p) =>
  modeShape(MODES[i], (p % size) / (size - 1), Math.floor(p / size) / (size - 1))));
const meanPower = sand => sand.x.reduce((sum, x, i) => sum + sampleGrid(sand.power, size, x, sand.y[i]), 0) / sand.count;
const run = (sand, seconds, fps = 60) => { for (let i = 0; i < seconds * fps; i++) sand.advance(1 / fps); };

test('sand accumulates at quiet regions and reorganizes after a mode change', () => {
  const sand = new ChladniSand({ count: 3000 });
  sand.setModes(fields, [1, 2], size); sand.setAmplitudes([1, 0]);
  const initial = meanPower(sand);
  run(sand, 8);
  assert.ok(meanPower(sand) < .2 * initial, 'the pattern must emerge from transported particles');
  const positions = sand.x.slice();
  sand.setAmplitudes([0, 1]);
  assert.deepEqual(sand.x, positions, 'a key change must not relocate grains');
  const changed = meanPower(sand);
  run(sand, 8);
  assert.ok(meanPower(sand) < .4 * changed, 'grains must find the new quiet regions');
  for (const coordinate of [...sand.x, ...sand.y]) assert.ok(Number.isFinite(coordinate) && coordinate >= 0 && coordinate <= 1);
  assert.equal(sand.x.length, 3000);
});

test('same-frequency modes interfere while different-frequency powers add', () => {
  const a = new Float32Array(9).fill(1), b = new Float32Array(9).fill(-1);
  const sand = new ChladniSand({ count: 20 });
  sand.setModes([a, b], [1, 1], 3); sand.setAmplitudes([1, 1]);
  assert.ok(sand.power.every(v => v === 0));
  const x = sand.x.slice(), y = sand.y.slice();
  run(sand, 1);
  assert.deepEqual(sand.x, x); assert.deepEqual(sand.y, y);
  sand.setModes([a, b], [1, 2], 3); sand.setAmplitudes([1, 1]);
  assert.ok(sand.power.every(v => v === 2), 'different pitches must not cancel to a false nodal curve');
});

test('transport is repeatable across frame rates, stops without drive, and redistributes explicitly', () => {
  const a = new ChladniSand({ count: 100 }), b = new ChladniSand({ count: 100 });
  for (const sand of [a, b]) { sand.setModes(fields, [1, 2], size); sand.setAmplitudes([1, 1]); }
  run(a, 2, 30); run(b, 2, 60);
  assert.deepEqual(a.x, b.x); assert.deepEqual(a.y, b.y);
  const x = a.x.slice(), y = a.y.slice();
  a.setAmplitudes([0, 0]); run(a, 2);
  assert.deepEqual(a.x, x); assert.deepEqual(a.y, y);
  a.redistribute(); assert.notDeepEqual(a.x, x);
  assert.equal(a.count, 100);
});

test('sand display preserves particles through freeze and clear, and restores the field canvas', () => {
  const canvas = { width: 32, height: 32,
    getContext: () => ({ createImageData: (w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }), putImageData: () => {} }),
    setAttribute: () => {} };
  const rows = parseCMF(readFileSync(new URL('../web/data/CIE_xyz_1931_2deg.csv', import.meta.url), 'utf8'));
  const display = new ModeDisplay(canvas, rows), weights = Array(26).fill(0); weights[8] = 1;
  display.setState(weights, 'sand', 1);
  assert.equal(canvas.width, 512);
  display.tick(0, true); display.tick(100, true);
  const x = display.sand.x.slice(), y = display.sand.y.slice();
  display.tick(200, false);
  assert.deepEqual(display.sand.x, x); assert.deepEqual(display.sand.y, y);
  display.reset(); display.setState(Array(26).fill(0), 'sand', 1); display.tick(300, true);
  assert.deepEqual(display.sand.x, x); assert.deepEqual(display.sand.y, y);
  display.setState(weights, 'nodes', 1);
  assert.equal(canvas.width, 32); assert.equal(canvas.height, 32);
  display.setState(weights, 'sand', 1);
  assert.deepEqual(display.sand.x, x);
  display.redistributeSand(); assert.notDeepEqual(display.sand.x, x);
});
