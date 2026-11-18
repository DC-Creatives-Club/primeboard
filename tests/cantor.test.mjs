import test from 'node:test';
import assert from 'node:assert/strict';
import { CANTOR_PREFIXES, CANTOR_KEYS, CANTOR_ROWS, CANTOR_STATE_SIZE, intersectPrefixes, unionPrefixes, prefixInterval, cantorLevel, cantorSelection as selectCantor } from '../web/cantor.js';
import { KEYS } from '../web/color.js';
import { Instrument } from '../web/instrument.js';
import { CantorView } from '../web/cantor-view.js';

const cantorSelection = weights => selectCantor(weights, 'intersection');
const weights = (...prefixes) => Array.from({ length: CANTOR_STATE_SIZE }, (_, i) => prefixes.includes(CANTOR_PREFIXES[i] ?? null) ? 1 : 0);

test('32 keys preserve letter addresses and include every prefix through depth 4 plus the empty set', () => {
  assert.equal(CANTOR_PREFIXES.length, 31);
  assert.equal(new Set(CANTOR_PREFIXES).size, 31);
  assert.equal(CANTOR_KEYS.length, 32);
  assert.equal(new Set(CANTOR_KEYS.map(key => key.code)).size, 32);
  assert.equal(new Set(CANTOR_ROWS.join('')).size, 32);
  assert.deepEqual(CANTOR_KEYS[31], { index: 31, code: 'Slash', letter: '/', prefix: null });
  assert.deepEqual([...CANTOR_ROWS.join('')].sort(), CANTOR_KEYS.map(key => key.letter).sort());
  for (const key of KEYS) assert.deepEqual(CANTOR_KEYS[key.index], { index: key.index, letter: key.letter, code: key.code, prefix: (key.index + 1).toString(2).slice(1) });
  assert.deepEqual(CANTOR_KEYS.slice(26).map(({ letter, prefix }) => [letter, prefix]), [['[', '1011'], [']', '1100'], [';', '1101'], [',', '1110'], ['.', '1111'], ['/', null]]);
  assert.deepEqual(CANTOR_PREFIXES.slice(0, 7), ['', '0', '1', '00', '01', '10', '11']);
  for (let depth = 0; depth <= 4; depth++) for (const { prefix } of cantorLevel(depth)) assert.ok(CANTOR_PREFIXES.includes(prefix));
  assert.equal(CANTOR_PREFIXES[12], '101'); // D
});

test('intersections distinguish incompatible words from the universal empty prefix', () => {
  assert.equal(intersectPrefixes(['100', '001']), null);
  assert.equal(intersectPrefixes(['10', '101']), '101');
  assert.equal(intersectPrefixes(['101', '', '1', '101', '10']), '101');
  assert.equal(intersectPrefixes(['', '']), '');
  assert.equal(intersectPrefixes([]), '');
  assert.throws(() => intersectPrefixes(['10x']), /binary prefix/);
});

test('union removes containment, folds siblings recursively, and defaults to the whole-set identity rules', () => {
  assert.deepEqual(unionPrefixes([]), []);
  assert.deepEqual(unionPrefixes(['10', '101', '10']), ['10']);
  assert.deepEqual(unionPrefixes(['100', '101']), ['10']);
  assert.deepEqual(unionPrefixes(['1011', '1000', '1010', '1001']), ['10']);
  assert.deepEqual(unionPrefixes(['100', '001']), ['001', '100']);
  assert.deepEqual(unionPrefixes(['101', '', '001']), ['']);
  assert.deepEqual(unionPrefixes(CANTOR_PREFIXES), ['']);
  assert.deepEqual(selectCantor(weights('100', '101')).result, ['10']);
  assert.equal(selectCantor(weights('100', '001')).formula, 'C(001) ∪ C(100)');
  assert.equal(selectCantor(weights('0', '1')).formula, 'C(∅) = C');
  assert.equal(selectCantor(weights()).kind, 'idle');
  // The empty-set key is neutral for union and absorbing for intersection.
  assert.deepEqual(selectCantor(weights('101', null)).result, ['101']);
  assert.equal(selectCantor(weights(null)).kind, 'empty');
  assert.deepEqual(selectCantor(weights('101', null), 'intersection').result, []);
  assert.throws(() => unionPrefixes(['102']), /binary prefix/);
  assert.throws(() => selectCantor(weights('1'), 'difference'), /operation/);
});

test('every depth-4 leaf subset reduces to an equivalent maximal disjoint cover', () => {
  const leaves = cantorLevel(4).map(({ prefix }) => prefix);
  for (let mask = 0; mask < 2 ** leaves.length; mask++) {
    const selected = leaves.filter((_, i) => mask & (1 << i));
    const cover = unionPrefixes(selected);
    const reconstructed = leaves.reduce((bits, leaf, i) => bits | (cover.some(prefix => leaf.startsWith(prefix)) ? 1 << i : 0), 0);
    assert.equal(reconstructed, mask);
    for (const prefix of cover) {
      assert.ok(!cover.some(other => other !== prefix && prefix.startsWith(other)));
      assert.ok(!prefix || !cover.includes(prefix.slice(0, -1) + (prefix.endsWith('0') ? '1' : '0')));
    }
  }
});

test('all mapped pairwise intersections agree with membership at a common refinement', () => {
  const leaves = cantorLevel(5).map(({ prefix }) => prefix);
  for (const a of CANTOR_PREFIXES) for (const b of CANTOR_PREFIXES) {
    const intersection = intersectPrefixes([a, b]);
    assert.equal(intersection, intersectPrefixes([b, a]));
    assert.deepEqual(leaves.filter(p => p.startsWith(a) && p.startsWith(b)), leaves.filter(p => intersection !== null && p.startsWith(intersection)));
  }
});

test('ternary intervals remove the middle third and preserve endpoints', () => {
  assert.deepEqual(prefixInterval(''), { start: 0, end: 1, numerator: 0, denominator: 1 });
  assert.deepEqual(prefixInterval('101'), { start: 20 / 27, end: 21 / 27, numerator: 20, denominator: 27 });
  for (const { prefix, start, end, denominator } of cantorLevel(4)) {
    const a = prefixInterval(prefix + '0'), b = prefixInterval(prefix + '1');
    assert.equal(a.start, start); assert.equal(b.end, end);
    assert.equal(a.denominator, denominator * 3);
    assert.ok(a.end < b.start);
  }
  assert.equal(cantorLevel(4).length, 16);
});

test('selection is idempotent and shares input ownership, sustain, release, and clear', () => {
  const instrument = new Instrument(CANTOR_STATE_SIZE), index = s => CANTOR_PREFIXES.indexOf(s);
  assert.equal(cantorSelection(instrument.exponents).kind, 'idle');
  instrument.press(index('10'), 'KeyY', 0);
  instrument.press(index('101'), 'KeyD', 0);
  const selection = cantorSelection(instrument.exponents);
  assert.equal(selection.result[0], '101');
  instrument.tick(5000);
  assert.deepEqual(cantorSelection(instrument.exponents), selection);
  instrument.setSustain(true); instrument.release('KeyD');
  assert.equal(cantorSelection(instrument.exponents).result[0], '101');
  instrument.setSustain(false);
  assert.equal(cantorSelection(instrument.exponents).result[0], '10');
  instrument.press(index('001'), 'pointer-1', 5001);
  assert.equal(cantorSelection(instrument.exponents).kind, 'empty');
  instrument.release('pointer-1');
  assert.equal(cantorSelection(instrument.exponents).result[0], '10');
  instrument.clear();
  assert.equal(cantorSelection(instrument.exponents).kind, 'idle');
  instrument.press(index(''), 'KeyQ', 6000);
  assert.equal(cantorSelection(instrument.exponents).kind, 'cylinder');
  assert.equal(cantorSelection(instrument.exponents).result[0], '');
});

test('diagram and readout depend only on the intersection for every pair and larger chords', t => {
  const originalDpr = Object.getOwnPropertyDescriptor(globalThis, 'devicePixelRatio');
  Object.defineProperty(globalThis, 'devicePixelRatio', { value: 1, configurable: true });
  t.after(() => {
    if (originalDpr) Object.defineProperty(globalThis, 'devicePixelRatio', originalDpr);
    else delete globalThis.devicePixelRatio;
  });

  // Capture the real renderer's drawing commands, including colors, shadows,
  // outlines and projected fragments. Equivalent sets must draw identically.
  const render = (prefixes, operation = 'intersection') => {
    const state = selectCantor(weights(...prefixes), operation);
    const commands = [];
    const gradient = { addColorStop: (...args) => commands.push(['colorStop', ...args]) };
    const context = new Proxy({}, {
      set: (_, name, value) => { commands.push([name, value === gradient ? 'gradient' : value]); return true; },
      get: (_, name) => (...args) => { commands.push([name, ...args]); if (name === 'createLinearGradient') return gradient; },
    });
    const canvas = { clientWidth: 1000, getContext: () => context };
    CantorView.prototype.draw.call({ canvas, state });
    return { commands, formula: state.formula };
  };
  const empty = { ...render([]), formula: '∅' };
  const singles = new Map(CANTOR_PREFIXES.map(prefix => [prefix, render([prefix])]));
  for (const a of CANTOR_PREFIXES) for (const b of CANTOR_PREFIXES) {
    const result = intersectPrefixes([a, b]);
    assert.deepEqual(render([a, b]), result === null ? empty : singles.get(result), `${a}, ${b}`);
  }
  assert.deepEqual(render(['', '1', '10', '101', '1010']), singles.get('1010'));
  assert.deepEqual(render(['', '1', '10', '101', '001']), empty);
  assert.deepEqual(render(CANTOR_PREFIXES), empty);
  for (const prefix of CANTOR_PREFIXES) assert.deepEqual(render([prefix, null]), empty);
  assert.deepEqual(render([null]), empty);
  assert.equal(singles.get('101').formula, 'C(101)');
  assert.equal(singles.get('').formula, 'C(∅) = C');
  for (const a of CANTOR_PREFIXES) for (const b of CANTOR_PREFIXES) {
    assert.deepEqual(render([a, b], 'union'), render(unionPrefixes([a, b]), 'union'));
  }
  assert.deepEqual(render(['100', '101'], 'union'), render(['10']));
  assert.deepEqual(render(cantorLevel(4).map(({ prefix }) => prefix), 'union'), render(['']));
  assert.notDeepEqual(render(['100', '001'], 'union').commands, empty.commands);
});

test('changing the operation redraws the same held inputs, including while paused', () => {
  const canvas = { setAttribute() {} }, view = Object.create(CantorView.prototype);
  let draws = 0;
  Object.assign(view, { canvas, signature: '', draw() { draws++; } });
  const held = weights('10', '101');
  assert.deepEqual(view.update(held, 'union').result, ['10']);
  assert.deepEqual(view.update(held, 'intersection').result, ['101']);
  view.update(held, 'intersection');
  assert.equal(draws, 2);
  assert.deepEqual(view.update(held).result, ['10']);
  assert.equal(draws, 3);
});

test('all Cantor keys retain source ownership, sustain and release', () => {
  const instrument = new Instrument(CANTOR_STATE_SIZE);
  for (const { index, code, prefix } of CANTOR_KEYS) {
    instrument.clear(); instrument.press(index, code, 0);
    assert.deepEqual(cantorSelection(instrument.exponents).result, prefix === null ? [] : [prefix]);
    assert.equal(instrument.exponents[index], 1);
  }
  instrument.clear();
  instrument.press(30, 'Period', 0); instrument.press(30, 'pointer-1', 0);
  instrument.release('Period');
  assert.equal(cantorSelection(instrument.exponents).result[0], '1111');
  instrument.setSustain(true); instrument.release('pointer-1');
  assert.equal(cantorSelection(instrument.exponents).result[0], '1111');
  instrument.setSustain(false);
  assert.equal(cantorSelection(instrument.exponents).kind, 'idle');
});
