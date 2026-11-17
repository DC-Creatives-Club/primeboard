import { FUNDAMENTAL_HZ } from './resonator.js';

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
