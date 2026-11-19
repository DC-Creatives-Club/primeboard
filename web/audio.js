import { KEYS, validateExponents } from './color.js';

const DEFAULT_TONE_FREQUENCIES = Object.freeze(KEYS.map(key => key.audioHz));
export const BASE_AMPLITUDE = 0.18;
export const AUDIO_START_TIMEOUT_MS = 8000;
function awaitAudioStart(operation, message) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), AUDIO_START_TIMEOUT_MS);
    Promise.resolve(operation).then(value => { clearTimeout(timer); resolve(value); },
      error => { clearTimeout(timer); reject(error); });
  });
}
export function toneAmplitudes(exponents, keyCount = KEYS.length) {
  validateExponents(exponents, keyCount);
  // Mean power of A sin(wt) is A²/2, so amplitude grows as sqrt(e).
  return exponents.map(e => BASE_AMPLITUDE * Math.sqrt(e));
}

export function outputLimit(sample) {
  const magnitude = Math.abs(sample);
  return magnitude <= 0.8 ? sample : Math.sign(sample) * (0.8 + 0.2 * Math.tanh((magnitude - 0.8) / 0.2));
}

// Shared by live playback and silent, offline video rendering.
export function createOutputChain(context, volume) {
  const compressor = context.createDynamicsCompressor();
  compressor.threshold.value = -8; compressor.knee.value = 8;
  compressor.ratio.value = 8; compressor.attack.value = .003; compressor.release.value = .1;
  const limiter = context.createWaveShaper();
  limiter.curve = Float32Array.from({ length: 4097 }, (_, i) => outputLimit(2 * i / 4096 - 1));
  limiter.oversample = '2x';
  const master = context.createGain(); master.gain.value = volume;
  compressor.connect(limiter); limiter.connect(master); master.connect(context.destination);
  return { compressor, limiter, master };
}

export class Synth {
  constructor() { this.context = null; this.voices = new Map(); this.sequenceVoices = new Set(); this.enabled = false; this.volume = 0.25; this.frequencies = DEFAULT_TONE_FREQUENCIES; this.enableGeneration = 0; }
  async enable() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Audio is not supported in this browser.');
    if (!this.context) {
      this.context = new AudioContext();
      Object.assign(this, createOutputChain(this.context, this.volume));
    }
    const generation = this.enableGeneration;
    // Each user gesture gets a fresh synchronous resume call. Sharing this
    // promise would strand a later Play tap behind an unauthorized touch/scroll.
    const resumed = awaitAudioStart(this.context.resume(), 'Audio did not start. Tap Play again to retry.');
    await Promise.all([resumed, this.prepareResonator()]);
    if (this.context.state !== 'running') throw new Error('Audio is paused by the browser. Tap Play again to retry.');
    if (generation === this.enableGeneration) this.enabled = true;
  }
  async prepareResonator() {
    if (this.resonatorNode) return Promise.resolve();
    if (!this.resonatorLoading) {
      this.resonatorLoading = awaitAudioStart(
        this.context.audioWorklet.addModule(new URL('./resonator-worklet.js', import.meta.url)),
        'The sound engine did not load. Tap Play again to retry.',
      ).then(() => {
        this.resonatorNode = new AudioWorkletNode(this.context, 'primeboard-resonator', { outputChannelCount: [1] });
        this.resonatorNode.connect(this.compressor);
        if (this.model) {
          this.resonatorNode.port.postMessage({ type: 'configure', spec: this.model, interaction: this.interaction });
          // Preserve a short first tap made while the worklet module was loading.
          if (this.pendingWeights?.length) {
            const first = this.pendingWeights[0].time, now = this.context.currentTime;
            this.resonatorNode.port.postMessage({ type: 'sequence', events: this.pendingWeights.map(event => ({ ...event, time: now + event.time - first })) });
            this.pendingWeights = [];
          }
        }
      }).catch(error => { this.resonatorLoading = null; throw error; });
    }
    return this.resonatorLoading;
  }
  disable() { this.enableGeneration++; this.enabled = false; this.stop(); }
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(0.5, Number.isFinite(volume) ? volume : 0));
    if (this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
  }
  setModel(spec, interaction = 'drive', frequencies = DEFAULT_TONE_FREQUENCIES) {
    if (!frequencies.length || frequencies.some(f => !Number.isFinite(f) || f <= 0)) throw new RangeError('Expected positive tone frequencies.');
    if (this.model === spec && this.interaction === interaction && frequencies.length === this.frequencies.length && frequencies.every((f, i) => f === this.frequencies[i])) return false;
    this.stop();
    this.model = spec; this.interaction = interaction;
    this.frequencies = [...frequencies];
    if (spec) this.resonatorNode?.port.postMessage({ type: 'configure', spec, interaction });
    return true;
  }
  sync(exponents) {
    if (!this.enabled || !this.context) return;
    if (this.model) {
      if (this.resonatorNode) this.resonatorNode.port.postMessage({ type: 'weights', weights: exponents });
      else (this.pendingWeights ??= []).push({ time: this.context.currentTime, weights: [...exponents] });
      return;
    }
    const now = this.context.currentTime;
    // Sum independent power-weighted tones. A compressor and final soft limiter
    // handle loud combinations after mixing, separately from the spectral model.
    const amplitudes = toneAmplitudes(exponents, this.frequencies.length);
    exponents.forEach((e, i) => {
      let voice = this.voices.get(i);
      if (!e && voice) { this.release(i); return; }
      if (!e) return;
      if (!voice) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = this.frequencies[i];
        gain.gain.value = 0;
        oscillator.connect(gain); gain.connect(this.compressor); oscillator.start();
        voice = { oscillator, gain }; this.voices.set(i, voice);
      }
      voice.gain.gain.setTargetAtTime(amplitudes[i], now, 0.015);
    });
  }
  release(i) {
    const voice = this.voices.get(i);
    if (!voice) return;
    const now = this.context.currentTime;
    voice.gain.gain.cancelScheduledValues(now);
    voice.gain.gain.setTargetAtTime(0, now, 0.015);
    voice.oscillator.stop(now + 0.1);
    voice.oscillator.onended = () => { voice.oscillator.disconnect(); voice.gain.disconnect(); };
    this.voices.delete(i);
  }
  scheduleSequence(frames, startAt, beatsPerSecond) {
    this.stop();
    if (!this.enabled || !this.context) return;
    const fromBeat = frames[0].beat;
    if (this.model) {
      this.resonatorNode.port.postMessage({ type: 'sequence', events: frames.map(frame => ({ time: startAt + (frame.beat - fromBeat) / beatsPerSecond, weights: frame.exponents })) });
      return;
    }
    const finish = startAt + (frames.at(-1).beat - fromBeat) / beatsPerSecond;
    this.frequencies.forEach((frequency, i) => {
      if (!frames.some(frame => frame.exponents[i])) return;
      const oscillator = this.context.createOscillator();
      const gain = this.context.createGain();
      oscillator.type = 'sine'; oscillator.frequency.value = frequency;
      gain.gain.value = 0;
      oscillator.connect(gain); gain.connect(this.compressor);
      const voice = { oscillator, gain };
      this.sequenceVoices.add(voice);
      oscillator.onended = () => {
        oscillator.disconnect(); gain.disconnect(); this.sequenceVoices.delete(voice);
      };
      let previous = 0;
      for (const frame of frames) {
        const power = frame.exponents[i];
        if (power === previous) continue;
        const when = startAt + (frame.beat - fromBeat) / beatsPerSecond;
        gain.gain.setTargetAtTime(BASE_AMPLITUDE * Math.sqrt(power), when, .008);
        previous = power;
      }
      oscillator.start(startAt); oscillator.stop(finish + .1);
    });
  }
  stopSequence() {
    this.pendingWeights = [];
    this.resonatorNode?.port.postMessage({ type: 'reset' });
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const voice of this.sequenceVoices) {
      // Cancel future notes too, including a sequence whose start is still pending.
      voice.gain.gain.cancelScheduledValues(now);
      voice.gain.gain.setTargetAtTime(0, now, .008);
      voice.oscillator.stop(now + .05);
    }
    this.sequenceVoices.clear();
  }
  stop() { for (const i of [...this.voices.keys()]) this.release(i); this.stopSequence(); }
}
