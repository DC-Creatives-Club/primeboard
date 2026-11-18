import { FUNDAMENTAL_HZ } from './resonator.js';

export const NOTE_NAMES = Object.freeze(['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B']);
export const SCALES = Object.freeze({
  major: Object.freeze({ name: 'major', intervals: Object.freeze([0, 2, 4, 5, 7, 9, 11]) }),
  minor: Object.freeze({ name: 'natural minor', intervals: Object.freeze([0, 2, 3, 5, 7, 8, 10]) }),
  'major-pentatonic': Object.freeze({ name: 'major pentatonic', intervals: Object.freeze([0, 2, 4, 7, 9]) }),
  'minor-pentatonic': Object.freeze({ name: 'minor pentatonic', intervals: Object.freeze([0, 3, 5, 7, 10]) }),
});
export const NOTE_APPROXIMATION_CENTS = 5;
export const SCALE_TOLERANCE_CENTS = 25;

// Labels and guide membership describe the supplied frequency; never retune it.
export function describePitch(frequency) {
  if (!Number.isFinite(frequency) || frequency <= 0) return null;
  const position = 69 + 12 * Math.log2(frequency / 440);
  if (!Number.isFinite(position)) return null;
  const midi = Math.round(position), pitchClass = ((midi % 12) + 12) % 12;
  const cents = 100 * (position - midi), octave = Math.floor(midi / 12) - 1;
  const note = NOTE_NAMES[pitchClass] + octave;
  const approximate = Math.abs(cents) > NOTE_APPROXIMATION_CENTS + 1e-9;
  const roundedCents = Math.round(cents * 10) / 10;
  const offset = `${roundedCents > 0 ? '+' : roundedCents < 0 ? '−' : ''}${Math.abs(roundedCents).toFixed(1)} cents`;
  const hz = Number(frequency.toFixed(3));
  return { frequency, midi, pitchClass, cents, note, approximate,
    label: `${approximate ? '≈' : ''}${note}`,
    detail: `${hz} Hz · nearest ${note} · ${offset}` };
}

export function matchesScale(pitch, root, scale) {
  if (scale === 'off') return false;
  if (!Number.isInteger(root) || root < 0 || root > 11 || !Object.hasOwn(SCALES, scale)) throw new RangeError('Unknown scale or root.');
  return Boolean(pitch && Math.abs(pitch.cents) <= SCALE_TOLERANCE_CENTS + 1e-9
    && SCALES[scale].intervals.includes((pitch.pitchClass - root + 12) % 12));
}

const cache = new WeakMap();
// Audio-only copy: preserve the physical model and stable identity for scheduling.
export function loweredPitch(spec, octaves) {
  if (![0, 2, 3].includes(octaves)) throw new RangeError('Unsupported octave shift.');
  if (!spec || !octaves) return spec;
  let variants = cache.get(spec);
  if (!variants) { variants = new Map(); cache.set(spec, variants); }
  if (!variants.has(octaves)) variants.set(octaves, { ...spec, fundamentalHz: (spec.fundamentalHz ?? FUNDAMENTAL_HZ) / 2 ** octaves });
  return variants.get(octaves);
}
