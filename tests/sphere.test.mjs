import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { decodeModes } from '../web/modes.js';
import { CubeView } from '../web/cube-view.js';

function load(name) {
  const raw=readFileSync(new URL(`../web/data/modes/${name}.bin`,import.meta.url));
  const meta=JSON.parse(readFileSync(new URL(`../web/data/modes/${name}.json`,import.meta.url)));
  assert.equal(createHash('sha256').update(raw).digest('hex'),meta.sha256);
  return decodeModes(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),meta);
}
const scalar=load('sphere-scalar'),shell=load('sphere-shell');
const close=(a,b,tol=1e-5)=>assert.ok(Math.abs(a-b)<tol,`${a} != ${b}`);

test('sphere assets have closed outward meshes on a unit sphere',()=>{
  for(const data of [scalar,shell]) {
    const edges=new Map();
    for(let i=0;i<data.vertexCount;i++) {
      const p=data.positions.subarray(i*3,i*3+3),n=data.normals.subarray(i*3,i*3+3);
      close(Math.hypot(...p),1);for(let d=0;d<3;d++)close(p[d],n[d]);
    }
    for(let f=0;f<data.indices.length;f+=3) {
      const ids=[...data.indices.subarray(f,f+3)];
      for(let j=0;j<3;j++) {const a=ids[j],b=ids[(j+1)%3],key=[Math.min(a,b),Math.max(a,b)].join(',');edges.set(key,(edges.get(key)||0)+1);}
      const [a,b,c]=ids.map(i=>data.positions.subarray(3*i,3*i+3));
      const u=b.map((v,d)=>v-a[d]),v=c.map((w,d)=>w-a[d]);
      assert.ok((u[1]*v[2]-u[2]*v[1])*a[0]+(u[2]*v[0]-u[0]*v[2])*a[1]+(u[0]*v[1]-u[1]*v[0])*a[2]>0);
    }
    assert.ok([...edges.values()].every(n=>n===2));
    assert.equal(data.vertexCount-edges.size+data.faceCount,2);
  }
});

test('scalar harmonics have exact degree eigenvalues and independent normalized fields',()=>{
  const area=scalar.mass.reduce((s,v)=>s+v,0),N=scalar.vertexCount;
  scalar.metadata.harmonicIndices.forEach(([l,m],j)=>{
    assert.equal(scalar.eigenvalues[j],l*(l+1));assert.ok(Math.abs(m)<=l);
    assert.equal(scalar.metadata.labels[j],`(${l},${m})`);
    for(let k=0;k<=j;k++) {
      let integral=0;for(let i=0;i<N;i++)integral+=scalar.modes[j*N+i]*scalar.modes[k*N+i]*scalar.mass[i]/area;
      close(integral,j===k?1:0,.01);
    }
  });
  // Y_1^0 = sqrt(3) z under area-average normalization.
  for(let i=0;i<N;i++)close(scalar.modes[i],Math.sqrt(3)*scalar.positions[3*i+2],1e-6);
});

test('sphere shell passes rigid, equilibrium, convergence and analytical checks',()=>{
  const m=shell.metadata,d=m.diagnostics;
  close(m.geometry.outerDiameterM,.2);close(m.geometry.midSurfaceRadiusM,.0995);close(m.geometry.thicknessM,.001);
  assert.equal(d.rigidBodyCount,6);assert.ok(d.maxRigidBodyResidual<1e-10);
  assert.ok(d.maxRelativeEigenResidual<1e-5);assert.ok(d.maxMassOrthogonalityError<1e-8);
  assert.ok(d.refinement.maxRelativeFrequencyChange<.01);
  assert.ok(d.maxRelativeAnalyticalFrequencyError<.01);
  assert.ok(d.normalDisplacementRMS.every(v=>v>.1));
  const N=shell.vertexCount,area=shell.mass.reduce((s,v)=>s+v,0);
  for(let j=0;j<26;j++) {
    close(m.frequenciesHz[j],Math.sqrt(shell.eigenvalues[j])/(2*Math.PI),1e-8);
    let norm=0;
    for(let i=0;i<N;i++) {
      let dot=0;
      for(let k=0;k<3;k++) {const v=shell.displacements[(j*N+i)*3+k];dot+=v*shell.normals[3*i+k];norm+=v*v*shell.mass[i]/area;}
      close(dot,shell.modes[j*N+i],1e-6);
    }
    close(norm,1,1e-6);
  }
});

test('switching sphere and cube models preserves key weights and selects correct pitches',()=>{
  const view=Object.create(CubeView.prototype);
  view.models={'sphere:scalar':scalar,'sphere:elastic':shell,'cube:scalar':load('rounded-cube'),'cube:elastic':load('rounded-shell')};
  view.exponents=Array(26).fill(0);view.exponents[3]=2.5;view.interaction='strike';
  for(const shape of ['sphere','cube','sphere'])for(const model of ['scalar','elastic']) {
    view.setModel(model,shape);
    assert.equal(view.shape,shape);assert.equal(view.model,model);
    assert.deepEqual(view.bank.weights,view.exponents);
    const fundamental=view.spec.fundamentalHz??110;
    view.spec.ratios.forEach((r,i)=>close(fundamental*r,model==='elastic'?view.data.metadata.frequenciesHz[i]:110*view.data.eigenvalues[i]/view.data.eigenvalues[0],1e-8));
  }
});
