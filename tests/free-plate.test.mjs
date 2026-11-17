import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { decodeFreePlate, sampleFreePlate } from '../web/free-plate.js';
const raw = await readFile(new URL('../web/data/modes/free-plate.bin', import.meta.url));
const metadata = JSON.parse(await readFile(new URL('../web/data/modes/free-plate.json', import.meta.url)));
const buffer = raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength);
const data = decodeFreePlate(buffer, metadata);

test('free-plate asset is intact and uses calculated frequencies for sound', () => {
  assert.equal(createHash('sha256').update(raw).digest('hex'), metadata.sha256);
  assert.equal(metadata.geometry.widthM, .2);
  assert.equal(metadata.geometry.thicknessM, .001);
  assert.ok(Math.abs(metadata.massKg - .108) < 1e-12);
  metadata.frequenciesHz.forEach((f,i) => {
    assert.ok(Math.abs(f - Math.sqrt(metadata.eigenvalues[i]) / (2*Math.PI)) < 1e-8);
    assert.ok(Math.abs(f - data.spec.fundamentalHz * data.spec.ratios[i]) < 1e-8);
    if (i) assert.ok(f >= metadata.frequenciesHz[i-1]);
  });
  assert.throws(() => decodeFreePlate(buffer.slice(0,-4),metadata));
});

test('free plate passes rigid-motion, equilibrium, orthogonality and convergence checks', () => {
  const d=metadata.diagnostics;
  assert.equal(d.rigidBodyCount,3);
  assert.ok(d.maxRigidBodyResidual<1e-10);
  assert.ok(d.maxRelativeEigenResidual<1e-5);
  assert.ok(d.maxMassOrthogonalityError<1e-8);
  assert.ok(d.refinement.maxRelativeFrequencyChange<.025);
  assert.ok(d.simplySupportedBenchmark.maxRelativeFrequencyError<.01);
});

test('display interpolation retains normalized shapes and moving free edges', () => {
  const n=data.size;
  for(let mode=0;mode<26;mode++) {
    let norm=0,weight=0;
    for(let y=0;y<n;y++) for(let x=0;x<n;x++) {
      const w=(x===0||x===n-1?.5:1)*(y===0||y===n-1?.5:1);
      const value=sampleFreePlate(data,mode,x/(n-1),y/(n-1));
      assert.ok(Math.abs(value-data.fields[mode*n*n+y*n+x])<1e-6);
      norm+=w*value*value;weight+=w;
    }
    assert.ok(Math.abs(norm/weight-1)<1e-6);
  }
  assert.ok(Math.abs(sampleFreePlate(data,0,0,0))>.1, 'free corners must not be constrained to zero');
});

test('switching plate models preserves selected weights and all readouts render', async () => {
  const { ModeDisplay }=await import('../web/plate-display.js');
  const { parseCMF }=await import('../web/color.js');
  const rows=parseCMF(await readFile(new URL('../web/data/CIE_xyz_1931_2deg.csv',import.meta.url),'utf8'));
  const canvas={width:32,getContext:()=>({createImageData:(w,h)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:()=>{}}),setAttribute:()=>{}};
  const display=new ModeDisplay(canvas,rows), weights=Array(26).fill(0);weights[0]=2;weights[4]=1;
  display.freePlate=data;display.setState(weights,'nodes',1);
  const supported=display.fields[0].slice();
  display.setModel('free');
  assert.equal(display.modeLabel(0),'φ₁');
  assert.equal(display.spec.fundamentalHz,metadata.frequenciesHz[0]);
  assert.deepEqual(display.exponents,weights);
  assert.notDeepEqual(display.fields[0],supported);
  for(const readout of ['nodes','strength','field']) {
    display.setState(weights,readout,1);display.bank.advance(.1);display.draw();
    assert.ok(display.image.data.some((v,i)=>i%4!==3 && v>0));
  }
  display.setModel('supported');
  assert.equal(display.modeLabel(0),'(1,1)');
  assert.deepEqual(display.fields[0],supported);
  assert.deepEqual(display.exponents,weights);
});
