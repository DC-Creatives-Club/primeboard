import { KEYS, validateExponents } from './color.js';

// An orthonormal real basis on the unit square, for a simply supported,
// isotropic Kirchhoff–Love plate. Diagonal modes are sine products; each
// off-diagonal pair is rotated into symmetric and antisymmetric modes.
const candidates = [];
for (let m = 1; m <= 8; m++) {
  for (let n = m; n <= 8; n++) {
    for (const sign of m === n ? [0] : [1, -1]) {
      candidates.push({ m, n, sign, eigenvalue: m * m + n * n });
    }
  }
}
candidates.sort((a, b) => a.eigenvalue - b.eigenvalue || a.m - b.m || b.sign - a.sign);
export const MODES = Object.freeze(candidates.slice(0, KEYS.length).map((mode, index) => Object.freeze({
  ...mode, index, label: `(${mode.m},${mode.n})${mode.sign ? (mode.sign > 0 ? ' +' : ' −') : ''}`,
})));

export function modeShape(mode, x, y) {
  const { m, n, sign } = mode;
  const a = Math.sin(m * Math.PI * x) * Math.sin(n * Math.PI * y);
  return sign ? Math.SQRT2 * (a + sign * Math.sin(n * Math.PI * x) * Math.sin(m * Math.PI * y)) : 2 * a;
}

export function modeGradient(mode, x, y) {
  const { m, n, sign } = mode;
  const scale = sign ? Math.SQRT2 * Math.PI : 2 * Math.PI;
  return [
    scale * (m * Math.cos(m * Math.PI * x) * Math.sin(n * Math.PI * y) + sign * n * Math.cos(n * Math.PI * x) * Math.sin(m * Math.PI * y)),
    scale * (n * Math.sin(m * Math.PI * x) * Math.cos(n * Math.PI * y) + sign * m * Math.sin(n * Math.PI * x) * Math.cos(m * Math.PI * y)),
  ];
}

// Smooth distance-to-node approximation. This is a drawing of each mode's
// own zero set, not a model of grains migrating on a driven plate.
export function nodeStrength(mode, x, y, width = .005) {
  const distance = Math.abs(modeShape(mode, x, y)) / Math.max(2, Math.hypot(...modeGradient(mode, x, y)));
  return Math.exp(-((distance / width) ** 2));
}

// Distinct equal-tempered frequencies make the infinite-time cross terms
// vanish. This is mean squared displacement, NOT local mechanical energy.
export function meanSquaredDisplacement(exponents, x, y) {
  validateExponents(exponents);
  return exponents.reduce((sum, e, i) => sum + .5 * e * modeShape(MODES[i], x, y) ** 2, 0);
}

export function modalDisplacement(exponents, x, y, seconds, slowdown = 200) {
  validateExponents(exponents);
  return exponents.reduce((sum, e, i) => sum + Math.sqrt(e) * modeShape(MODES[i], x, y) * Math.cos(2 * Math.PI * KEYS[i].audioHz * seconds / slowdown), 0);
}
