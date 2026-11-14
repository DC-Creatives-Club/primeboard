import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { C, KEYS, PRIMES, parseCMF, matchingAt, spectrumXYZ, primeProduct, decodeProduct, displayColor, chromaticity, xyzToLinearRGB, encodeSRGB } from '../web/color.js';
const bytes = readFileSync(new URL('../web/data/CIE_xyz_1931_2deg.csv', import.meta.url));
const rows = parseCMF(bytes.toString());
const empty = () => Array(KEYS.length).fill(0);
const close = (actual, expected, tolerance = 1e-10) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} ≠ ${expected}`);

test('unmodified official CIE data matches the published SHA-256 and reference rows', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), 'fa663e3535a7e0763a745993a1f0a192eb0275ac46ad2d1befd7626841e713c1');
  assert.deepEqual(matchingAt(555, rows), [0.5120501, 1, 0.005749999]);
  assert.deepEqual(matchingAt(479, rows), [0.1042979, 0.1334528, 0.8566193]);
  assert.throws(() => parseCMF('380,1,1,1'), /incomplete/);
});
test('CMFs interpolate linearly; boundaries are finite and out-of-range light is zero', () => {
  const a = matchingAt(555, rows), b = matchingAt(556, rows);
  matchingAt(555.25, rows).forEach((v, i) => close(v, a[i] * .75 + b[i] * .25));
  assert.deepEqual(matchingAt(359.99, rows), [0, 0, 0]);
  assert.deepEqual(matchingAt(830.01, rows), [0, 0, 0]);
  assert.ok(matchingAt(830, rows).every(Number.isFinite));
  assert.throws(() => matchingAt(NaN, rows));
});
test('keys increase in optical frequency and musical pitch, with exact endpoints', () => {
  close(KEYS[0].wavelength, 700); close(KEYS.at(-1).wavelength, 400);
  close(KEYS[0].frequencyTHz, C / 700 / 1000);
  close(KEYS[21].audioHz, 440); assert.equal(KEYS[21].note, 'A4');
  for (let i = 1; i < KEYS.length; i++) {
    assert.ok(KEYS[i].frequencyTHz > KEYS[i - 1].frequencyTHz);
    close(KEYS[i].audioHz / KEYS[i - 1].audioHz, 2 ** (1 / 12));
    close(KEYS[i].frequencyTHz / KEYS[i - 1].frequencyTHz, (700 / 400) ** (1 / 25));
  }
  assert.equal(new Set(PRIMES).size, 26);
});
test('empty product is 1, black, with undefined chromaticity', () => {
  assert.equal(primeProduct(empty()), 1n);
  const xyz = spectrumXYZ(empty(), rows);
  assert.deepEqual(xyz, [0, 0, 0]); assert.equal(chromaticity(xyz), null);
  assert.equal(displayColor(xyz).hex, '#000000');
});
test('multiplying integers adds their spectral powers and XYZ contributions', () => {
  const a = empty(), b = empty(); a[0] = 3; a[9] = 2; b[9] = 4; b[21] = 1;
  const sum = a.map((e, i) => e + b[i]);
  assert.equal(primeProduct(sum), primeProduct(a) * primeProduct(b));
  const xyzA = spectrumXYZ(a, rows), xyzB = spectrumXYZ(b, rows);
  spectrumXYZ(sum, rows).forEach((v, i) => close(v, xyzA[i] + xyzB[i]));
  assert.deepEqual(decodeProduct(primeProduct(sum).toString()), sum);
});
test('doubling weights doubles raw XYZ, preserves chromaticity, and increases displayed brightness', () => {
  const a = empty(); a[8] = 1; a[22] = 1;
  const xyz = spectrumXYZ(a, rows), double = spectrumXYZ(a.map(e => e * 2), rows);
  double.forEach((v, i) => close(v, 2 * xyz[i]));
  chromaticity(double).forEach((v, i) => close(v, chromaticity(xyz)[i]));
  const before = displayColor(xyz), after = displayColor(double);
  after.linear.forEach((v, i) => assert.ok(v >= before.linear[i]));
  assert.ok(Math.max(...after.linear) > Math.max(...before.linear));
});
test('exact products exceed Number precision and round-trip at maximum supported state', () => {
  const state = empty().fill(32), product = primeProduct(state);
  assert.ok(product > BigInt(Number.MAX_SAFE_INTEGER));
  assert.ok(product.toString().length < 1600);
  assert.deepEqual(decodeProduct(product.toString()), state);
});
test('number decoding rejects unsupported primes, malformed input, and excessive exponents', () => {
  for (const invalid of ['0', '-1', '2.5', '1e3', '0x10', '', '2 × 3', '123n', '9'.repeat(1601)]) assert.throws(() => decodeProduct(invalid));
  assert.throws(() => decodeProduct('103'), /outside/);
  assert.throws(() => decodeProduct((2n ** 33n).toString()), /exponents/);
  assert.deepEqual(decodeProduct(' 1 '), empty());
  assert.throws(() => primeProduct([1]));
  assert.throws(() => spectrumXYZ(empty().fill(0.5), rows));
});
test('D65 white converts to neutral sRGB; transfer function is standard', () => {
  xyzToLinearRGB([0.3127 / 0.329, 1, (1 - 0.3127 - 0.329) / 0.329]).forEach(v => close(v, 1));
  close(encodeSRGB(1), 1); close(encodeSRGB(0.003), 12.92 * .003);
  close(encodeSRGB(0.5), 0.7353569830524495);
});
test('single-line violet and maximum chords stay finite and bounded without altering XYZ', () => {
  for (const state of [empty().fill(32), ...KEYS.map((_, i) => { const e = empty(); e[i] = 1; return e; })]) {
    const xyz = spectrumXYZ(state, rows), saved = [...xyz];
    for (const exposure of [0, 0.125, 1, 32]) {
      const result = displayColor(xyz, exposure);
      assert.ok(result.rgb.every(v => Number.isInteger(v) && v >= 0 && v <= 255));
      assert.deepEqual(xyz, saved);
    }
  }
  assert.equal(displayColor(matchingAt(450, rows)).outOfGamut, true);
});
