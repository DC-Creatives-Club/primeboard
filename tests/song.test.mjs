import test from 'node:test';
import assert from 'node:assert/strict';
import { KEYS, primeProduct, validateExponents } from '../web/color.js';
import { ODE_TO_JOY, SongPlayer, songSpectrum, songFrames } from '../web/song.js';
import { Synth, BASE_AMPLITUDE } from '../web/audio.js';

test('the complete theme fits the keyboard and ends in silence', () => {
  const song = ODE_TO_JOY;
  assert.equal(song.beats, 64);
  assert.equal(song.beats * 60 / song.bpm, 40);
  for (const note of song.notes) {
    assert.ok(Number.isInteger(note.key) && note.key >= 0 && note.key < KEYS.length);
    assert.ok(note.start >= 0 && note.start < note.end && note.end <= song.beats);
  }
  for (const { exponents } of songFrames(song)) validateExponents(exponents);
  assert.equal(primeProduct(songSpectrum(song, song.beats)), 1n);
});

test('melody, harmony, and repeated-note articulation share an exact integer spectrum', () => {
  // Opening E4 (prime 59, power 2) over C3/E3/G3 (2, 11, 19).
  assert.equal(primeProduct(songSpectrum(ODE_TO_JOY, 0)), 1455058n);
  assert.equal(primeProduct(songSpectrum(ODE_TO_JOY, .9)), 418n);
  assert.equal(primeProduct(songSpectrum(ODE_TO_JOY, 1)), 1455058n);
  const unison = { beats: 4, notes: [
    { key: 0, start: 0, end: 2, power: 2 },
    { key: 0, start: 1, end: 3, power: 1 },
  ] };
  assert.equal(primeProduct(songSpectrum(unison, 1)), 8n);
  assert.equal(primeProduct(songSpectrum(unison, 2)), 2n);
});

test('resuming a held chord starts with its current power and includes all later note-offs', () => {
  const frames = songFrames(ODE_TO_JOY, 4.5);
  assert.equal(frames[0].beat, 4.5);
  assert.deepEqual(frames[0].exponents, songSpectrum(ODE_TO_JOY, 4.5));
  assert.ok(frames.every((f, i) => !i || f.beat > frames[i - 1].beat));
  assert.equal(frames.at(-1).beat, 64);
  assert.ok(frames.at(-1).exponents.every(e => e === 0));
});

test('audio-clock transport preserves position across pause, resume, and tempo changes', () => {
  const player = new SongPlayer(ODE_TO_JOY);
  player.play(100); assert.equal(player.update(100.625), 1);
  player.pause(101.25); assert.equal(player.beat, 2);
  assert.equal(player.update(400), 2);
  player.play(500); assert.equal(player.update(499.98), 2); // scheduled start is ahead
  assert.equal(player.update(500.625), 3);
  player.setRate(1.25, 500.625); assert.equal(player.beat, 3);
  assert.equal(player.update(501.625), 5);
  player.update(1000); assert.equal(player.state, 'ended'); assert.equal(player.beat, 64);
  player.play(1001); assert.equal(player.update(1001), 0);
  player.stop(); assert.equal(player.state, 'idle'); assert.equal(player.update(10000), 0);
  assert.throws(() => player.setRate(NaN, 0));
});

test('song audio schedules power on the audio clock and cancels every future voice on stop', () => {
  const synth = new Synth();
  const oscillators = [], gains = [];
  synth.enabled = true;
  synth.context = {
    currentTime: 10,
    createOscillator() {
      const oscillator = { frequency: {}, connect() {}, disconnect() {},
        start(time) { this.started = time; }, stop(time) { this.stopped = time; } };
      oscillators.push(oscillator); return oscillator;
    },
    createGain() {
      const gain = { connect() {}, disconnect() {}, gain: { events: [],
        setTargetAtTime(value, time) { this.events.push({ value, time }); },
        cancelScheduledValues(time) { this.cancelled = time; } } };
      gains.push(gain); return gain;
    },
  };
  const frames = songFrames(ODE_TO_JOY);
  synth.scheduleSequence(frames, 10.03, 1.6);
  assert.ok(oscillators.length > 1);
  assert.ok(oscillators.every(o => o.started === 10.03 && Math.abs(o.stopped - 50.13) < 1e-8));
  const melody = oscillators.findIndex(o => o.frequency.value === KEYS[16].audioHz);
  assert.equal(gains[melody].gain.events[0].value, BASE_AMPLITUDE * Math.sqrt(2));
  assert.equal(gains[melody].gain.events[0].time, 10.03);
  synth.context.currentTime = 11;
  synth.stopSequence();
  assert.ok(gains.every(g => g.gain.cancelled === 11 && g.gain.events.at(-1).value === 0));
  assert.ok(oscillators.every(o => o.stopped === 11.05));
  assert.equal(synth.sequenceVoices.size, 0);
});
