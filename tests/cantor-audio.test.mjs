import test from 'node:test';
import assert from 'node:assert/strict';
import { CANTOR_PREFIXES, CANTOR_KEYS, CANTOR_STATE_SIZE, CANTOR_FREQUENCIES, cantorFrequency, cantorAudioWeights as resolveAudio, intersectPrefixes, unionPrefixes } from '../web/cantor.js';
import { Synth, BASE_AMPLITUDE } from '../web/audio.js';
import { KEYS } from '../web/color.js';
import { Instrument, fitKeyWeights } from '../web/instrument.js';
import { PerformanceRecorder, recordingSong } from '../web/recording.js';
import { songFrames } from '../web/song.js';

const cantorAudioWeights = weights => resolveAudio(weights, 'intersection');
const weights = (...prefixes) => Array.from({ length: CANTOR_STATE_SIZE }, (_, i) => prefixes.includes(CANTOR_PREFIXES[i] ?? null) ? 1 : 0);
const tones = (...prefixes) => CANTOR_PREFIXES.map(prefix => prefixes.includes(prefix) ? 1 : 0);
const numberWeights = (...prefixes) => fitKeyWeights(weights(...prefixes));
const index = prefix => CANTOR_PREFIXES.indexOf(prefix);

function audioRig() {
  const synth = new Synth(), oscillators = [], gains = [];
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
  synth.setModel(null, 'strike', CANTOR_FREQUENCIES);
  return { synth, oscillators, gains };
}

test('binary-tree harmonics distinguish prefixes and place each depth in the next octave', () => {
  for (const [prefix, hz] of [['', 110], ['0', 220], ['1', 330], ['00', 440], ['10', 660], ['101', 1430]]) {
    assert.equal(cantorFrequency(prefix), hz);
  }
  assert.equal(new Set(CANTOR_FREQUENCIES).size, 31);
  assert.deepEqual(CANTOR_FREQUENCIES.slice(26), [2970, 3080, 3190, 3300, 3410]);
  for (const prefix of CANTOR_PREFIXES) {
    const hz = cantorFrequency(prefix);
    assert.equal(hz % 110, 0);
    assert.ok(hz >= 110 * 2 ** prefix.length && hz < 110 * 2 ** (prefix.length + 1));
    assert.equal(cantorFrequency(prefix + '0'), 2 * hz);
    assert.equal(cantorFrequency(prefix + '1'), 2 * hz + 110);
  }
});

test('every key pair sounds only its intersection, with silence distinct from the root tone', () => {
  assert.deepEqual(cantorAudioWeights(weights()), tones());
  assert.deepEqual(cantorAudioWeights(weights('')), tones(''));
  assert.deepEqual(cantorAudioWeights(weights(null)), tones());
  for (const a of CANTOR_PREFIXES) for (const b of CANTOR_PREFIXES) {
    const result = intersectPrefixes([a, b]);
    assert.deepEqual(cantorAudioWeights(weights(a, b)), result === null ? tones() : tones(result));
    assert.deepEqual(cantorAudioWeights(weights(a, b, null)), tones());
  }
  assert.deepEqual(cantorAudioWeights(weights('', '1', '10', '101', '1010')), tones('1010'));
  assert.deepEqual(cantorAudioWeights(weights(...CANTOR_PREFIXES)), tones());
  const held = weights('10', '101').map(value => value * 32);
  assert.deepEqual(cantorAudioWeights(held), tones('101'));
  assert.equal(held[index('10')], 32); // Sound conversion does not alter input state.
});

test('live Cantor sound follows holds, incompatible chords, release, sustain and clear', () => {
  const { synth, oscillators } = audioRig(), instrument = new Instrument(CANTOR_STATE_SIZE);
  const sync = () => synth.sync(cantorAudioWeights(instrument.exponents));
  instrument.press(index('10'), 'KeyY', 0); sync();
  assert.equal(synth.voices.get(index('10')).oscillator.frequency.value, 660);
  instrument.press(index('101'), 'KeyD', 10); sync();
  assert.deepEqual([...synth.voices.keys()], [index('101')]);
  assert.equal(synth.voices.get(index('101')).oscillator.frequency.value, 1430);
  const voice = synth.voices.get(index('101'));
  instrument.tick(5000); sync();
  assert.equal(synth.voices.get(index('101')), voice);
  assert.equal(voice.gain.gain.events.at(-1).value, BASE_AMPLITUDE);
  instrument.press(index('001'), 'KeyO', 5001); sync();
  assert.equal(synth.voices.size, 0);
  assert.equal(voice.gain.gain.events.at(-1).value, 0);
  assert.ok(oscillators.every(oscillator => oscillator.stopped <= synth.context.currentTime + .1));
  instrument.release('KeyO'); sync();
  assert.equal(synth.voices.get(index('101')).oscillator.frequency.value, 1430);
  instrument.setSustain(true); instrument.release('KeyY'); instrument.release('KeyD'); sync();
  assert.deepEqual([...synth.voices.keys()], [index('101')]);
  instrument.setSustain(false); sync();
  assert.equal(synth.voices.size, 0);
  instrument.press(index(''), 'KeyQ', 6000); sync();
  assert.equal(synth.voices.get(0).oscillator.frequency.value, 110);
  instrument.clear(); sync();
  assert.equal(synth.voices.size, 0);
});

test('recording and export scheduling preserve harmonic tones, empty intersections and resume timing', () => {
  const recorder = new PerformanceRecorder(CANTOR_STATE_SIZE);
  recorder.start(0);
  for (const [time, prefixes] of [[0, []], [250, ['10']], [500, ['10', '101']], [750, ['10', '101', '001']], [1000, ['10', '101']]]) {
    const input = weights(...prefixes);
    recorder.capture(time, input, input);
  }
  const song = recordingSong(recorder.finish(1250));
  const frames = from => songFrames(song, from).map(frame => ({ ...frame, exponents: cantorAudioWeights(frame.exponents) }));
  const { synth, oscillators, gains } = audioRig();
  synth.scheduleSequence(frames(0), 10.03, 1);
  assert.deepEqual(oscillators.map(oscillator => oscillator.frequency.value), [660, 1430]);
  const events = gains[1].gain.events;
  assert.deepEqual(events.map(event => event.value), [BASE_AMPLITUDE, 0, BASE_AMPLITUDE, 0]);
  assert.deepEqual(events.map(event => Number((event.time - 10.03).toFixed(3))), [.5, .75, 1, 1.25]);
  const resumed = audioRig();
  resumed.synth.scheduleSequence(frames(.9), 20.03, 1);
  assert.deepEqual(resumed.oscillators.map(oscillator => oscillator.frequency.value), [1430]);
  assert.ok(Math.abs(resumed.gains[0].gain.events[0].time - 20.13) < 1e-9);
});

test('switching sine mappings releases old live and scheduled voices and restores Number pitches', () => {
  const { synth, oscillators, gains } = audioRig();
  synth.sync(cantorAudioWeights(weights('101')));
  const original = synth.voices.get(index('101'));
  assert.equal(synth.setModel(null, 'strike', [...CANTOR_FREQUENCIES]), false);
  assert.equal(synth.voices.get(index('101')), original);
  assert.equal(synth.setModel(null, 'strike'), true);
  assert.equal(original.gain.gain.events.at(-1).value, 0);
  synth.sync(numberWeights('101'));
  assert.equal(synth.voices.get(index('101')).oscillator.frequency.value, KEYS[index('101')].audioHz);
  synth.scheduleSequence([{ beat: 0, exponents: numberWeights('101') }, { beat: 2, exponents: numberWeights() }], 10.03, 1);
  assert.equal(oscillators.at(-1).frequency.value, KEYS[index('101')].audioHz);
  synth.context.currentTime = 10.5;
  assert.equal(synth.setModel(null, 'strike', CANTOR_FREQUENCIES), true);
  assert.equal(synth.sequenceVoices.size, 0);
  assert.equal(gains.at(-1).gain.cancelled, 10.5);
  assert.equal(gains.at(-1).gain.events.at(-1).value, 0);
  synth.sync(cantorAudioWeights(weights('10', '101')));
  assert.equal(synth.voices.get(index('101')).oscillator.frequency.value, 1430);
});

test('punctuation tones and the empty-set key remain compatible with recorded playback', () => {
  const recorder = new PerformanceRecorder(CANTOR_STATE_SIZE);
  recorder.start(0);
  for (const [time, prefixes] of [[0, ['1111']], [250, ['1111', null]], [500, ['1111']], [750, ['1', '1111']]]) {
    const input = weights(...prefixes); recorder.capture(time, input, input);
  }
  const frames = songFrames(recordingSong(recorder.finish(1000)), 0);
  const { synth, oscillators, gains } = audioRig();
  synth.sync(cantorAudioWeights(weights('1111')));
  assert.equal(synth.voices.get(30).oscillator.frequency.value, 3410);
  synth.sync(cantorAudioWeights(weights('1111', null)));
  assert.equal(synth.voices.size, 0);
  synth.scheduleSequence(frames.map(frame => ({ ...frame, exponents: cantorAudioWeights(frame.exponents) })), 10.03, 1);
  assert.equal(oscillators.at(-1).frequency.value, 3410);
  assert.deepEqual(gains.at(-1).gain.events.map(event => event.value), [BASE_AMPLITUDE, 0, BASE_AMPLITUDE, 0]);
  synth.setModel(null, 'strike');
  synth.scheduleSequence(frames.map(frame => ({ ...frame, exponents: fitKeyWeights(frame.exponents) })), 12, 1);
  assert.equal(synth.sequenceVoices.size, 1); // Only the shared letter E sounds in Number.
  assert.equal(oscillators.at(-1).frequency.value, KEYS[2].audioHz);
  assert.deepEqual(gains.at(-1).gain.events.map(event => event.time), [12.75, 13]);
});

test('legacy recordings pad silent punctuation and frequency table resizing stops retired voices', () => {
  const recorder = new PerformanceRecorder(); recorder.start(0);
  const input = numberWeights('101'); recorder.capture(0, input, input);
  const frames = songFrames(recordingSong(recorder.finish(1000)), 0).map(frame => ({ ...frame, exponents: cantorAudioWeights(fitKeyWeights(frame.exponents, CANTOR_STATE_SIZE)) }));
  const { synth, oscillators } = audioRig(); synth.scheduleSequence(frames, 10, 1);
  assert.deepEqual(oscillators.map(oscillator => oscillator.frequency.value), [1430]);
  synth.sync(cantorAudioWeights(weights('1111')));
  assert.equal(synth.setModel(null, 'strike', CANTOR_FREQUENCIES.slice(0, 26)), true);
  assert.equal(synth.voices.size, 0); assert.equal(synth.sequenceVoices.size, 0);
});

test('every union key pair sounds its canonical cover, including unpressed parent tones', () => {
  for (const a of CANTOR_PREFIXES) for (const b of CANTOR_PREFIXES) {
    assert.deepEqual(resolveAudio(weights(a, b)), tones(...unionPrefixes([a, b])));
  }
  assert.deepEqual(resolveAudio(weights('10', '101')), tones('10'));
  assert.deepEqual(resolveAudio(weights('100', '101')), tones('10'));
  assert.deepEqual(resolveAudio(weights('100', '001')), tones('100', '001'));
  assert.deepEqual(resolveAudio(weights(...CANTOR_PREFIXES)), tones(''));
  assert.deepEqual(resolveAudio(weights()), tones());
  assert.deepEqual(resolveAudio(weights('10', '101').map(value => value * 32)), tones('10'));
});

test('live union and intersection switches release old voices and sustain follows the current result', () => {
  const { synth } = audioRig(), instrument = new Instrument(CANTOR_STATE_SIZE);
  let operation = 'union';
  const sync = () => synth.sync(resolveAudio(instrument.exponents, operation));
  instrument.press(index('100'), 'KeyS', 0); instrument.press(index('001'), 'KeyO', 0); sync();
  assert.deepEqual([...synth.voices.keys()], [index('001'), index('100')]);
  operation = 'intersection'; sync(); assert.equal(synth.voices.size, 0);
  operation = 'union'; sync(); assert.equal(synth.voices.size, 2);
  instrument.release('KeyO'); instrument.press(index('101'), 'KeyD', 1); sync();
  assert.deepEqual([...synth.voices.keys()], [index('10')]);
  assert.equal(synth.voices.get(index('10')).oscillator.frequency.value, 660);
  instrument.setSustain(true); instrument.release('KeyS'); instrument.release('KeyD'); sync();
  assert.deepEqual([...synth.voices.keys()], [index('10')]);
  instrument.setSustain(false); sync(); assert.equal(synth.voices.size, 0);
});

test('recorded and exported sequences use the selected operation, with correct resume scheduling', () => {
  const recorder = new PerformanceRecorder(CANTOR_STATE_SIZE); recorder.start(0);
  for (const [time, prefixes] of [[0, ['100', '101']], [250, ['100', '101', '001']], [500, ['10', '101']]]) {
    const input = weights(...prefixes); recorder.capture(time, input, input);
  }
  const song = recordingSong(recorder.finish(750));
  const frames = (operation, from = 0) => songFrames(song, from).map(frame => ({ ...frame, exponents: resolveAudio(frame.exponents, operation) }));
  const { synth, oscillators, gains } = audioRig();
  synth.scheduleSequence(frames('union'), 10.03, 1);
  assert.deepEqual(oscillators.map(oscillator => oscillator.frequency.value), [660, 990]);
  assert.deepEqual(gains[1].gain.events.map(event => Number((event.time - 10.03).toFixed(3))), [.25, .5]);
  synth.context.currentTime = 10.4;
  synth.scheduleSequence(frames('intersection', .37), 10.43, 1);
  assert.equal(gains[0].gain.cancelled, 10.4);
  assert.equal(gains[1].gain.cancelled, 10.4);
  assert.equal(synth.sequenceVoices.size, 1);
  assert.equal(oscillators.at(-1).frequency.value, 1430);
  assert.ok(Math.abs(gains.at(-1).gain.events[0].time - 10.56) < 1e-9);
  synth.scheduleSequence(frames('union', .6), 11, 1);
  assert.equal(synth.sequenceVoices.size, 1);
  assert.equal(oscillators.at(-1).frequency.value, 660);
  assert.equal(gains.at(-1).gain.events[0].time, 11);
});
