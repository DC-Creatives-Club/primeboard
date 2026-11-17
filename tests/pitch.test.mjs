import test from 'node:test';
import assert from 'node:assert/strict';
import { loweredPitch } from '../web/pitch.js';
import { Resonator } from '../web/resonator.js';

test('octave shift changes audio frequencies without changing physical model or ratios', () => {
  const spec = { fundamentalHz: 5907, ratios: [1, 1.3], strikes: [[1,0],[0,1]], pickup: [1,1] };
  for (const octaves of [2,3]) {
    const shifted = loweredPitch(spec, octaves);
    assert.equal(shifted.fundamentalHz,5907 / 2 ** octaves);
    assert.equal(shifted.ratios,spec.ratios);
    assert.equal(loweredPitch(spec,octaves),shifted);
    const bank = new Resonator(shifted);
    bank.omega.forEach((omega,i)=>assert.ok(Math.abs(omega/(2*Math.PI)-5907*spec.ratios[i]/2**octaves)<1e-9));
  }
  assert.equal(spec.fundamentalHz,5907);
  assert.equal(loweredPitch(spec,0),spec);
  assert.equal(loweredPitch(null,0),null);
  assert.throws(()=>loweredPitch(spec,1),RangeError);
});
