import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeModes } from '../web/modes.js';
import { Resonator, resonanceSpec } from '../web/resonator.js';

const bytes=readFileSync(new URL('../web/data/modes/rounded-shell.bin',import.meta.url));
const metadata=JSON.parse(readFileSync(new URL('../web/data/modes/rounded-shell.json',import.meta.url)));
const buffer=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);
const data=decodeModes(buffer,metadata), N=data.vertexCount;
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('shell asset has intact vector modes, physical dimensions, and consistent natural frequencies',()=>{
  assert.equal(createHash('sha256').update(bytes).digest('hex'),metadata.sha256);
  assert.equal(data.displacements.length,N*26*3);
  close(metadata.geometry.outerWidthM,.2); close(metadata.geometry.outerCornerRadiusM,.03);
  close(metadata.geometry.midSurfaceWidthM+metadata.geometry.thicknessM,.2);
  assert.equal(metadata.material.youngModulusPa,69e9);
  assert.equal(metadata.material.densityKgM3,2700);
  for(let j=0;j<26;j++){
    close(metadata.frequenciesHz[j],Math.sqrt(data.eigenvalues[j])/(2*Math.PI),1e-8);
    if(j)assert.ok(data.eigenvalues[j]>=data.eigenvalues[j-1]);
  }
  assert.throws(()=>decodeModes(buffer.slice(0,-4),metadata));
  assert.throws(()=>decodeModes(buffer,{...metadata,frequenciesHz:Array(26).fill(-1)}));
});

test('displayed shell fields are normal projections of normalized vector displacements',()=>{
  const area=data.mass.reduce((s,a)=>s+a,0);
  for(let j=0;j<26;j++){
    let mean=0;
    for(let i=0;i<N;i++){
      let normal=0,mag=0;
      for(let k=0;k<3;k++){
        const u=data.displacements[3*(j*N+i)+k];
        normal+=u*data.normals[3*i+k];mag+=u*u;
      }
      close(normal,data.modes[j*N+i]);mean+=mag*data.mass[i];
    }
    close(mean/area,1);
  }
});

test('shipped shell solve passed rigid motion, equilibrium, benchmark, and refinement checks',()=>{
  const d=metadata.diagnostics;
  assert.equal(d.rigidBodyCount,6);
  assert.ok(d.maxRigidBodyResidual<1e-10);
  assert.ok(d.maxRelativeEigenResidual<1e-5);
  assert.ok(d.maxMassOrthogonalityError<1e-8);
  assert.ok(d.simplySupportedPlate.maxRelativeFrequencyError<.025);
  assert.ok(d.refinement.vertices>N);
  assert.ok(d.refinement.maxRelativeFrequencyChange<.03);
  assert.equal(d.refinement.relativeFrequencyChanges.length,26);
  assert.ok(d.normalDisplacementRMS.every(x=>x>0 && x<=1.00001));
});

test('cube sound uses shell frequencies rather than Laplacian ratios or a retuned fundamental',()=>{
  const spec=resonanceSpec(metadata.frequenciesHz,Array.from({length:26},(_,i)=>data.modes.subarray(i*N,(i+1)*N)));
  spec.fundamentalHz=metadata.frequenciesHz[0];
  const bank=new Resonator(spec);
  bank.omega.forEach((w,i)=>close(w/(2*Math.PI),metadata.frequenciesHz[i],1e-8));
});
