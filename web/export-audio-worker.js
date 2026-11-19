import { Resonator } from './resonator.js';

// The same sample-by-sample solver as the live worklet, on a cancellable worker.
export function renderModalSamples({ spec, interaction, frames, duration, sampleRate }, progress = () => {}) {
  const bank = new Resonator(spec), samples = new Float32Array(Math.ceil(duration * sampleRate));
  let event = 0;
  for (let n = 0; n < samples.length; n++) {
    while (event < frames.length && frames[event].time <= n / sampleRate) bank.setWeights(frames[event++].audio, interaction);
    bank.advance(1 / sampleRate); samples[n] = bank.sample();
    if (n % sampleRate === 0) progress(n / samples.length);
  }
  return samples;
}

if (typeof WorkerGlobalScope !== 'undefined' && globalThis instanceof WorkerGlobalScope) {
  self.onmessage = ({ data }) => {
    try {
      const samples = renderModalSamples(data, progress => self.postMessage({ progress }));
      self.postMessage({ samples }, [samples.buffer]);
    } catch (error) { self.postMessage({ error: error.message }); }
  };
}
