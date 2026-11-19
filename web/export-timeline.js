import { validateRecording } from './recording.js';
import { fitKeyWeights } from './instrument.js';
import { cantorAudioWeights, CANTOR_STATE_SIZE } from './cantor.js';

export const EXPORT_FPS = 30;
export const EXPORT_TAIL = .6;
export const EXPORT_SAMPLE_RATE = 48000;

export function exportTimeline(recording, view, operation) {
  const take = validateRecording(recording);
  const tonal = view === 'light' || view === 'cantor';
  const count = view === 'cantor' ? CANTOR_STATE_SIZE : 26;
  const frames = take.frames.map(frame => {
    const weights = fitKeyWeights(tonal ? frame.exponents : frame.levels, count);
    return { time: frame.beat, weights, audio: view === 'cantor' ? cantorAudioWeights(weights, operation) : weights };
  });
  return { frames, duration: take.duration + EXPORT_TAIL, noteEnd: take.duration };
}

// Deliver every event, including taps shorter than a video frame, at its exact
// recorded time. A separate simulation clock never consults wall-clock time.
export class ExportClock {
  constructor(frames, target) { this.frames = frames; this.target = target; this.index = 0; this.time = 0; }
  advanceTo(time) {
    if (time < this.time) throw new RangeError('Export time must move forward.');
    while (this.index < this.frames.length && this.frames[this.index].time <= time) {
      const frame = this.frames[this.index++];
      this.advance(frame.time - this.time);
      this.target.setWeights(frame.weights);
    }
    this.advance(time - this.time);
  }
  advance(dt) {
    // Fixed upper bound also avoids the live renderers' catch-up caps.
    while (dt > 1e-10) {
      const step = Math.min(dt, 1 / 120);
      this.target.advance(step); this.time += step; dt -= step;
    }
  }
}

export function videoFrameTimes(duration, fps = EXPORT_FPS) {
  return Array.from({ length: Math.ceil(duration * fps) }, (_, index) => ({
    time: index / fps, duration: Math.min(1 / fps, duration - index / fps),
  }));
}
