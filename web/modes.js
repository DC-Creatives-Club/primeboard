// The numerical solve is offline. These routines only decode and mix its basis.
import { validateExponents } from './color.js';

export function decodeModes(buffer, metadata) {
  const header = new DataView(buffer);
  const magic = new TextDecoder().decode(new Uint8Array(buffer, 0, Math.min(8, buffer.byteLength)));
  const shell = magic === 'PSHELL01';
  if ((!shell && magic !== 'PCUBEV01') || buffer.byteLength < 24) throw new Error('Invalid surface-mode data.');
  const vertexCount = header.getUint32(8, true), faceCount = header.getUint32(12, true);
  const modeCount = header.getUint32(16, true);
  const expected = 24 + 4 * (vertexCount * (7 + modeCount * (shell ? 4 : 1)) + faceCount * 3);
  if (modeCount !== 26 || vertexCount < 4 || vertexCount > 100000 || expected !== buffer.byteLength
      || metadata.modeCount !== modeCount || metadata.eigenvalues.length !== modeCount
      || metadata.eigenvalues.some(v => !Number.isFinite(v) || v <= 0)) {
    throw new Error('Incomplete surface-mode data.');
  }
  let offset = 24;
  const floats = count => { const array = new Float32Array(buffer, offset, count); offset += count * 4; return array; };
  const positions = floats(vertexCount * 3), normals = floats(vertexCount * 3);
  const indices = new Uint32Array(buffer, offset, faceCount * 3); offset += faceCount * 12;
  const mass = floats(vertexCount), modes = floats(vertexCount * modeCount);
  const displacements = shell ? floats(vertexCount * modeCount * 3) : null;
  if (indices.some(i => i >= vertexCount) || positions.some(v => !Number.isFinite(v))
      || modes.some(v => !Number.isFinite(v))) throw new Error('Invalid surface mesh.');
  if (shell && (displacements.some(v => !Number.isFinite(v)) || metadata.frequenciesHz?.length !== modeCount
      || metadata.frequenciesHz.some(f => !(f > 0) || !Number.isFinite(f)))) throw new Error('Invalid shell mode data.');
  return { vertexCount, faceCount, modeCount, positions, normals, indices, mass, modes,
    eigenvalues: metadata.eigenvalues, displacements, metadata };
}

// In the scalar bending approximation omega_i is proportional to lambda_i.
// Dividing displacement by lambda_i makes e_i proportional to modal energy.
export function modalWeights(exponents, eigenvalues) {
  validateExponents(exponents);
  return exponents.map((e, i) => Math.sqrt(e) * eigenvalues[0] / eigenvalues[i]);
}

export function mixSurface(data, exponents, seconds, output = new Float32Array(data.vertexCount * 2)) {
  const weights = modalWeights(exponents, data.eigenvalues);
  const active = weights.reduce((n, w) => n + Number(w > 0), 0);
  const scale = Math.sqrt(weights.reduce((sum, w) => sum + w * w, 0)) || 1;
  output.fill(0);
  weights.forEach((weight, mode) => {
    if (!weight) return;
    const oscillation = Math.cos(2 * Math.PI * .18 * data.eigenvalues[mode] / data.eigenvalues[0] * seconds);
    // A single mode's nodal set is static, even at a zero-displacement instant.
    const contourWeight = weight * (active === 1 ? 1 : oscillation) / scale;
    const displacementWeight = weight * oscillation;
    const start = mode * data.vertexCount;
    for (let i = 0; i < data.vertexCount; i++) {
      output[2 * i] += contourWeight * data.modes[start + i];
      output[2 * i + 1] += displacementWeight * data.modes[start + i];
    }
  });
  return output;
}

// Dynamic field from a solved modal state. Normalize only the contour display;
// physical displacement and its decay remain unnormalized.
export function mixDynamicSurface(data, bank, output) {
  output.fill(0);
  const amplitudes = bank.q;
  const energetic = amplitudes.map((q, i) => Math.hypot(q, bank.v[i] / bank.omega[i]));
  const total = Math.hypot(...energetic);
  const live = [...energetic].flatMap((a, i) => a > Math.max(1e-7, total * 1e-5) ? [i] : []);
  const scale = Math.hypot(...amplitudes) || 1;
  for (let j = 0; j < data.modeCount; j++) {
    const contour = live.length === 1 ? (live[0] === j ? 1 : 0) : amplitudes[j] / scale;
    for (let i = 0; i < data.vertexCount; i++) {
      const shape = data.modes[j * data.vertexCount + i];
      output[2 * i] += contour * shape;
      output[2 * i + 1] += amplitudes[j] * shape;
    }
  }
  return output;
}
