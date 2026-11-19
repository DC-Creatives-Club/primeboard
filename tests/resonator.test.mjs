import test from 'node:test';
import assert from 'node:assert/strict';
import { Resonator, ModePulse, resonanceSpec, FUNDAMENTAL_HZ, DISPLAY_SLOWDOWN } from '../web/resonator.js';
import { plateResonanceSpec } from '../web/plate-modes.js';
const close = (a, b, tol = 1e-8) => assert.ok(Math.abs(a-b) < tol, `${a} != ${b}`);
const one = { ratios: [1], strikes: [[1]], pickup: [1] };

test('free strike matches the analytic damped oscillator and loses energy', () => {
  const bank = new Resonator(one);
  bank.setWeights([1], 'strike'); bank.setWeights([0], 'strike');
  const initialV = bank.v[0], gamma = bank.gamma[0], wd = bank.damped[0], w = bank.omega[0];
  let previous = .5 * initialV ** 2;
  for (let n = 1; n <= 100; n++) {
    bank.advance(.001);
    const t = n * .001;
    close(bank.q[0], initialV / wd * Math.exp(-gamma*t) * Math.sin(wd*t));
    const energy = .5 * (bank.v[0] ** 2 + w*w*bank.q[0] ** 2);
    assert.ok(energy < previous); previous = energy;
  }
  assert.ok(bank.energy > 0, 'release does not delete motion');
  bank.advance(10); assert.ok(bank.energy < 1e-40);
});

test('resonant drive solves the forced equation from rest, then rings on release', () => {
  const bank = new Resonator(one); bank.setWeights([4]);
  const w = bank.omega[0], g = bank.gamma[0], d = bank.damped[0];
  bank.advance(.123);
  close(bank.q[0], 2*Math.sin(w*.123) - 2*w/d*Math.exp(-g*.123)*Math.sin(d*.123));
  const q = bank.q[0], v = bank.v[0];
  bank.setWeights([0]); close(bank.q[0],q); close(bank.v[0],v);
  bank.advance(.05); assert.ok(bank.energy > 0);
  bank.reset(); assert.equal(bank.energy,0); assert.equal(bank.drive[0],0);
});

test('integration is independent of frame size and slowdown is uniform', () => {
  const a = new Resonator(one), b = new Resonator(one);
  a.setWeights([3]); b.setWeights([3]);
  a.advance(.2);
  for(let i=0;i<200;i++) b.advance(.001);
  close(a.q[0],b.q[0]); close(a.v[0],b.v[0],1e-6);
  const slow = new Resonator(one); slow.setWeights([3]);
  slow.advance(.2 * DISPLAY_SLOWDOWN / DISPLAY_SLOWDOWN);
  close(a.q[0],slow.q[0]); close(a.v[0],slow.v[0]);
});

test('each input excites only its labeled mode; driven modes build and release independently', () => {
  const spec = resonanceSpec([2,5], [[0,2,1], [3,-1,2]]);
  assert.deepEqual(spec.strikes, [[1,0],[0,1]]);
  const bank = new Resonator(spec); bank.setWeights([1,0], 'strike');
  assert.equal(bank.v[1],0);
  const pulse = new ModePulse(spec); pulse.setWeights([1,0]);
  assert.deepEqual([...pulse.q],[0,0]);
  pulse.advance(2); close(pulse.q[0], 1, .0001); assert.equal(pulse.q[1], 0);
  pulse.setWeights([1,1]); assert.equal(pulse.q[1], 0);
  pulse.advance(2); close(pulse.q[0], 1, .0001); close(pulse.q[1], 1, .0001);
  pulse.setWeights([0,0]); pulse.advance(1);
  assert.ok(pulse.q.every(q=>q < .007));
  pulse.advance(.5); assert.equal(pulse.energy,0);
});

test('plate frequencies preserve natural ratios and degeneracies; full chords stay finite', () => {
  const spec=plateResonanceSpec(), bank=new Resonator(spec);
  close(bank.omega[0]/(2*Math.PI),FUNDAMENTAL_HZ);
  close(spec.ratios[1],2.5); close(spec.ratios[1],spec.ratios[2]);
  bank.setWeights(Array(26).fill(32));
  let peak=0;
  for(let n=0;n<48000;n++) {bank.advance(1/48000); peak=Math.max(peak,Math.abs(bank.sample()));}
  assert.ok(Number.isFinite(peak) && peak>0);
  assert.ok([...bank.q,...bank.v].every(Number.isFinite));
});

test('audio worklet schedules notes on its audio clock and cancels future notes on reset', async () => {
  let Processor;
  globalThis.AudioWorkletProcessor = class { constructor(){ this.port={}; } };
  globalThis.registerProcessor = (_, p) => { Processor=p; };
  globalThis.sampleRate=48000;globalThis.currentTime=0;
  await import('../web/resonator-worklet.js');
  const processor=new Processor(), output=new Float32Array(128);
  const send=data=>processor.port.onmessage({data});
  send({type:'configure',spec:one,interaction:'strike'});
  send({type:'sequence',events:[{time:.001,weights:[1]},{time:.1,weights:[2]}]});
  processor.process([],[[output]]);
  assert.ok(output.slice(0,48).every(x=>x===0));
  assert.ok(output.slice(49).some(x=>Math.abs(x)>0));
  send({type:'reset'});globalThis.currentTime=.2;processor.process([],[[output]]);
  assert.ok(output.every(x=>x===0));assert.equal(processor.events.length,0);
});

test('a steady held driver approaches equilibrium rather than growing forever', () => {
  const pulse = new ModePulse(one), samples = [];
  pulse.setWeights([4]);
  for (let i = 0; i < 100; i++) { pulse.advance(.01); samples.push(pulse.q[0]); }
  assert.ok(samples[0] > 0 && samples[0] < .2);
  assert.ok(samples[9] > samples[0] && samples[9] < samples[49]);
  close(samples[99], 2, .01);
  pulse.advance(30); close(pulse.q[0], 2, 1e-8);
  const before = pulse.q[0];
  pulse.setWeights([0]); close(pulse.q[0], before);
  pulse.advance(.1); assert.ok(pulse.q[0] < before && pulse.q[0] > 0);
  pulse.advance(2); assert.equal(pulse.energy, 0);
});

test('display envelopes track the audio oscillator through buildup, retrigger, and ringdown', () => {
  const spec = resonanceSpec([1, 2.5]), display = new ModePulse(spec), audio = new Resonator(spec);
  const events = [[1,0], [1,4], [0,4], [2,4], [0,0]];
  for (const weights of events) {
    display.setWeights(weights); audio.setWeights(weights, 'drive');
    for (let frame = 0; frame < 15; frame++) {
      display.advance(1/30);
      for (let sample = 0; sample < 1600; sample++) audio.advance(1/48000);
      spec.ratios.forEach((ratio, i) => {
        const amplitude = ratio * Math.hypot(audio.q[i], audio.v[i] / audio.omega[i]);
        close(display.q[i], amplitude, .002);
      });
    }
  }
});

test('frozen inspection previews the steady response without changing the live oscillator', () => {
  const pulse = new ModePulse(one); pulse.setWeights([4]);
  assert.equal(pulse.q[0], 0);
  assert.equal(pulse.preview().q[0], 2);
  assert.equal(pulse.energy, 0);
  pulse.advance(.1); assert.ok(pulse.q[0] > 0 && pulse.q[0] < 2);
  pulse.reset(); assert.equal(pulse.preview().energy, 0);
});

test('fractional strength increases scale the existing tone without new impulses', () => {
  const bank = new Resonator({ratios:[1],strikes:[[1]],pickup:[1]});
  bank.setWeights([1],'strike'); bank.advance(.025);
  const q=bank.q[0],v=bank.v[0];
  bank.setWeights([1.21],'strike');
  close(bank.q[0],1.1*q);close(bank.v[0],1.1*v);
});
