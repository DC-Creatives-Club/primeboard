import { KEYS, MAX_EXPONENT } from './color.js';

// Beethoven's 16-bar theme, transposed G -> C from Mutopia #528's soprano.
// Durations are quarter-note beats. Harmony is a simple Primeboard arrangement.
const melodyBars = [
  [[64,1],[64,1],[65,1],[67,1]], [[67,1],[65,1],[64,1],[62,1]],
  [[60,1],[60,1],[62,1],[64,1]], [[64,1.5],[62,.5],[62,2]],
  [[64,1],[64,1],[65,1],[67,1]], [[67,1],[65,1],[64,1],[62,1]],
  [[60,1],[60,1],[62,1],[64,1]], [[62,1.5],[60,.5],[60,2]],
  [[62,1],[62,1],[64,1],[60,1]], [[62,1],[64,.5],[65,.5],[64,1],[60,1]],
  [[62,1],[64,.5],[65,.5],[64,1],[62,1]], [[60,1],[62,1],[55,2]],
  [[64,1],[64,1],[65,1],[67,1]], [[67,1],[65,1],[64,1],[62,1]],
  [[60,1],[60,1],[62,1],[64,1]], [[62,1.5],[60,.5],[60,2]],
];
const harmonies = ['C','G','C','G', 'C','G','C','C', 'G','C','G','G', 'C','G','C','C'];
const chords = { C: [48,52,55], G: [50,55,59] };
const notes = [];
melodyBars.forEach((bar, measure) => {
  let start = measure * 4;
  for (const [midi, duration] of bar) {
    notes.push({ key: midi - 48, start, end: start + duration - Math.min(.12, duration * .15), power: 2 });
    start += duration;
  }
  for (const midi of chords[harmonies[measure]]) {
    notes.push({ key: midi - 48, start: measure * 4, end: (measure + 1) * 4 - .12, power: 1 });
  }
});

export const ODE_TO_JOY = Object.freeze({
  title: 'Ode to Joy', composer: 'Ludwig van Beethoven', bpm: 96, beats: 64,
  source: 'https://www.mutopiaproject.org/cgibin/piece-info.cgi?id=528',
  notes: Object.freeze(notes.map(note => Object.freeze(note))),
});

export function songSpectrum(song, beat) {
  const exponents = KEYS.map(() => 0);
  for (const note of song.notes) {
    if (note.start <= beat && beat < note.end) {
      exponents[note.key] = Math.min(MAX_EXPONENT, exponents[note.key] + note.power);
    }
  }
  return exponents;
}

// Aggregate simultaneous voices before sound synthesis, including unisons.
export function songFrames(song, fromBeat = 0) {
  const boundaries = new Set([fromBeat, song.beats]);
  for (const note of song.notes) {
    if (note.start > fromBeat) boundaries.add(note.start);
    if (note.end > fromBeat) boundaries.add(note.end);
  }
  return [...boundaries].sort((a, b) => a - b)
    .map(beat => ({ beat, exponents: songSpectrum(song, beat) }));
}

// The audio clock drives both transport and visuals; no accumulated timer drift.
export class SongPlayer {
  constructor(song) { this.song = song; this.beat = 0; this.rate = 1; this.state = 'idle'; this.anchor = 0; }
  get beatsPerSecond() { return this.song.bpm * this.rate / 60; }
  play(now) {
    if (this.state === 'ended') this.beat = 0;
    this.startBeat = this.beat;
    this.anchor = now - this.beat / this.beatsPerSecond;
    this.state = 'playing';
  }
  update(now) {
    if (this.state === 'playing') {
      this.beat = Math.max(this.startBeat, Math.min(this.song.beats, (now - this.anchor) * this.beatsPerSecond));
      if (this.beat >= this.song.beats) this.state = 'ended';
    }
    return this.beat;
  }
  pause(now) {
    this.update(now);
    if (this.state === 'playing') this.state = 'paused';
  }
  stop() { this.beat = 0; this.state = 'idle'; }
  setRate(rate, now) {
    if (!Number.isFinite(rate) || rate < .5 || rate > 2) throw new RangeError('Invalid song speed.');
    this.update(now);
    this.rate = rate;
    this.anchor = now - this.beat / this.beatsPerSecond;
  }
}
