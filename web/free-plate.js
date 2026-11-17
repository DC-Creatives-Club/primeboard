import { resonanceSpec } from './resonator.js';

export function decodeFreePlate(buffer, metadata) {
  if (buffer.byteLength < 16 || new TextDecoder().decode(new Uint8Array(buffer, 0, 8)) !== 'PPLATE01') throw new Error('Invalid free-plate data.');
  const header = new DataView(buffer), size = header.getUint32(8, true), count = header.getUint32(12, true);
  if (size < 3 || size > 512 || count !== 26 || metadata.gridSize !== size || metadata.modeCount !== count
      || buffer.byteLength !== 16 + 4 * size * size * count
      || metadata.frequenciesHz?.length !== count || metadata.frequenciesHz.some(f => !Number.isFinite(f) || f <= 0)
      || metadata.eigenvalues?.length !== count || metadata.eigenvalues.some(v => !Number.isFinite(v) || v <= 0)) throw new Error('Incomplete free-plate data.');
  const fields = new Float32Array(buffer, 16);
  if (fields.some(v => !Number.isFinite(v))) throw new Error('Invalid plate shapes.');
  const spec = resonanceSpec(metadata.frequenciesHz);
  spec.fundamentalHz = metadata.frequenciesHz[0];
  return { size, fields, metadata, spec };
}

export function sampleFreePlate(data, mode, x, y) {
  const n = data.size, u = Math.max(0, Math.min(1, x)) * (n - 1), v = Math.max(0, Math.min(1, y)) * (n - 1);
  const i = Math.min(n - 2, Math.floor(u)), j = Math.min(n - 2, Math.floor(v)), a = u - i, b = v - j;
  const at = (dx, dy) => data.fields[mode * n * n + (j + dy) * n + i + dx];
  return (1 - b) * ((1 - a) * at(0, 0) + a * at(1, 0)) + b * ((1 - a) * at(0, 1) + a * at(1, 1));
}
