import test from 'node:test';
import assert from 'node:assert/strict';
import { VideoExport, selectVideoFormat, videoExtension } from '../web/video-export.js';
import { exportTimeline, ExportClock, videoFrameTimes } from '../web/export-timeline.js';
import { renderModalSamples } from '../web/export-audio-worker.js';
import { Resonator, ModePulse, resonanceSpec } from '../web/resonator.js';
import { Instrument } from '../web/instrument.js';
import { PerformanceRecorder } from '../web/recording.js';
import { ChladniSand } from '../web/chladni-sand.js';

const weights = (index, value = 1, length = 32) => Array.from({ length }, (_, i) => i === index ? value : 0);
const take = { format: 'primeboard-performance', version: 2, duration: .1, frames: [
  { beat: .012, exponents: weights(3, 2), levels: weights(3, .4) },
  { beat: .018, exponents: weights(-1), levels: weights(-1) },
  { beat: .1, exponents: weights(-1), levels: weights(-1) },
] };

test('export uses continuous modal levels, integer tonal weights, and a shared decay tail', () => {
  const modal = exportTimeline(take, 'modes'), tonal = exportTimeline(take, 'light');
  assert.equal(modal.frames[0].weights[3], .4);
  assert.equal(tonal.frames[0].weights[3], 2);
  assert.equal(modal.frames[0].weights.length, 26);
  assert.equal(modal.duration, .7);
  const legacy = { ...take, version: 1, frames: take.frames.map(f => ({ ...f, exponents: f.exponents.slice(0,26), levels:f.levels.slice(0,26) })) };
  assert.equal(exportTimeline(legacy, 'cantor', 'intersection').frames[0].weights.length, 32);
});

test('Cantor export sound follows the selected operation, including empty-set input', () => {
  const exponents = weights(0); exponents[31] = 1;
  const recording = { ...take, frames: [{ beat: 0, exponents, levels: exponents }, take.frames.at(-1)] };
  assert.equal(exportTimeline(recording, 'cantor', 'intersection').frames[0].audio.some(Boolean), false);
  assert.equal(exportTimeline(recording, 'cantor', 'union').frames[0].audio[0], 1);
});

test('simulation applies sub-frame taps at exact times and bounds all simulation steps', () => {
  const frames = exportTimeline(take, 'modes').frames, events = [], steps = [];
  let seconds = 0;
  const clock = new ExportClock(frames, { advance(dt) { seconds += dt; steps.push(dt); }, setWeights(w) { events.push([seconds, w[3]]); } });
  clock.advanceTo(0); clock.advanceTo(1 / 30); clock.advanceTo(.7);
  assert.equal(events.length, 3);
  assert.ok(Math.abs(events[0][0] - .012) < 1e-10);
  assert.ok(Math.abs(events[1][0] - .018) < 1e-10);
  assert.equal(events[0][1], .4);
  assert.ok(steps.every(dt => dt <= 1 / 120));
  assert.ok(Math.abs(seconds - .7) < 1e-10);
  assert.throws(() => clock.advanceTo(0), /forward/);
});

test('video timestamps cover the exact duration without extending a partial last frame', () => {
  const frames = videoFrameTimes(1.015);
  assert.equal(frames.length, 31);
  assert.equal(frames[30].time, 1);
  assert.ok(Math.abs(frames[30].duration - .015) < 1e-10);
  assert.ok(Math.abs(frames.reduce((t, f) => t + f.duration, 0) - 1.015) < 1e-10);
});

test('offline modal samples match the live resonator, including a retrigger and release', () => {
  const spec = resonanceSpec([1, 3]), frames = [
    { time: .003, audio: [1,0] }, { time: .01, audio: [0,0] },
    { time: .014, audio: [2,1] }, { time: .02, audio: [0,0] },
  ];
  for (const interaction of ['strike', 'drive']) {
    const samples = renderModalSamples({ spec, frames, interaction, duration: .04, sampleRate: 48000 });
    const bank = new Resonator(spec); let event = 0;
    for (let n = 0; n < samples.length; n++) {
      while (event < frames.length && frames[event].time <= n / 48000) bank.setWeights(frames[event++].audio, interaction);
      bank.advance(1 / 48000);
      assert.equal(samples[n], Math.fround(bank.sample()));
    }
    assert.ok(samples.some(v => Math.abs(v) > .01));
  }
});

test('recorded holds store steady driver weights and export recreates their buildup and decay once', () => {
  const instrument = new Instrument(32), recorder = new PerformanceRecorder(32);
  recorder.start(0); instrument.press(0, 'q', 0);
  recorder.capture(0, instrument.exponents, instrument.levels);
  recorder.capture(1000, instrument.exponents, instrument.levels);
  instrument.release('q'); recorder.capture(1500, instrument.exponents, instrument.levels);
  const recording = recorder.finish(2000);
  assert.equal(recording.frames.length, 3);
  assert.equal(recording.frames[0].levels[0], 1);
  const pulse = new ModePulse(resonanceSpec(Array.from({ length: 26 }, (_, i) => i + 1)));
  const clock = new ExportClock(exportTimeline(recording, 'modes').frames, pulse);
  clock.advanceTo(.1); assert.ok(pulse.q[0] > .3 && pulse.q[0] < .5);
  clock.advanceTo(1.5); assert.ok(pulse.q[0] > .99 && pulse.q[0] < 1.01);
  clock.advanceTo(1.6); assert.ok(pulse.q[0] > 0 && pulse.q[0] < .7);
  clock.advanceTo(3); assert.equal(pulse.energy, 0);
});

test('sand export clones random state and positions without sharing mutable data', () => {
  const sand = new ChladniSand({ count: 10 });
  sand.setModes([Float32Array.from([1,2,3,4])], [1], 2); sand.setAmplitudes([1]); sand.advance(.02);
  const clone = sand.clone(); clone.setAmplitudes([1]);
  const original = [...sand.x]; clone.advance(1 / 30);
  assert.deepEqual([...sand.x], original);
  sand.advance(1 / 30);
  assert.deepEqual(clone.x, sand.x); assert.equal(clone.seed, sand.seed);
  assert.notEqual(clone.power, sand.power);
});

function fakeMedia(supported = ['avc','aac']) {
  const log = [];
  return { log, Quality: class {}, canEncodeVideo: async c => supported.includes(c), canEncodeAudio: async c => supported.includes(c),
    Mp4OutputFormat: class {}, WebMOutputFormat: class {}, BufferTarget: class { buffer = new Uint8Array([1,2,3]); },
    Output: class {
      constructor(options) { this.target = options.target; }
      addVideoTrack() {} addAudioTrack() {}
      async start() { log.push('start'); this.state = 'started'; }
      async finalize() { log.push('finalize'); this.state = 'finalized'; }
      async cancel() { log.push('cancel'); this.state = 'canceled'; }
    },
    CanvasSource: class { async add(time, duration) { log.push({time, duration}); } close() { log.push('video-close'); } },
    AudioBufferSource: class { async add() { log.push('audio'); } close() { log.push('audio-close'); } },
  };
}

test('codec selection requires a supported audio/video pair and falls back to WebM', async () => {
  assert.equal((await selectVideoFormat(fakeMedia())).mime, 'video/mp4');
  assert.equal((await selectVideoFormat(fakeMedia(['avc','opus','vp8']))).video.codec, 'vp8');
  await assert.rejects(selectVideoFormat(fakeMedia(['avc'])), /unavailable/);
  assert.equal(videoExtension('video/mp4'), 'mp4'); assert.equal(videoExtension('video/webm'), 'webm');
});

for (const outcome of ['success','cancel','failure']) test(`export ${outcome}: synchronized tracks and resource cleanup`, async () => {
  const job = new VideoExport(), media = fakeMedia(), progress = [];
  let disposed = 0, drawn = 0;
  const run = job.run({ timeline: exportTimeline(take, 'light'), audioSettings: {},
    createRenderer: () => ({ canvas: {}, setWeights() {}, advance() {}, draw() { drawn++; if(outcome==='failure')throw new Error('render failure'); }, dispose() { disposed++; } }),
    onProgress: (stage, amount) => { progress.push(amount); if(outcome==='cancel' && stage==='Rendering video')job.cancel(); },
  }, { media, renderAudio: async () => ({}), yieldUI: async () => {} });
  if (outcome === 'success') {
    const blob = await run; assert.equal(blob.type, 'video/mp4'); assert.equal(blob.size, 3);
    assert.equal(drawn, 21); assert.equal(progress.at(-1), 1);
    assert.ok(progress.every((v, i) => i === 0 || v >= progress[i-1]));
    assert.ok(media.log.indexOf('audio-close') < media.log.indexOf('video-close'));
    assert.ok(media.log.includes('finalize')); assert.ok(!media.log.includes('cancel'));
  } else {
    await assert.rejects(run, outcome === 'cancel' ? { name: 'AbortError' } : /render failure/);
    assert.ok(media.log.includes('cancel')); assert.ok(!media.log.includes('finalize'));
  }
  assert.equal(disposed, 1);
});

test('cancellation before preparation does not create a renderer or encoder', async () => {
  const job = new VideoExport(); job.cancel();
  await assert.rejects(job.run({ createRenderer: assert.fail }, { media:fakeMedia() }), { name: 'AbortError' });
});
