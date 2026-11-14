import { KEYS, validateExponents } from './color.js';

export const BASE_AMPLITUDE = 0.18;
export function toneAmplitudes(exponents) {
  validateExponents(exponents);
  // Mean power of A sin(wt) is A²/2, so amplitude grows as sqrt(e).
  return exponents.map(e => BASE_AMPLITUDE * Math.sqrt(e));
}

export function outputLimit(sample) {
  const magnitude = Math.abs(sample);
  return magnitude <= 0.8 ? sample : Math.sign(sample) * (0.8 + 0.2 * Math.tanh((magnitude - 0.8) / 0.2));
}

export class Synth {
  constructor() { this.context = null; this.voices = new Map(); this.enabled = false; this.volume = 0.25; }
  async enable() {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) throw new Error('Audio is not supported in this browser.');
    if (!this.context) {
      this.context = new AudioContext();
      this.compressor = this.context.createDynamicsCompressor();
      this.compressor.threshold.value = -8;
      this.compressor.knee.value = 8;
      this.compressor.ratio.value = 8;
      this.compressor.attack.value = 0.003;
      this.compressor.release.value = 0.1;
      this.limiter = this.context.createWaveShaper();
      this.limiter.curve = Float32Array.from({ length: 4097 }, (_, i) => outputLimit(2 * i / 4096 - 1));
      this.limiter.oversample = '2x';
      this.master = this.context.createGain();
      this.master.gain.value = this.volume;
      this.compressor.connect(this.limiter);
      this.limiter.connect(this.master);
      this.master.connect(this.context.destination);
    }
    await this.context.resume();
    this.enabled = true;
  }
  disable() { this.enabled = false; this.stop(); }
  setVolume(volume) {
    this.volume = Math.max(0, Math.min(0.5, Number.isFinite(volume) ? volume : 0));
    if (this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.02);
  }
  sync(exponents) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    // Sum independent power-weighted tones. A compressor and final soft limiter
    // handle loud combinations after mixing, separately from the spectral model.
    const amplitudes = toneAmplitudes(exponents);
    exponents.forEach((e, i) => {
      let voice = this.voices.get(i);
      if (!e && voice) { this.release(i); return; }
      if (!e) return;
      if (!voice) {
        const oscillator = this.context.createOscillator();
        const gain = this.context.createGain();
        oscillator.type = 'sine';
        oscillator.frequency.value = KEYS[i].audioHz;
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
  stop() { for (const i of [...this.voices.keys()]) this.release(i); }
}
