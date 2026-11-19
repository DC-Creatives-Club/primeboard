import { BASE_AMPLITUDE, createOutputChain } from './audio.js';
import { EXPORT_SAMPLE_RATE } from './export-timeline.js';

function modalSamples(options, signal, progress) {
  return new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const worker = new Worker(new URL('./export-audio-worker.js', import.meta.url), { type: 'module' });
    const finish = (error, samples) => {
      worker.terminate(); signal.removeEventListener('abort', abort);
      if (error) reject(error); else resolve(samples);
    };
    const abort = () => finish(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    worker.onerror = event => finish(new Error(event.message || 'Audio rendering failed.'));
    worker.onmessage = ({ data }) => {
      if (data.error) finish(new Error(data.error));
      else if (data.samples) finish(null, data.samples);
      else progress(data.progress * .85);
    };
    worker.postMessage(options);
  });
}

export async function renderExportAudio(timeline, settings, signal, progress) {
  signal.throwIfAborted();
  if (!globalThis.OfflineAudioContext) throw new Error('Offline audio is unavailable. Try a current Chrome, Edge, or Safari browser.');
  const sampleRate = EXPORT_SAMPLE_RATE;
  const context = new OfflineAudioContext(1, Math.ceil(timeline.duration * sampleRate), sampleRate);
  const { compressor } = createOutputChain(context, settings.volume);
  if (settings.spec) {
    const samples = await modalSamples({ ...timeline, ...settings, sampleRate }, signal, progress);
    signal.throwIfAborted();
    const buffer = context.createBuffer(1, samples.length, sampleRate);
    buffer.copyToChannel(samples, 0);
    const source = context.createBufferSource(); source.buffer = buffer;
    source.connect(compressor); source.start();
  } else {
    settings.frequencies.forEach((frequency, index) => {
      if (!timeline.frames.some(frame => frame.audio[index])) return;
      const oscillator = context.createOscillator(), gain = context.createGain();
      oscillator.frequency.value = frequency; gain.gain.value = 0;
      oscillator.connect(gain); gain.connect(compressor);
      let previous = 0;
      for (const frame of timeline.frames) {
        const power = frame.audio[index];
        if (power === previous) continue;
        gain.gain.setTargetAtTime(BASE_AMPLITUDE * Math.sqrt(power), frame.time, .008);
        previous = power;
      }
      oscillator.start(0); oscillator.stop(timeline.noteEnd + .1);
    });
  }
  signal.throwIfAborted(); progress(.9);
  // OfflineAudioContext has no close/cancel API. On cancellation, discard its
  // result; it is never connected to a speaker. The costly modal worker above
  // is terminated immediately. All listeners are released in either case.
  return new Promise((resolve, reject) => {
    const abort = () => reject(signal.reason);
    signal.addEventListener('abort', abort, { once: true });
    context.startRendering().then(buffer => {
      signal.removeEventListener('abort', abort);
      if (signal.aborted) reject(signal.reason);
      else { progress(1); resolve(buffer); }
    }, error => { signal.removeEventListener('abort', abort); reject(error); });
  });
}
