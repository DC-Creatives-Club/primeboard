import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeModes, modalWeights, mixSurface } from '../web/modes.js';

const bytes = readFileSync(new URL('../web/data/modes/rounded-cube.bin', import.meta.url));
const metadata = JSON.parse(readFileSync(new URL('../web/data/modes/rounded-cube.json', import.meta.url)));
const buffer = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
const data = decodeModes(buffer, metadata);
const { vertexCount: N, positions: p, normals, indices, modes, mass, eigenvalues } = data;
const point = i => [...p.slice(3 * i, 3 * i + 3)];
const sub = (a, b) => a.map((x, i) => x - b[i]);
const dot = (a, b) => a.reduce((s, x, i) => s + x * b[i], 0);
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const close = (a, b, tolerance = 1e-6) => assert.ok(Math.abs(a-b) < tolerance, `${a} != ${b}`);

// Reassemble the FEM operators from the shipped float32 mesh, independently of
// the Python generator. This checks the actual browser asset, not just metadata.
const edges = new Map(), weights = [], computedMass = new Float64Array(N);
let outward = true;
for (let t = 0; t < indices.length; t += 3) {
  const face = [...indices.slice(t, t + 3)], v = face.map(point);
  const normal = cross(sub(v[1], v[0]), sub(v[2], v[0]));
  const twiceArea = Math.hypot(...normal);
  outward &&= dot(normal, v[0]) > 0;
  for (let i = 0; i < 3; i++) {
    computedMass[face[i]] += twiceArea / 6;
    const j = (i + 1) % 3, k = (i + 2) % 3;
    const a = face[j], b = face[k];
    const key = a < b ? `${a},${b}` : `${b},${a}`;
    const entry = edges.get(key) || { count: 0, orientation: 0 };
    entry.count++; entry.orientation += a < b ? 1 : -1; edges.set(key, entry);
    weights.push([a, b, dot(sub(v[j],v[i]), sub(v[k],v[i])) / twiceArea / 2]);
  }
}

test('surface asset is intact and rejects truncated or invalid data', () => {
  assert.equal(createHash('sha256').update(bytes).digest('hex'), metadata.sha256);
  assert.throws(() => decodeModes(buffer.slice(0, 12), metadata));
  assert.throws(() => decodeModes(buffer.slice(0, -4), metadata));
  assert.throws(() => decodeModes(buffer, { ...metadata, modeCount: 25 }));
});

test('rounded cube is a closed, outward-oriented surface with welded seams', () => {
  assert.ok(outward);
  for (const edge of edges.values()) { assert.equal(edge.count, 2); assert.equal(edge.orientation, 0); }
  assert.equal(N - edges.size + data.faceCount, 2);
  const patches = [0, 0, 0, 0];
  const { innerHalfExtent: a, roundingRadius: r } = metadata.geometry;
  for (let i = 0; i < N; i++) {
    const v = point(i), d = v.map(x => x - Math.max(-a, Math.min(a, x)));
    close(Math.hypot(...d), r);
    const n = [...normals.slice(3 * i, 3 * i + 3)];
    close(Math.hypot(...n), 1);
    d.forEach((x, j) => close(n[j], x / r));
    patches[d.filter(x => Math.abs(x) > 1e-6).length]++;
    close(mass[i], computedMass[i], 1e-8);
    assert.ok(mass[i] > 0);
  }
  assert.ok(patches[1] && patches[2] && patches[3], 'planar, cylindrical, and spherical patches exist');
  assert.ok(metadata.diagnostics.relativeAreaError < .001);
});

test('exported modes satisfy the generalized eigenproblem and area orthonormality', () => {
  const area = mass.reduce((s,x) => s+x, 0);
  let maxResidual = 0;
  for (let mode = 0; mode < 26; mode++) {
    if (mode) assert.ok(eigenvalues[mode] >= eigenvalues[mode - 1] - 1e-10);
    const u = modes.subarray(mode*N, (mode+1)*N), Ku = new Float64Array(N);
    for (const [a,b,w] of weights) { const force = w*(u[a]-u[b]); Ku[a] += force; Ku[b] -= force; }
    let residual = 0, reference = 0, mean = 0;
    for (let i = 0; i < N; i++) {
      const rhs = eigenvalues[mode]*computedMass[i]*u[i];
      residual += (Ku[i]-rhs)**2; reference += rhs**2; mean += mass[i]*u[i];
    }
    maxResidual = Math.max(maxResidual, Math.sqrt(residual/reference));
    close(mean/area, 0, 1e-6);
    for (let other = 0; other <= mode; other++) {
      let inner = 0;
      for (let i = 0; i < N; i++) inner += mass[i]*u[i]*modes[other*N+i];
      close(inner/area, mode === other ? 1 : 0, 1e-6);
    }
  }
  assert.ok(maxResidual < 2e-4, `float32 relative residual ${maxResidual}`);
});

test('solver passes mesh refinement and the analytical unit-sphere spectrum', () => {
  assert.ok(metadata.diagnostics.refinement.vertices > 3*N);
  assert.ok(metadata.diagnostics.refinement.maxRelativeEigenvalueChange < .01);
  assert.ok(metadata.diagnostics.unitSphereMaxRelativeEigenvalueError < .01);
});

test('bending displacement gives modal energy proportional to the exponents', () => {
  const exponents = Array.from({length:26}, (_,i) => i+1);
  const weights = modalWeights(exponents, eigenvalues);
  weights.forEach((w,i) => close((w*eigenvalues[i]/eigenvalues[0])**2, exponents[i]));
  assert.throws(() => modalWeights(Array(26).fill(-1), eigenvalues));
});

test('single-mode nodes stay fixed; mixtures interfere; clearing erases the field', () => {
  const e = Array(26).fill(0); e[5] = 1;
  const a = mixSurface(data,e,0), b = mixSurface(data,e,.2);
  for (let i=0;i<N;i++) { close(a[2*i],b[2*i]); close(a[2*i],modes[5*N+i]); }
  assert.notDeepEqual(a,b);
  e[5] = 4;
  const stronger = mixSurface(data,e,0);
  for (let i=0;i<N;i++) { close(stronger[2*i],a[2*i]); close(stronger[2*i+1],2*a[2*i+1]); }
  e[2] = 1;
  const mixed = mixSurface(data,e,0), later = mixSurface(data,e,.2);
  assert.ok(mixed.some((x,i) => i%2===0 && Math.abs(x-later[i])>.01));
  e.fill(0); mixSurface(data,e,10,mixed); assert.ok(mixed.every(x=>x===0));
});
